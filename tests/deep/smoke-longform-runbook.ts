import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLongformScenarioScripts, prepareLongformRegression, writeLongformOperatorRunbook } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'sciforge-longform-runbook-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-context-pressure-compact',
  outRoot,
  runId: 'runbook-fixture',
});
const scripts = await loadLongformScenarioScripts();
const script = scripts.find((item) => item.scenarioId === prepared.scenarioId);
assert.ok(script);

const runbookPath = join(prepared.directory, 'operator-runbook.md');
const runbook = await writeLongformOperatorRunbook({
  manifestPath: prepared.manifestPath,
  manifest: prepared.manifest,
  script,
  outPath: runbookPath,
});

assert.equal((await stat(runbook.path)).isFile(), true);
const markdown = await readFile(runbook.path, 'utf8');
assert.match(markdown, /Long Context Report Iteration And Compaction Recovery/);
assert.match(markdown, /## Next Round/);
assert.match(markdown, /生成候选分析 A/);
assert.match(markdown, /## Missing Evidence/);
assert.match(markdown, /Evidence classes: browser, computer-use, workspace/);
assert.match(markdown, /longform:record-round/);
assert.match(markdown, /longform:record-evidence/);
assert.match(markdown, /longform:finalize/);

console.log('[ok] longform runbook smoke passed');
