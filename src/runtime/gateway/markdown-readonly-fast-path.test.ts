import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { GatewayRequest } from '../runtime-types.js';
import { tryRunMarkdownReadonlyFastPath } from './markdown-readonly-fast-path.js';

test('markdown read-only fast path answers from explicit markdown path and ignores stale refs', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-markdown-readonly-'));
  await mkdir(join(workspace, 'generic-eval'), { recursive: true });
  await mkdir(join(workspace, 'p6-mini-grant'), { recursive: true });
  await writeFile(join(workspace, 'generic-eval', 'design-note.md'), [
    '# Design Note',
    '',
    '## Budget',
    '| Category | Cost | Notes |',
    '|----------|------|-------|',
    '| Personnel | $18,000 | analyst 0.25 FTE, engineer 0.35 FTE |',
    '| Software | $18,000 | Updated to match current requested constraints. |',
    '| Validation | $18,000 | Updated to match current requested constraints. |',
    '| Contingency | $18,000 | Updated to match current requested constraints. |',
    '| **Total** | **$72,000** | |',
    '',
    '## Current Constraints',
    '- Budget: $72,000',
    '- Duration: 8 months',
    '- Team/FTE: analyst 0.25 FTE; engineer 0.35 FTE',
    '- Budget categories: personnel / software / validation / contingency',
  ].join('\n'), 'utf8');
  await writeFile(join(workspace, 'p6-mini-grant', 'timeline-budget.md'), 'Stale p6 ref that must not be used.\n', 'utf8');
  const before = await readFile(join(workspace, 'generic-eval', 'design-note.md'), 'utf8');

  const payload = await tryRunMarkdownReadonlyFastPath({
    skillDomain: 'literature',
    workspacePath: workspace,
    artifacts: [],
    references: [{ kind: 'file', ref: 'file:p6-mini-grant/timeline-budget.md', title: 'timeline-budget.md' }],
    uiState: {
      currentReferences: [{ kind: 'file', ref: 'file:p6-mini-grant/timeline-budget.md', title: 'timeline-budget.md' }],
    },
    prompt: [
      'Selected artifact: generic-eval/design-note.md.',
      'Read only; do not write, save, rewrite, update, or modify files.',
      'Summarize in 3 bullets what changed from v1 to v2, state the active constraints, and name one remaining risk.',
      'Old constraints were 60,000 USD, 6 months, 0.2 FTE, 0.3 FTE.',
    ].join(' '),
  } as GatewayRequest);

  assert.ok(payload);
  assert.equal(payload?.displayIntent?.taskOutcome, 'satisfied');
  assert.equal(payload?.claimType, 'markdown-readonly-answer');
  assert.match(payload?.message ?? '', /file:generic-eval\/design-note\.md/);
  assert.match(payload?.message ?? '', /Budget: \$72,000/);
  assert.match(payload?.message ?? '', /Duration: 8 months/);
  assert.match(payload?.message ?? '', /personnel \/ software \/ validation \/ contingency/);
  assert.match(payload?.message ?? '', /old terms requested for removal are absent/);
  assert.doesNotMatch(payload?.message ?? '', /timeline-budget|p6-mini-grant|Stale p6/);
  assert.equal(await readFile(join(workspace, 'generic-eval', 'design-note.md'), 'utf8'), before);
});

test('markdown read-only fast path does not intercept writeback requests', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-markdown-readonly-nointercept-'));
  await mkdir(join(workspace, 'generic-eval'), { recursive: true });
  await writeFile(join(workspace, 'generic-eval', 'design-note.md'), '# Design Note\n', 'utf8');

  const payload = await tryRunMarkdownReadonlyFastPath({
    skillDomain: 'knowledge',
    workspacePath: workspace,
    artifacts: [],
    prompt: 'Rewrite generic-eval/design-note.md and write back with a new budget table.',
  } as GatewayRequest);

  assert.equal(payload, undefined);
});

test('markdown read-only fast path reports arbitrary old constraints as absent', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-markdown-readonly-arbitrary-'));
  await mkdir(join(workspace, 'repro-audit'), { recursive: true });
  await writeFile(join(workspace, 'repro-audit', 'audit.md'), [
    '# Reproducibility Audit',
    '',
    '## Current Constraints',
    '- Runtime: Python 3.11',
    '- Sample Size: 48',
    '- Privacy: synthetic data only',
    '- Metrics: AUROC and calibration',
    '- Owner: QA lead',
  ].join('\n'), 'utf8');

  const payload = await tryRunMarkdownReadonlyFastPath({
    skillDomain: 'knowledge',
    workspacePath: workspace,
    artifacts: [],
    prompt: [
      'Selected artifact: repro-audit/audit.md.',
      'Read only; do not write, save, rewrite, update, or modify files.',
      'Summarize what changed and state whether old constraints are gone.',
      'Old constraints were Python 3.10, sample size 24, accuracy only, owner TBD.',
    ].join(' '),
  } as GatewayRequest);

  assert.ok(payload);
  assert.match(payload?.message ?? '', /Runtime: Python 3\.11/);
  assert.match(payload?.message ?? '', /Sample Size: 48/);
  assert.match(payload?.message ?? '', /old terms requested for removal are absent/i);
  assert.doesNotMatch(payload?.message ?? '', /Python 3\.10|sample size 24|accuracy only|owner TBD/);
});

test('markdown read-only fast path answers requested sections instead of generic constraint template', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-markdown-readonly-sections-'));
  await mkdir(join(workspace, 'repro-audit'), { recursive: true });
  await writeFile(join(workspace, 'repro-audit', 'audit.md'), [
    '# Reproducibility Audit',
    '',
    '## Scope',
    '- Validate the ingestion pipeline.',
    '',
    '## Acceptance Criteria',
    '- Python 3.11 environment is reproducible.',
    '- Calibration metric is reported.',
    '',
    '## Risks',
    '- Synthetic data may not capture deployment drift.',
  ].join('\n'), 'utf8');

  const payload = await tryRunMarkdownReadonlyFastPath({
    skillDomain: 'knowledge',
    workspacePath: workspace,
    artifacts: [],
    prompt: [
      'Read only repro-audit/audit.md.',
      'Do not write or modify files.',
      'List the Acceptance Criteria and Risks sections.',
    ].join(' '),
  } as GatewayRequest);

  assert.ok(payload);
  assert.match(payload?.message ?? '', /Acceptance Criteria: Python 3\.11 environment is reproducible; Calibration metric is reported/);
  assert.match(payload?.message ?? '', /Risks: Synthetic data may not capture deployment drift/);
  assert.doesNotMatch(payload?.message ?? '', /does not expose a dedicated Current Constraints section/);
});
