import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLongformRegression } from '../../tools/longform-regression';
import { validateDeepRunManifest } from '../../tools/deep-test-manifest';

const outRoot = await mkdtemp(join(tmpdir(), 'sciforge-longform-prepare-'));
const prepared = await prepareLongformRegression({
  scenario: 'longform-literature-evidence-report',
  outRoot,
  runId: 'longform-fixture-run',
  appUrl: 'http://localhost:5173/',
  workspacePath: '/tmp/sciforge-longform-workspace',
  backend: 'codex',
  modelProvider: 'native',
  modelName: 'fixture-model',
  operator: 'Codex smoke',
});

assert.equal(prepared.length, 1);
const item = prepared[0];
assert.equal(item.scenarioId, 'longform-literature-evidence-report');
assert.equal((await stat(item.evidenceDirectory)).isDirectory(), true);

const manifest = JSON.parse(await readFile(item.manifestPath, 'utf8')) as unknown;
assert.deepEqual(validateDeepRunManifest(manifest), []);
assert.equal((manifest as { run: { id: string } }).run.id, 'longform-fixture-run');
assert.equal((manifest as { runtimeProfile: { workspacePath: string } }).runtimeProfile.workspacePath, '/tmp/sciforge-longform-workspace');
assert.equal((manifest as { rounds: unknown[] }).rounds.length, 6);

const checklist = await readFile(item.checklistPath, 'utf8');
assert.match(checklist, /Literature Evidence Evaluation/);
assert.match(checklist, /Reference operations:/);
assert.match(checklist, /Browser:/);
assert.match(checklist, /Computer Use:/);
assert.match(checklist, /Workspace:/);

console.log('[ok] longform regression preparation smoke passed');
