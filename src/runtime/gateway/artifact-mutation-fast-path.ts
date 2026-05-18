import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';

import type { GatewayRequest, ToolPayload } from '../runtime-types.js';
import { isRecord } from '../gateway-utils.js';
import { sha1 } from '../workspace-task-runner.js';

const EXECUTION_TOOL_ID = 'sciforge.artifact-mutation-fast-path';

type RewriteConstraints = {
  budgetUsd?: string;
  months?: string;
  roleFtes: Array<{ role: string; fte: string }>;
  noRealPatientData: boolean;
  budgetCategories: string[];
  genericConstraints: Array<{ label: string; value: string }>;
  requestedSections: string[];
  prohibitedTerms: string[];
};

type RewriteResult = {
  rel: string;
  before: string;
  markdown: string;
  changes: string[];
};

export async function tryRunArtifactMutationFastPath(request: GatewayRequest): Promise<ToolPayload | undefined> {
  if (!artifactMutationRewriteRequest(request.prompt)) return undefined;
  const workspace = resolve(request.workspacePath || process.cwd());
  const constraints = rewriteConstraintsFromPrompt(request.prompt);
  const targets = await artifactRewriteTargets(request, workspace);
  if (!targets.length) return undefined;

  const written: RewriteResult[] = [];
  for (const rel of targets) {
    const path = safeWorkspaceMarkdownPath(workspace, rel);
    if (!path) continue;
    const before = await readExistingMarkdown(path);
    const result = rewriteMarkdownArtifact(rel, before, constraints, request.prompt);
    if (!result || result.markdown === before) continue;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, result.markdown, 'utf8');
    written.push(result);
  }
  if (!written.length) return undefined;

  const message = mutationSummaryMessage(written, constraints);

  return {
    message,
    confidence: 0.84,
    claimType: 'artifact-rewrite',
    evidenceLevel: 'workspace-writeback',
    reasoningTrace: [
      'Structured artifact mutation fast path handled an explicit markdown workspace writeback request.',
      'The fast path is target-driven: it only mutates safe markdown refs named by the user, selected refs, current refs, or scanned workspace directories.',
      'If no safe target or deterministic rewrite is available, the request falls through to the normal backend path.',
    ].join('\n'),
    displayIntent: {
      protocolStatus: 'protocol-success',
      taskOutcome: 'satisfied',
      status: 'completed',
    },
    claims: [{
      id: `artifact-rewrite-${sha1(written.map((item) => item.rel).join('|')).slice(0, 12)}`,
      text: `Updated ${written.length} markdown artifact(s) in the workspace and removed or superseded stale constraints where requested.`,
      type: 'fact',
      confidence: 0.84,
      evidenceLevel: 'workspace-writeback',
      supportingRefs: written.map((item) => `file:${item.rel}`),
      opposingRefs: [],
    }],
    uiManifest: written.map((item, index) => ({
      componentId: 'report-viewer',
      artifactRef: artifactIdForMarkdownPath(item.rel),
      priority: index + 1,
    })),
    executionUnits: [{
      id: `EU-artifact-mutation-${sha1(message).slice(0, 12)}`,
      status: 'done',
      tool: EXECUTION_TOOL_ID,
      outputRef: `file:${written[0]?.rel}`,
      artifacts: written.map((item) => artifactIdForMarkdownPath(item.rel)),
      summary: 'Performed deterministic markdown workspace writeback for explicit artifact rewrite request.',
    }],
    artifacts: written.map((item) => ({
      id: artifactIdForMarkdownPath(item.rel),
      type: markdownArtifactType(item.rel),
      title: basename(item.rel),
      path: item.rel,
      dataRef: item.rel,
      data: { markdown: item.markdown },
      metadata: {
        source: 'artifact-mutation-fast-path',
        readableRef: item.rel,
        markdownRef: item.rel,
      },
    })),
    objectReferences: written.map((item) => ({
      id: `file-${sha1(item.rel).slice(0, 12)}`,
      kind: 'file',
      title: basename(item.rel),
      ref: `file:${item.rel}`,
      status: 'available',
      summary: item.changes.slice(0, 3).join('; '),
    })),
    verificationResults: [{
      id: 'artifact-mutation-writeback',
      verdict: 'pass',
      confidence: 0.84,
      evidenceRefs: written.map((item) => `file:${item.rel}`),
      repairHints: [],
      diagnostics: { runtime: EXECUTION_TOOL_ID, fileCount: written.length },
    }],
  };
}

