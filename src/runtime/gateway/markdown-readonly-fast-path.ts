import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

import type { GatewayRequest, ToolPayload } from '../runtime-types.js';
import { sha1 } from '../workspace-task-runner.js';

const EXECUTION_TOOL_ID = 'sciforge.markdown-readonly-fast-path';

export async function tryRunMarkdownReadonlyFastPath(request: GatewayRequest): Promise<ToolPayload | undefined> {
  if (!explicitMarkdownReadonlyQuestion(request.prompt)) return undefined;
  const workspace = resolve(request.workspacePath || process.cwd());
  const targets = explicitMarkdownPathsFromPrompt(request.prompt)
    .filter((rel) => safeWorkspaceMarkdownPath(workspace, rel))
    .slice(0, 4);
  if (!targets.length) return undefined;

  const readArtifacts = [];
  for (const rel of targets) {
    const path = safeWorkspaceMarkdownPath(workspace, rel);
    if (!path) continue;
    const markdown = await readExistingMarkdown(path);
    if (!markdown) continue;
    readArtifacts.push({ rel, markdown });
  }
  if (!readArtifacts.length) return undefined;

  const message = markdownReadonlyAnswer(request.prompt, readArtifacts);
  const id = sha1(JSON.stringify({
    prompt: request.prompt,
    refs: readArtifacts.map((item) => item.rel),
    message,
  })).slice(0, 12);

  return {
    message,
    confidence: 0.82,
    claimType: 'markdown-readonly-answer',
    evidenceLevel: 'workspace-read',
    reasoningTrace: [
      'Explicit markdown read-only fast path handled a bounded artifact follow-up.',
      'The answer is scoped to markdown paths named in the current prompt, so stale selected/current refs cannot override the user target.',
      'No workspace files are written by this fast path.',
    ].join('\n'),
    displayIntent: {
      protocolStatus: 'protocol-success',
      taskOutcome: 'satisfied',
      status: 'completed',
    },
    claims: [{
      id: `markdown-readonly-${id}`,
      text: `Answered from ${readArtifacts.length} explicitly named markdown workspace file(s) without writeback.`,
      type: 'fact',
      confidence: 0.82,
      evidenceLevel: 'workspace-read',
      supportingRefs: readArtifacts.map((item) => `file:${item.rel}`),
      opposingRefs: [],
    }],
    uiManifest: [{
      componentId: 'report-viewer',
      artifactRef: `markdown-readonly-${id}`,
      priority: 1,
    }],
    executionUnits: [{
      id: `EU-markdown-readonly-${id}`,
      status: 'done',
      tool: EXECUTION_TOOL_ID,
      outputRef: `runtime://markdown-readonly/${id}`,
      artifacts: [`markdown-readonly-${id}`],
      summary: 'Answered a bounded read-only markdown artifact follow-up from explicitly named workspace files.',
    }],
    artifacts: [{
      id: `markdown-readonly-${id}`,
      type: 'runtime-context-summary',
      title: 'Markdown read-only answer',
      dataRef: `runtime://markdown-readonly/${id}`,
      data: {
        markdown: message,
        sourceRefs: readArtifacts.map((item) => `file:${item.rel}`),
      },
      metadata: {
        source: 'markdown-readonly-fast-path',
        sourceRefs: readArtifacts.map((item) => `file:${item.rel}`),
      },
    }],
    objectReferences: readArtifacts.map((item, index) => ({
      id: `file-markdown-readonly-${index + 1}-${sha1(item.rel).slice(0, 8)}`,
      kind: 'file',
      title: basename(item.rel),
      ref: `file:${item.rel}`,
      status: 'available',
      summary: firstUsefulLine(item.markdown) ?? 'Markdown artifact read for a bounded follow-up.',
    })),
    verificationResults: [{
      id: 'markdown-readonly-no-writeback',
      verdict: 'pass',
      confidence: 0.82,
      evidenceRefs: readArtifacts.map((item) => `file:${item.rel}`),
      repairHints: [],
      diagnostics: { runtime: EXECUTION_TOOL_ID, fileCount: readArtifacts.length },
    }],
  };
}

