import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

import type { GatewayRequest, ToolPayload } from '../runtime-types.js';
import { sha1 } from '../workspace-task-runner.js';
import {
  explicitMarkdownPathsFromPrompt,
  markdownReadonlyBulletPreference,
  markdownReadonlyQuestionPolicy,
  prohibitedTermsFromMarkdownPrompt,
  requestedMarkdownSectionsFromPrompt,
} from '../../../packages/contracts/runtime/markdown-artifact-policy.js';

const EXECUTION_TOOL_ID = 'sciforge.markdown-readonly-fast-path';

export async function tryRunMarkdownReadonlyFastPath(request: GatewayRequest): Promise<ToolPayload | undefined> {
  if (!markdownReadonlyQuestionPolicy(request.prompt)) return undefined;
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
  const wantsBullets = markdownReadonlyBulletPreference(prompt);
  const sections = artifacts.map((artifact) => answerForMarkdownArtifact(prompt, artifact));
  if (artifacts.length === 1 && wantsBullets) return sections[0]!;
  return sections.join('\n\n');
}

function answerForMarkdownArtifact(prompt: string, artifact: { rel: string; markdown: string }) {
  const requestedSections = requestedMarkdownSectionsFromPrompt(prompt, artifact.markdown);
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
  return prohibitedTermsFromMarkdownPrompt(prompt);
}

function normalizeTerm(value: string) {
  return value.replace(/^\$\s*/, '').replace(/\s*USD$/i, '').replace(/\s+/g, ' ').trim();
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
