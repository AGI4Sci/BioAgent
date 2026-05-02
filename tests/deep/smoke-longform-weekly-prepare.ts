import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLongformWeeklyRegression } from '../../tools/longform-regression';
import { validateDeepRunManifest, type DeepRunManifest } from '../../tools/deep-test-manifest';

const outRoot = await mkdtemp(join(tmpdir(), 'bioagent-longform-weekly-prepare-'));
const prepared = await prepareLongformWeeklyRegression({
  manifests: [],
  outRoot,
  runId: 'weekly-fixture',
  now: new Date('2026-05-02T10:00:00.000Z'),
  weeklyRequiredPassedRealRuns: 2,
  appUrl: 'http://localhost:5173/',
  workspacePath: '/tmp/bioagent-longform-workspace',
  backend: 'codex',
  modelName: 'fixture-model',
  operator: 'Codex smoke',
});

assert.equal(prepared.status.weeklyDeficit, 2);
assert.equal(prepared.prepared.length, 2);
assert.deepEqual(prepared.prepared.map((item) => item.scenarioId), [
  'longform-context-pressure-compact',
  'longform-goal-drift-plan-rebuild',
]);
for (const item of prepared.prepared) {
  assert.equal((await stat(item.evidenceDirectory)).isDirectory(), true);
  const manifest = JSON.parse(await readFile(item.manifestPath, 'utf8')) as DeepRunManifest;
  assert.deepEqual(validateDeepRunManifest(manifest), []);
  assert.equal(manifest.run.id, `weekly-fixture-${item.scenarioId}`);
  assert.equal(manifest.runtimeProfile.workspacePath, '/tmp/bioagent-longform-workspace');
}

const pendingSkip = await prepareLongformWeeklyRegression({
  manifests: [pendingManifest('longform-context-pressure-compact')],
  outRoot,
  runId: 'weekly-fixture-skip',
  now: new Date('2026-05-02T10:00:00.000Z'),
  weeklyRequiredPassedRealRuns: 6,
  skipPending: true,
});

assert.equal(pendingSkip.skipped.some((item) => item.scenarioId === 'longform-context-pressure-compact' && item.reason === 'pending manifest already exists'), true);

console.log('[ok] longform weekly prepare smoke passed');

function pendingManifest(scenarioId: string): DeepRunManifest {
  return {
    schemaVersion: '1.0',
    scenarioId,
    title: scenarioId,
    taskId: 'T060',
    status: 'not-run',
    coverageStage: 'protocol-pass',
    run: {
      id: `pending-${scenarioId}`,
      startedAt: '2026-05-02T10:00:00.000Z',
      entrypoint: 'manual-browser',
    },
    prompt: { initial: 'fixture' },
    rounds: [],
    runtimeProfile: {
      mockModel: false,
      dataMode: 'unavailable',
    },
    artifacts: [],
    executionUnits: [],
    failurePoints: [],
    screenshots: [],
    qualityScores: {
      taskCompletion: 1,
      reproducibility: 1,
      dataAuthenticity: 1,
      artifactSchema: 1,
      selfHealing: 1,
      reportQuality: 1,
    },
  };
}