function explicitMarkdownReadonlyQuestion(prompt: string) {
  if (!/\.md\b|markdown|artifact|file|report|document|产物|文件|报告|文档/i.test(prompt)) return false;
  if (!explicitMarkdownPathsFromPrompt(prompt).length) return false;
  const explicitReadonly = /read[-\s]?only|only read|do not (?:write|save|rewrite|update|modify|edit)|without (?:writing|saving|modifying)|no writeback|只读|不要(?:写入|写回|保存|重写|更新|修改|编辑)/i.test(prompt);
  const asksQuestion = /\b(?:what|which|whether|does|how|why|summari[sz]e|list|audit|check|explain|state|name)\b|总结|列出|说明|解释|检查|审计|指出|回答/i.test(prompt);
  const asksMutation = /\b(?:write\s*back|overwrite|persist|save|update|revise|rewrite|edit|modify|replace|regenerate)\b|写回|写入|覆盖|保存|更新|修订|重写|改写|修改|替换|重新生成/i.test(prompt);
  return explicitReadonly || (asksQuestion && !asksMutation);
}

function explicitMarkdownPathsFromPrompt(prompt: string) {
  const rawExplicit = [...prompt.matchAll(/(?:file:)?(?:[\w.-]+\/)+[\w.-]+\.md\b|(?:file:)?[\w.-]+\.md\b/g)]
    .map((match) => normalizeRelPath(match[0]))
    .filter((value): value is string => Boolean(value));
  const baseDir = rawExplicit.map((item) => item.split('/').slice(0, -1).join('/')).find(Boolean);
  return uniqueStrings(rawExplicit.map((item) => !item.includes('/') && baseDir ? `${baseDir}/${item}` : item));
}

