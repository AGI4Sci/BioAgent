import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { GatewayRequest } from '../runtime-types.js';
import { tryRunArtifactMutationFastPath } from './artifact-mutation-fast-path.js';

test('artifact mutation fast path rewrites selected mini-grant markdown without AgentServer', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-artifact-mutation-'));
  const grantDir = join(workspace, 'p6-mini-grant');
  await mkdir(grantDir, { recursive: true });
  await writeFile(join(grantDir, 'timeline-budget.md'), [
    '# Timeline & Budget',
    '## Timeline (12 months)',
    '## Budget ($120,000)',
    '| Personnel – PI (0.5 FTE, 12 mo) | $45,000 |',
  ].join('\n'), 'utf8');

  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: [
      'Selected artifact: p6-mini-grant/timeline-budget.md。请只基于这个 artifact 做局部重写：',
      '- 把 budget table 改成 personnel、compute、data-validation、contingency 四类。',
      '- 必须保留 v2 新约束：总预算 80,000 USD、周期 9 months、团队 1 PI 0.4 FTE、1 engineer 0.4 FTE、1 wet-lab scientist 0.2 FTE、无真实 patient data。',
      '- 不要恢复旧约束：不要出现 120,000 USD、12 months、0.5 FTE 或 0.25 FTE。',
      '- 只改 p6-mini-grant/timeline-budget.md；主回复说明相对上一轮改了哪里，并给出 workspace ref。',
    ].join('\n'),
    workspacePath: workspace,
    artifacts: [],
  };

  const payload = await tryRunArtifactMutationFastPath(request);
  assert.ok(payload);
  assert.equal(payload?.claimType, 'artifact-rewrite');
  assert.equal(payload?.displayIntent?.taskOutcome, 'satisfied');
  assert.deepEqual(payload?.artifacts.map((artifact) => artifact.path), ['p6-mini-grant/timeline-budget.md']);
  assert.match(payload?.message ?? '', /实际写回 1 个 workspace markdown artifact/);
  assert.match(payload?.message ?? '', /budget categories: personnel \/ compute \/ data-validation \/ contingency/);

  const updated = await readFile(join(grantDir, 'timeline-budget.md'), 'utf8');
  assert.match(updated, /Timeline \(9 months\)/);
  assert.match(updated, /Budget \(\$80,000\)/);
  assert.match(updated, /\| Personnel \| \$64,000 \|/);
  assert.match(updated, /\| Compute \| \$8,000 \|/);
  assert.match(updated, /\| Data-validation \| \$5,000 \|/);
  assert.match(updated, /\| Contingency \| \$3,000 \|/);
  assert.match(updated, /No real patient data/);
  assert.doesNotMatch(updated, /120,000|12 months|0\.5 FTE|0\.25 FTE/);
});

test('artifact mutation fast path applies generic constraint rewrites to arbitrary markdown artifacts', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-generic-artifact-mutation-'));
  const packageDir = join(workspace, 'audit-package');
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, 'design-note.md'), [
    '# Design Note',
    '',
    '## Budget',
    '| Category | Cost | Notes |',
    '|---|---|---|',
    '| Old personnel | $90,000 | old team |',
    '',
    'The project lasts 18 months and uses analyst 0.5 FTE.',
  ].join('\n'), 'utf8');

  const payload = await tryRunArtifactMutationFastPath({
    skillDomain: 'knowledge',
    workspacePath: workspace,
    artifacts: [],
    prompt: [
      '请更新 audit-package/design-note.md 并写回 workspace。',
      '新约束：budget 改为 60,000 USD，duration 改为 6 months，analyst 0.2 FTE。',
      '预算表 categories: personnel, compute, validation。',
      '不要出现旧约束 90,000 USD、18 months、0.5 FTE。',
    ].join('\n'),
  });

  assert.ok(payload);
  assert.equal(payload?.artifacts[0]?.path, 'audit-package/design-note.md');
  assert.match(payload?.message ?? '', /audit-package\/design-note\.md/);
  const updated = await readFile(join(packageDir, 'design-note.md'), 'utf8');
  assert.match(updated, /Budget: \$60,000/);
  assert.match(updated, /Duration: 6 months/);
  assert.match(updated, /analyst 0\.2 FTE/i);
  assert.match(updated, /\| Personnel \| \$20,000 \|/);
  assert.match(updated, /\| Compute \| \$20,000 \|/);
  assert.match(updated, /\| Validation \| \$20,000 \|/);
  assert.doesNotMatch(updated, /90,000|18 months|0\.5 FTE/);
});

test('artifact mutation fast path rewrites mini-grant package constraints across files', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-artifact-package-'));
  const grantDir = join(workspace, 'p6-mini-grant');
  await mkdir(grantDir, { recursive: true });
  await writeFile(join(grantDir, 'project-brief.md'), 'A 12-month, $120,000 project.\n', 'utf8');
  await writeFile(join(grantDir, 'methods-plan.md'), 'PI (0.5 FTE)\n', 'utf8');
  await writeFile(join(grantDir, 'risk-register.md'), 'PI time too limited (0.5 FTE)\n', 'utf8');
  await writeFile(join(grantDir, 'timeline-budget.md'), '## Timeline (12 months)\n## Budget ($120,000)\n', 'utf8');

  const payload = await tryRunArtifactMutationFastPath({
    skillDomain: 'literature',
    workspacePath: workspace,
    artifacts: [],
    prompt: [
      '请继续修改刚才的 p6-mini-grant 交付物，要求替换旧约束而不是并存：',
      '总预算从 120,000 USD 改为 80,000 USD；项目周期从 12 months 改为 9 months。',
      '团队改为 1 PI 0.4 FTE、1 part-time engineer 0.4 FTE、1 wet-lab scientist 0.2 FTE。',
      '仍然不允许真实 patient data，只能 synthetic 或公开匿名数据。',
      '请重写 p6-mini-grant/timeline-budget.md 和 p6-mini-grant/risk-register.md，并保持 project-brief.md、methods-plan.md 与新约束一致。',
    ].join('\n'),
  });

  assert.ok(payload);
  assert.equal(payload?.artifacts.length, 4);
  for (const name of ['project-brief.md', 'methods-plan.md', 'risk-register.md', 'timeline-budget.md']) {
    const text = await readFile(join(grantDir, name), 'utf8');
    assert.doesNotMatch(text, /120,000|12 months|0\.5 FTE|0\.25 FTE/);
  }
  assert.match(await readFile(join(grantDir, 'risk-register.md'), 'utf8'), /0\.4 FTE/);
});