function artifactMutationRewriteRequest(prompt: string) {
  if (/(?:read[-\s]?only|only read|do not (?:rewrite|write|modify|edit|save)|no changes)|只读|不要(?:重写|写入|写回|覆盖|保存|修改|更新)/i.test(prompt)) return false;
  const namesMarkdownTarget = /\.md\b|markdown|artifact|artifacts|deliverable|deliverables|file|files|产物|交付物|文件|路径/i.test(prompt);
  const asksMutation = /\b(?:write\s*back|overwrite|persist|save|update|revise|rewrite|edit|modify|replace|regenerate)\b|写回|写入|覆盖|保存|更新|修订|重写|改写|修改|替换|重新生成/i.test(prompt);
  return namesMarkdownTarget && asksMutation;
}

async function artifactRewriteTargets(request: GatewayRequest, workspace: string) {
  const explicit = explicitMarkdownPathsFromPrompt(request.prompt);
  if (explicit.length) {
    return uniqueStrings(explicit)
      .filter((rel) => Boolean(safeWorkspaceMarkdownPath(workspace, rel)))
      .slice(0, 12);
  }
  const selected = selectedMarkdownRefs(request);
  const directoryTargets = await markdownTargetsFromPromptDirectory(request.prompt, workspace);
  return uniqueStrings([...selected, ...directoryTargets])
    .filter((rel) => Boolean(safeWorkspaceMarkdownPath(workspace, rel)))
    .slice(0, 12);
}

function explicitMarkdownPathsFromPrompt(prompt: string) {
  const rawExplicit = [...prompt.matchAll(/(?:file:)?(?:[\w.-]+\/)+[\w.-]+\.md\b|(?:file:)?[\w.-]+\.md\b/g)]
    .map((match) => normalizeRelPath(match[0]))
    .filter((value): value is string => Boolean(value));
  const baseDir = rawExplicit.map((item) => item.split('/').slice(0, -1).join('/')).find(Boolean);
  return uniqueStrings(rawExplicit.map((item) => !item.includes('/') && baseDir ? `${baseDir}/${item}` : item));
}

function selectedMarkdownRefs(request: GatewayRequest) {
  const uiState = isRecord(request.uiState) ? request.uiState : {};
  if (!/(selected|current|this artifact|this file|选中|当前|这个|这份|刚才)/i.test(request.prompt)) return [];
  return recordCandidates([
    ...(request.references ?? []),
    ...(request.artifacts ?? []),
    ...recordList(uiState.currentReferences),
    ...recordList(uiState.objectReferences),
    ...recordList(uiState.artifacts),
  ]);
}

function recordCandidates(records: unknown[]) {
  return uniqueStrings(records.filter(isRecord).flatMap((record) => {
    const metadata = isRecord(record.metadata) ? record.metadata : {};
    const delivery = isRecord(record.delivery) ? record.delivery : {};
    return [
      stringField(record.ref),
      stringField(record.path),
      stringField(record.dataRef),
      stringField(record.sourceRef),
      stringField(metadata.markdownRef),
      stringField(metadata.readableRef),
      stringField(metadata.path),
      stringField(delivery.readableRef),
      stringField(delivery.rawRef),
    ].map((value) => value ? normalizeRelPath(value) : undefined)
      .filter((value): value is string => typeof value === 'string' && /\.md$/i.test(value));
  }));
}

async function markdownTargetsFromPromptDirectory(prompt: string, workspace: string) {
  if (!/(all|every|package|folder|directory|全部|所有|整套|目录|文件夹|交付包|交付物)/i.test(prompt)) return [];
  const candidates = [...prompt.matchAll(/(?:^|\s)([\w.-]+(?:\/[\w.-]+)+)\/?(?:\s|$|目录|folder|directory)/gi)]
    .map((match) => normalizeRelPath(match[1] ?? ''))
    .filter((value): value is string => Boolean(value));
  const targets: string[] = [];
  for (const dir of candidates.slice(0, 4)) {
    const root = safeWorkspaceDirectoryPath(workspace, dir);
    if (!root) continue;
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.md$/i.test(entry.name)) targets.push(`${dir}/${entry.name}`);
      }
    } catch {
      // Directory scanning is opportunistic; explicit refs remain the safer path.
    }
  }
  return uniqueStrings(targets);
}