function normalizeRelPath(value: string) {
  const clean = value.replace(/^file:/i, '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('..') || clean.startsWith('.sciforge/')) return undefined;
  return clean;
}

function safeWorkspaceMarkdownPath(workspace: string, rel: string) {
  if (!/\.md$/i.test(rel)) return undefined;
  const path = isAbsolute(rel) ? resolve(rel) : resolve(workspace, rel);
  return path === workspace || path.startsWith(`${workspace}/`) ? path : undefined;
}

async function readExistingMarkdown(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

function markdownReadonlyAnswer(prompt: string, artifacts: Array<{ rel: string; markdown: string }>) {
  const wantsBullets = /\b(?:bullets?|points?)\b|要点|条目/i.test(prompt);
  const sections = artifacts.map((artifact) => answerForMarkdownArtifact(prompt, artifact));
  if (artifacts.length === 1 && wantsBullets) return sections[0]!;
  return sections.join('\n\n');
}

function answerForMarkdownArtifact(prompt: string, artifact: { rel: string; markdown: string }) {
  const requestedSections = requestedMarkdownSections(prompt, artifact.markdown);
  if (requestedSections.length) {
    return [
      `Read-only answer from file:${artifact.rel}; no workspace writeback was performed.`,
      ...requestedSections.map((section) => `- ${section.heading}: ${section.body}`),
    ].join('\n');
  }
  const constraints = currentConstraints(artifact.markdown);
  const budget = budgetSummary(artifact.markdown);
  const prohibited = prohibitedTermsFromPrompt(prompt);
  const staleTermsAbsent = prohibited.filter((term) => !termInMarkdown(artifact.markdown, term));
  const risk = remainingRisk(artifact.markdown);

  return [
    `Read-only answer from file:${artifact.rel}; no workspace writeback was performed.`,
    `- Active constraints: ${constraints || budget || 'the artifact does not expose a dedicated Current Constraints section.'}`,
    `- Change from the prior version: ${changeSummary(constraints, staleTermsAbsent, prohibited)}`,
    `- Remaining risk: ${risk}`,
  ].join('\n');
}

function requestedMarkdownSections(prompt: string, markdown: string) {
  return markdownHeadings(markdown)
    .filter((heading) => heading.level <= 3 && heading.body && promptMentionsHeading(prompt, heading.heading))
    .map((heading) => ({ heading: heading.heading, body: summarizeSectionBody(heading.body) }))
    .slice(0, 6);
}

function markdownHeadings(markdown: string) {
  const matches = [...markdown.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? markdown.length : markdown.length;
    return {
      level: match[1]?.length ?? 1,
      heading: match[2]?.trim().replace(/#+$/, '').trim() ?? '',
      body: markdown.slice(start, end).trim(),
    };
  }).filter((heading) => heading.heading);
}

function promptMentionsHeading(prompt: string, heading: string) {
  const normalizedHeading = normalizeHeadingText(heading);
  if (!normalizedHeading) return false;
  const normalizedPrompt = normalizeHeadingText(prompt);
  if (normalizedPrompt.includes(normalizedHeading)) return true;
  const compactHeading = normalizedHeading.replace(/\s+/g, '');
  return compactHeading.length >= 4 && normalizedPrompt.replace(/\s+/g, '').includes(compactHeading);
}

function normalizeHeadingText(value: string) {
  return value.toLowerCase().replace(/[`*_#:[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function summarizeSectionBody(body: string) {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
    .map((line) => line.replace(/[.。；;]+$/g, ''))
    .filter(Boolean)
    .filter((line) => !/^[-:| ]+$/.test(line));
  if (!lines.length) return 'section is present but empty.';
  return lines.slice(0, 6).join('; ');
}

function currentConstraints(markdown: string) {
  const body = markdownSectionBody(markdown, 'Current Constraints');
  if (!body) return undefined;
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .join('; ');
}

function budgetSummary(markdown: string) {
  const body = markdownSectionBody(markdown, 'Budget');
  if (!body) return undefined;
  const total = body.match(/\*\*\$?([\d,]+)\*\*|\$\s*([\d,]+)/);
  const categories = body
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line) && !/Category|---|\*\*Total/i.test(line))
    .map((line) => line.split('|')[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  return [
    total ? `Budget: $${total[1] ?? total[2]}` : undefined,
    categories ? `Budget categories: ${categories}` : undefined,
  ].filter(Boolean).join('; ');
}

function markdownSectionBody(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'im').exec(markdown);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + match[0].length;
  const next = /^##\s+\S.*$/im.exec(markdown.slice(start));
  return markdown.slice(start, next && next.index !== undefined ? start + next.index : markdown.length).trim();
}

function prohibitedTermsFromPrompt(prompt: string) {
  const lines = prompt.split(/\n|。|；|;/).filter((line) => /do not|remove old|old constraints|不要|移除旧|删除旧/i.test(line));
  return uniqueStrings(lines.flatMap((line) => [
    ...[...line.matchAll(/\$?\s*\d{1,3}(?:,\d{3})+\s*(?:USD)?/gi)].map((match) => normalizeTerm(match[0])),
    ...[...line.matchAll(/\b\d{1,2}\s*months?\b/gi)].map((match) => normalizeTerm(match[0])),
    ...[...line.matchAll(/\b\d+(?:\.\d+)?\s*FTE\b/gi)].map((match) => normalizeTerm(match[0])),
    ...arbitraryProhibitedTermsFromLine(line),
  ])).slice(0, 20);
}

function arbitraryProhibitedTermsFromLine(line: string) {
  const afterMarker = line.replace(/^.*?(?:old constraints?|old terms?|remove old|do not show|must not appear|不要出现|移除旧|删除旧)[:：]?\s*/i, '');
  return afterMarker
    .split(/(?<!\d),(?!\d)|，|、|(?:\s+and\s+)|(?:\s+or\s+)|或|和/)
    .map((item) => normalizeArbitraryTerm(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeTerm(value: string) {
  return value.replace(/^\$\s*/, '').replace(/\s*USD$/i, '').replace(/\s+/g, ' ').trim();
}

function normalizeArbitraryTerm(value: string) {
  const term = value
    .replace(/\b(?:old|stale|constraints?|terms?|requested|remove|removed|show|appear|were)\b/gi, ' ')
    .replace(/[.。]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (term.length < 3 || term.length > 80) return undefined;
  if (/^(?:and|or|或|和|与|old|stale)$/i.test(term)) return undefined;
  return term;
}

function termInMarkdown(markdown: string, term: string) {
  const normalized = normalizeTerm(term);
  if (!normalized) return false;
  return new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i').test(markdown);
}

function changeSummary(constraints: string | undefined, staleTermsAbsent: string[], prohibitedTerms: string[]) {
  const parts = [];
  if (constraints) parts.push('the artifact now records the active constraint set in `Current Constraints`');
  if (prohibitedTerms.length) {
    parts.push(staleTermsAbsent.length === prohibitedTerms.length
      ? 'the old terms requested for removal are absent'
      : `some old terms are still present and need review (${prohibitedTerms.filter((term) => !staleTermsAbsent.includes(term)).join(', ')})`);
  }
  return parts.join('; ') || 'the current artifact content is available, but the prompt did not name prior constraints to compare.';
}

function remainingRisk(markdown: string) {
  const hasOwners = /\b(owner|assignee|responsible|负责人)\b/i.test(markdown);
  const hasEvidence = /\b(evidence|validation|source|ref|doi|pmid|证据|验证|来源)\b/i.test(markdown);
  if (!hasOwners) return 'ownership/accountability is not explicit in the artifact.';
  if (!hasEvidence) return 'the artifact needs stronger evidence or validation references.';
  return 'the artifact should still be checked against downstream deliverables for consistency.';
}

function firstUsefulLine(markdown: string) {
  return markdown.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/^#/.test(line));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