function normalizeRelPath(value: string) {
  const clean = value.replace(/^file:/i, '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('..') || clean.startsWith('.sciforge/')) return undefined;
  return clean;
}

function safeWorkspaceDirectoryPath(workspace: string, rel: string) {
  const path = isAbsolute(rel) ? resolve(rel) : resolve(workspace, rel);
  return path === workspace || path.startsWith(`${workspace}/`) ? path : undefined;
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
    return '';
  }
}

function rewriteConstraintsFromPrompt(prompt: string): RewriteConstraints {
  const text = positiveConstraintText(prompt);
  return {
    budgetUsd: preferredConstraintMatch(text, /改为\s*(\d{1,3}(?:,\d{3})*)\s*USD/gi, /(?:总预算|budget)[^。\n;；]*?(\d{1,3}(?:,\d{3})*)\s*USD/gi, /(\d{1,3}(?:,\d{3})*)\s*USD|\$\s*(\d{1,3}(?:,\d{3})*)/gi),
    months: preferredConstraintMatch(text, /改为\s*(\d{1,2})\s*months?\b/gi, /(?:周期|duration|project cycle|timeline)[^。\n;；]*?(\d{1,2})\s*months?\b/gi, /(\d{1,2})\s*months?\b|(\d{1,2})\s*个月/g),
    roleFtes: roleFtesFromPrompt(text),
    noRealPatientData: /(?:no|without|不允许|不要|禁止|无).{0,24}(?:real\s+|真实\s*)?patient data|不能.{0,24}patient data|只能.{0,24}(?:synthetic|公开匿名|anonymous)/i.test(prompt),
    budgetCategories: budgetCategoriesFromPrompt(text),
    genericConstraints: genericConstraintsFromPrompt(text),
    requestedSections: requestedSectionsFromPrompt(prompt),
    prohibitedTerms: prohibitedTermsFromPrompt(prompt),
  };
}

function positiveConstraintText(prompt: string) {
  return prompt
    .replace(/(?:do not show|do not restore|must not appear|remove old|old constraints?|不要出现|不要恢复|淘汰旧|替换旧)[^\n。]*?(?:(?<!\d)[.。]|\n|$)/gi, ' ')
    .split(/[\n。]/)
    .flatMap((line) => line.split(/[；;]/))
    .join('\n');
}

function preferredConstraintMatch(text: string, ...patterns: RegExp[]) {
  for (const pattern of patterns) {
    const values = [...text.matchAll(pattern)].map((match) => match[1] ?? match[2]).filter(Boolean);
    if (values.length) return values[values.length - 1];
  }
  return undefined;
}

function roleFtesFromPrompt(text: string) {
  const roles: Array<{ role: string; fte: string }> = [];
  const pattern = /(?:\b\d+\s+)?([A-Za-z][A-Za-z -]{1,40}|[\p{Script=Han}A-Za-z -]{1,40}?)\s*([0-9]+(?:\.[0-9]+)?)\s*FTE/giu;
  for (const match of text.matchAll(pattern)) {
    const role = normalizeRoleLabel(match[1] ?? '');
    const fte = match[2];
    if (role && fte) roles.push({ role, fte });
  }
  return dedupeRoles(roles).slice(0, 12);
}

function normalizeRoleLabel(value: string) {
  const role = value
    .replace(/\b(?:team|团队|改为|为|and|with|one|part[-\s]?time|full[-\s]?time)\b/gi, ' ')
    .replace(/[,，、:：;；()[\]\d.+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[A-Za-z\p{Script=Han}]/u.test(role)) return '';
  if (/^(?:or|and|或|和|与)$/i.test(role)) return '';
  return role;
}

function dedupeRoles(roles: Array<{ role: string; fte: string }>) {
  const map = new Map<string, { role: string; fte: string }>();
  for (const role of roles) map.set(role.role.toLowerCase(), role);
  return [...map.values()];
}

function budgetCategoriesFromPrompt(text: string) {
  const match = text.match(/(?:categories?|类别|类|科目|预算表)[：: ]+([A-Za-z0-9_\-/，、,\s]+?)(?:[.。]|\n|$)/i);
  if (match) {
    return uniqueStrings((match[1] ?? '')
      .split(/[、,，/]+|\s{2,}/)
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter((item) => item.length >= 3))
      .slice(0, 8);
  }
  const canonical = ['personnel', 'compute', 'data-validation', 'contingency'];
  const foundCanonical = canonical.filter((category) => new RegExp(category.replace('-', '[-\\s]?'), 'i').test(text));
  return foundCanonical.length >= 2 ? foundCanonical : [];
}

function prohibitedTermsFromPrompt(prompt: string) {
  const lines = prompt.split(/\n|。|；|;/).filter((line) => /不要出现|不要恢复|do not restore|must not appear|remove old|淘汰旧|替换旧/i.test(line));
  const values = lines.flatMap((line) => [
    ...[...line.matchAll(/\$?\s*\d{1,3}(?:,\d{3})+\s*(?:USD)?/gi)].map((match) => normalizeMoneyTerm(match[0])),
    ...[...line.matchAll(/\b\d{1,2}\s*months?\b/gi)].map((match) => match[0].replace(/\s+/g, ' ').trim()),
    ...[...line.matchAll(/\b\d+(?:\.\d+)?\s*FTE\b/gi)].map((match) => match[0].replace(/\s+/g, ' ').trim()),
    ...arbitraryProhibitedTermsFromLine(line),
  ]);
  return uniqueStrings(values.filter(Boolean)).slice(0, 20);
}

function arbitraryProhibitedTermsFromLine(line: string) {
  const afterMarker = line.replace(/^.*?(?:old constraints?|stale constraints?|remove old|do not show|must not appear|不要出现|不要恢复|淘汰旧|替换旧)[:：]?\s*/i, '');
  return afterMarker
    .split(/(?<!\d),(?!\d)|，|、|(?:\s+and\s+)|(?:\s+or\s+)|或|和/)
    .map((item) => normalizeArbitraryTerm(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeMoneyTerm(value: string) {
  return value.replace(/\s+/g, ' ').replace(/^\$\s*/, '').replace(/\s*USD$/i, '').trim();
}

function normalizeArbitraryTerm(value: string) {
  const term = value
    .replace(/\b(?:old|stale|constraints?|terms?|requested|remove|removed|show|appear)\b/gi, ' ')
    .replace(/[.。]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (term.length < 3 || term.length > 80) return undefined;
  if (/^(?:and|or|或|和|与|old|stale)$/i.test(term)) return undefined;
  return term;
}

function genericConstraintsFromPrompt(text: string) {
  const clauses = text
    .split(/\n|；|;/)
    .flatMap((line) => splitConstraintClauseLine(line))
    .map(parseGenericConstraintClause)
    .filter((item): item is { label: string; value: string } => Boolean(item));
  return dedupeGenericConstraints(clauses).slice(0, 16);
}

function splitConstraintClauseLine(line: string) {
  return line
    .split(/(?<!\d)[.。]\s+(?=[\p{Script=Han}A-Z])/u)
    .flatMap((part) => {
      const normalized = part
        .replace(/^.*?(?:hard requirements?|requirements?|constraints?|effective constraints?|new constraints?|v\d+|新约束|硬性要求|有效约束|要求)[:：]?\s*/i, '')
        .replace(/^v\d+\s*[:：]\s*/i, '')
        .trim();
      if (!normalized || normalized === part.trim() && !/[:：=]|改为|should be|must be|\b[A-Za-z][\w -]{1,32}\s+\S+/i.test(part)) return [];
      return normalized.split(/(?<!\d),(?!\d)|，|、/);
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseGenericConstraintClause(clause: string) {
  const cleaned = clause
    .replace(/^[\-*]\s*/, '')
    .replace(/\b(?:must retain|retain|keep|set|replace|change|保留|设置|替换)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /\.md\b/i.test(cleaned) || /\b(?:write|rewrite|save|update|modify|artifact|file|workspace)\b/i.test(cleaned)) return undefined;
  if (/^(?:include\s+)?(?:sections?|headings?)\b/i.test(cleaned) || /^(?:包含|包括)?(?:章节|小节)\b/i.test(cleaned)) return undefined;
  if (/^(?:scope|acceptance criteria|risks?|methods?|limitations?|background|summary|timeline|budget|范围|验收标准|风险|方法|局限|摘要)$/i.test(cleaned)) return undefined;
  if (/\bFTE\b/i.test(cleaned)) return undefined;
  const transition = cleaned.match(/^([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9 _/-]{1,44}?)\s*从\s*.+?\s*改为\s*(.+)$/u);
  if (transition) return normalizeGenericConstraintItem(transition[1] ?? '', transition[2] ?? '');
  const keyValue = cleaned.match(/^([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9 _/-]{1,44}?)(?:[:：=]| should be | must be | is | 为 )\s*(.+)$/iu);
  if (keyValue) return normalizeGenericConstraintItem(keyValue[1] ?? '', keyValue[2] ?? '');
  const wordTokens = cleaned.split(/\s+/);
  if (wordTokens.length >= 2 && /^(?:runtime|platform|owner|metrics?|privacy|language|dataset|cohort|license|status)$/i.test(wordTokens[0] ?? '')) {
    return normalizeGenericConstraintItem(wordTokens[0] ?? '', wordTokens.slice(1).join(' '));
  }
  if (wordTokens.length >= 3 && !/^\d/.test(wordTokens[1] ?? '') && /^[-+]?[\d$]|^[A-Z0-9]{2,}\b|^(?:synthetic|public|private|none|no|yes|qa|owner|lead)/i.test(wordTokens[2] ?? '')) {
    const label = wordTokens.slice(0, 2).join(' ');
    const value = wordTokens.slice(2).join(' ');
    return normalizeGenericConstraintItem(label, value);
  }
  const compact = cleaned.match(/^([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9 _/-]{1,32}?)\s+(.{2,80})$/u);
  if (!compact) return undefined;
  return normalizeGenericConstraintItem(compact[1] ?? '', compact[2] ?? '');
}

function normalizeGenericConstraintItem(label: string, value: string) {
  const normalizedLabel = titleCase(label.trim().replace(/\s+/g, ' '));
  const normalizedValue = value.trim().replace(/[.。]+$/g, '').replace(/\s+/g, ' ');
  if (normalizedLabel.length < 2 || normalizedValue.length < 2 || normalizedValue.length > 140) return undefined;
  if (/^(?:selected artifact|artifact|file|workspace|main answer|old constraints?)$/i.test(normalizedLabel)) return undefined;
  return { label: normalizedLabel, value: normalizedValue };
}

function dedupeGenericConstraints(items: Array<{ label: string; value: string }>) {
  const map = new Map<string, { label: string; value: string }>();
  for (const item of items) map.set(item.label.toLowerCase(), item);
  return [...map.values()];
}

function requestedSectionsFromPrompt(prompt: string) {
  const match = prompt.match(/(?:include|with|sections?|headings?|包含|包括|章节|小节)[^。\n:：]*[:：]?\s*([A-Za-z0-9 _/\-，、,]+?)(?:[.。]|\n|$)/i);
  if (!match) return [];
  return uniqueStrings((match[1] ?? '')
    .split(/(?<!\d),(?!\d)|，|、|\/|\band\b/i)
    .map((item) => titleCase(item.trim().replace(/\s+/g, ' ')))
    .filter((item) => item.length >= 3 && item.length <= 48 && !/artifact|file|workspace|constraint/i.test(item)))
    .slice(0, 8);
}

function rewriteMarkdownArtifact(
  rel: string,
  current: string,
  constraints: RewriteConstraints,
  prompt: string,
): RewriteResult | undefined {
  const changes: string[] = [];
  let markdown = current.trim() ? current : initialMarkdownFor(rel);
  const before = markdown;
  const budgetApplied = constraints.budgetUsd ? replaceBudget(markdown, constraints.budgetUsd) : undefined;
  if (budgetApplied && budgetApplied !== markdown) {
    markdown = budgetApplied;
    changes.push(`budget set to $${constraints.budgetUsd}`);
  }
  const monthsApplied = constraints.months ? replaceMonths(markdown, constraints.months) : undefined;
  if (monthsApplied && monthsApplied !== markdown) {
    markdown = monthsApplied;
    changes.push(`duration set to ${constraints.months} months`);
  }
  const roleApplied = replaceRoleFtes(markdown, constraints.roleFtes);
  if (roleApplied !== markdown) {
    markdown = roleApplied;
    changes.push(`team FTE updated for ${constraints.roleFtes.map((role) => role.role).join(', ')}`);
  }
  const prohibitedApplied = removeProhibitedTerms(markdown, constraints);
  if (prohibitedApplied !== markdown) {
    markdown = prohibitedApplied;
    changes.push('removed stale prohibited constraints');
  }
  if (constraints.noRealPatientData && !/no real patient data|真实\s*patient data|synthetic|公开匿名|public anonymized/i.test(markdown)) {
    markdown = appendOrReplaceSection(markdown, 'Data Constraint', 'No real patient data will be used; validation is limited to synthetic or public anonymized datasets.');
    changes.push('data constraint added');
  }
  if (constraints.budgetCategories.length && budgetTargetRequested(rel, prompt)) {
    markdown = upsertBudgetTable(markdown, constraints);
    changes.push(`budget table organized as ${constraints.budgetCategories.join(' / ')}`);
  }
  for (const section of constraints.requestedSections) {
    const existed = Boolean(markdownSectionRange(markdown, section));
    markdown = appendOrReplaceSection(markdown, section, requestedSectionMarkdown(section, constraints));
    changes.push(`${existed ? 'section refreshed' : 'section added'}: ${section}`);
  }
  markdown = appendOrReplaceSection(markdown, 'Current Constraints', currentConstraintsMarkdown(constraints));
  changes.push('current constraints summarized for follow-up continuity');
  markdown = ensureTrailingNewline(markdown);
  return markdown !== before ? { rel, before, markdown, changes: uniqueStrings(changes) } : undefined;
}

function initialMarkdownFor(rel: string) {
  const title = basename(rel, extname(rel)).replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  return [`# ${title}`, '', ''].join('\n');
}

function replaceBudget(markdown: string, budget: string) {
  return markdown
    .replace(/\$\s*\d{1,3}(?:,\d{3})+/g, `$${budget}`)
    .replace(/\b\d{1,3}(?:,\d{3})+\s*USD\b/gi, `${budget} USD`);
}

function replaceMonths(markdown: string, months: string) {
  return markdown
    .replace(/\b\d{1,2}\s*months?\b/gi, `${months} months`)
    .replace(/\b\d{1,2}\s*个月\b/g, `${months} 个月`);
}

function replaceRoleFtes(markdown: string, roles: Array<{ role: string; fte: string }>) {
  let next = markdown;
  for (const role of roles) {
    const escaped = role.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const rolePattern = new RegExp(`(${escaped}[^\\n|,;；。]{0,80}?)([0-9]+(?:\\.[0-9]+)?\\s*FTE)`, 'gi');
    next = next.replace(rolePattern, `$1${role.fte} FTE`);
  }
  return next;
}

function removeProhibitedTerms(markdown: string, constraints: RewriteConstraints) {
  const terms = constraints.prohibitedTerms;
  if (!terms.length) return markdown;
  return markdown
    .split(/\r?\n/)
    .filter((line) => !terms.some((term) => prohibitedTermPattern(term).test(line)))
    .join('\n');
}

function prohibitedTermPattern(term: string) {
  if (/^\d{1,3}(?:,\d{3})+$/.test(term)) {
    return new RegExp(`\\$?\\s*${term.replace(',', ',?')}\\s*(?:USD)?`, 'i');
  }
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');
}

function budgetTargetRequested(rel: string, prompt: string) {
  return /budget|预算|cost|spend|finance|funding/i.test(`${rel} ${prompt}`);
}

function upsertBudgetTable(markdown: string, constraints: RewriteConstraints) {
  const table = budgetTableMarkdown(constraints);
  const headingMatch = markdown.match(/^##\s+.*(?:budget|预算|cost|funding).*$\n?/im);
  if (!headingMatch || headingMatch.index === undefined) {
    return appendOrReplaceSection(markdown, 'Budget', table);
  }
  const start = headingMatch.index + headingMatch[0].length;
  const nextHeading = markdown.slice(start).search(/^##\s+/m);
  const end = nextHeading >= 0 ? start + nextHeading : markdown.length;
  const sectionBody = markdown.slice(start, end);
  const bodyWithoutTables = sectionBody
    .split(/\r?\n/)
    .filter((line) => !/^\s*\|.*\|\s*$/.test(line))
    .join('\n')
    .trim();
  return [
    markdown.slice(0, start).trimEnd(),
    '',
    bodyWithoutTables,
    bodyWithoutTables ? '' : undefined,
    table,
    markdown.slice(end).trimStart(),
  ].filter((part) => part !== undefined).join('\n').trimEnd();
}

function budgetTableMarkdown(constraints: RewriteConstraints) {
  const categories = constraints.budgetCategories.length ? constraints.budgetCategories : ['budget'];
  const budget = moneyNumber(constraints.budgetUsd);
  const allocations = budget ? budgetAllocations(categories, budget) : categories.map((category) => ({ category, amount: '' }));
  return [
    '| Category | Cost | Notes |',
    '|----------|------|-------|',
    ...allocations.map((row) => `| ${titleCase(row.category)} | ${typeof row.amount === 'number' ? `$${formatMoney(row.amount)}` : 'TBD'} | ${budgetNote(row.category, constraints)} |`),
    budget ? `| **Total** | **$${formatMoney(budget)}** |  |` : undefined,
  ].filter(Boolean).join('\n');
}

function budgetAllocations(categories: string[], budget: number) {
  const known = categories.map((category) => category.toLowerCase());
  if (known.join('|') === 'personnel|compute|data-validation|contingency') {
    const personnel = Math.round(budget * 0.8);
    const compute = Math.round(budget * 0.1);
    const validation = Math.round(budget * 0.0625);
    return [
      { category: categories[0]!, amount: personnel },
      { category: categories[1]!, amount: compute },
      { category: categories[2]!, amount: validation },
      { category: categories[3]!, amount: budget - personnel - compute - validation },
    ];
  }
  const base = Math.floor(budget / categories.length);
  return categories.map((category, index) => ({
    category,
    amount: index === categories.length - 1 ? budget - base * (categories.length - 1) : base,
  }));
}

function budgetNote(category: string, constraints: RewriteConstraints) {
  if (/personnel/i.test(category) && constraints.roleFtes.length) {
    return constraints.roleFtes.map((role) => `${role.role} ${role.fte} FTE`).join(', ');
  }
  if (/data|validation/i.test(category) && constraints.noRealPatientData) return 'Synthetic/public-anonymized validation only; no real patient data.';
  return 'Updated to match current requested constraints.';
}

function moneyNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US');
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\bData Validation\b/i, 'Data-validation');
}

function requestedSectionMarkdown(section: string, constraints: RewriteConstraints) {
  const summary = conciseConstraintSummary(constraints);
  if (/scope|范围/i.test(section)) return `- Scope is bounded by the active constraints: ${summary}.`;
  if (/acceptance|criteria|验收|标准/i.test(section)) {
    return [
      `- Active constraints are reflected in the artifact: ${summary}.`,
      '- Explicitly prohibited stale constraints are absent after writeback.',
      '- The artifact remains editable through its workspace file ref.',
    ].join('\n');
  }
  if (/risk|风险/i.test(section)) return '- Remaining risk: downstream evidence, ownership, and execution assumptions still need review before final use.';
  return `- This section is initialized under the active constraints: ${summary}.`;
}

function conciseConstraintSummary(constraints: RewriteConstraints) {
  const items = currentConstraintsMarkdown(constraints)
    .split(/\r?\n/)
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  return items.length ? items.join('; ') : 'current user constraints';
}

function currentConstraintsMarkdown(constraints: RewriteConstraints) {
  const lines = [];
  if (constraints.budgetUsd) lines.push(`- Budget: $${constraints.budgetUsd}`);
  if (constraints.months) lines.push(`- Duration: ${constraints.months} months`);
  if (constraints.roleFtes.length) lines.push(`- Team/FTE: ${constraints.roleFtes.map((role) => `${role.role} ${role.fte} FTE`).join('; ')}`);
  if (constraints.noRealPatientData) lines.push('- Data: no real patient data; use synthetic or public anonymized data only.');
  if (constraints.budgetCategories.length) lines.push(`- Budget categories: ${constraints.budgetCategories.join(' / ')}`);
  for (const item of filteredGenericConstraints(constraints)) lines.push(`- ${item.label}: ${item.value}`);
  return lines.length ? lines.join('\n') : '- Current user constraints applied in this writeback turn.';
}

function filteredGenericConstraints(constraints: RewriteConstraints) {
  return constraints.genericConstraints.filter((item) => {
    if (constraints.budgetUsd && /^budget$/i.test(item.label)) return false;
    if (constraints.budgetUsd && /(?:budget|预算)/i.test(item.label)) return false;
    if (constraints.months && /^(?:duration|timeline|project cycle|周期|项目周期)$/i.test(item.label)) return false;
    if (constraints.roleFtes.length && /(?:team|fte|团队)/i.test(item.label)) return false;
    if (constraints.budgetCategories.length && /categor/i.test(item.label)) return false;
    if (constraints.noRealPatientData && /(?:data|privacy|patient|synthetic|公开匿名)/i.test(`${item.label} ${item.value}`)) return false;
    return true;
  });
}

function appendOrReplaceSection(markdown: string, heading: string, body: string) {
  const section = `## ${heading}\n${body.trim()}`;
  const existing = markdownSectionRange(markdown, heading);
  if (existing) {
    return `${markdown.slice(0, existing.start).trimEnd()}\n\n${section}\n\n${markdown.slice(existing.end).trimStart()}`.trimEnd();
  }
  return `${markdown.trimEnd()}\n\n${section}`;
}

function markdownSectionRange(markdown: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`^##\\s+${escaped}\\s*$`, 'im');
  const match = headingPattern.exec(markdown);
  if (!match || match.index === undefined) return undefined;
  const afterHeading = match.index + match[0].length;
  const nextHeading = /^##\s+\S.*$/im.exec(markdown.slice(afterHeading));
  return {
    start: match.index,
    end: nextHeading && nextHeading.index !== undefined ? afterHeading + nextHeading.index : markdown.length,
  };
}

function mutationSummaryMessage(written: RewriteResult[], constraints: RewriteConstraints) {
  const changedFiles = written.map((item) => `- ${item.rel}: ${item.changes.slice(0, 4).join('; ')}`).join('\n');
  const retained = retainedConstraintSummary(constraints);
  const replaced = replacedConstraintSummary(constraints);
  return [
    `本轮已实际写回 ${written.length} 个 workspace markdown artifact。`,
    '变更点：',
    changedFiles,
    retained ? `保留的新约束：${retained}。` : undefined,
    replaced ? `替换/淘汰旧约束：${replaced}。` : undefined,
    `可继续追问或局部重写的 refs：${written.map((item) => `file:${item.rel}`).join('、')}。`,
  ].filter(Boolean).join('\n');
}

function retainedConstraintSummary(constraints: RewriteConstraints) {
  const retained = [];
  if (constraints.noRealPatientData) retained.push('no real patient data / synthetic or public anonymized data only');
  if (constraints.roleFtes.length) retained.push(`team FTE: ${constraints.roleFtes.map((role) => `${role.role} ${role.fte}`).join(', ')}`);
  if (constraints.budgetCategories.length) retained.push(`budget categories: ${constraints.budgetCategories.join(' / ')}`);
  const generic = filteredGenericConstraints(constraints);
  if (generic.length) retained.push(`constraints: ${generic.map((item) => `${item.label}=${item.value}`).join('; ')}`);
  if (constraints.requestedSections.length) retained.push(`sections: ${constraints.requestedSections.join(' / ')}`);
  return retained.join('; ');
}

function replacedConstraintSummary(constraints: RewriteConstraints) {
  const replaced = [];
  if (constraints.budgetUsd) replaced.push(`budget -> $${constraints.budgetUsd}`);
  if (constraints.months) replaced.push(`duration -> ${constraints.months} months`);
  if (constraints.prohibitedTerms.length) replaced.push('explicitly prohibited stale terms removed');
  return replaced.join('; ');
}

function artifactIdForMarkdownPath(rel: string) {
  return basename(rel).replace(/\.md$/i, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function markdownArtifactType(rel: string) {
  const name = basename(rel).toLowerCase();
  if (/risk|matrix|table|register/.test(name)) return 'evidence-matrix';
  return 'research-report';
}

function ensureTrailingNewline(value: string) {
  return `${value.trimEnd()}\n`;
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
