import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeLongformRegression, prepareLongformRegression, validateLongformRunManifest } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'bioagent-longform-finalize-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-literature-evidence-report',
  outRoot,
  runId: 'finalize-fixture',
});

await finalizeLongformRegression({
  manifestPath: prepared.manifestPath,
  status: 'repair-needed',
  coverageStage: 'protocol-pass',
  completedAt: '2026-05-02T08:00:00.000Z',
  notes: 'Finalized after a real backend attempt; explicit references were exercised before the model runtime stopped.',
  qualityScores: {
    taskCompletion: 2,
    reproducibility: 4,
    dataAuthenticity: 3,
    artifactSchema: 2,
    selfHealing: 3,
    reportQuality: 2,
    overall: 3,
    rationale: 'Repair-needed run scored low on task completion because runtime stopped before final artifact export.',
  },
  failurePoint: {
    id: 'runtime-stream-timeout',
    round: 3,
    severity: 'blocker',
    category: 'runtime',
    summary: 'Backend stream timed out during the longform reference follow-up.',
    evidenceRefs: ['EU-round-3'],
    repairAction: 'Retry with backend stream timeout diagnostics enabled.',
    resolved: false,
  },
});

const manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8')) as typeof prepared.manifest;
assert.equal(manifest.status, 'repair-needed');
assert.equal(manifest.run.completedAt, '2026-05-02T08:00:00.000Z');
assert.equal(manifest.qualityScores.taskCompletion, 2);
assert.equal(manifest.qualityScores.overall, 3);
assert.match(manifest.notes ?? '', /Finalized after a real backend attempt/);
assert.equal(manifest.failurePoints.some((failure) => failure.id === 'runtime-stream-timeout' && failure.category === 'runtime'), true);

const quality = validateLongformRunManifest(manifest);
assert.equal(quality.pass, true, quality.issues.join('\n'));

console.log('[ok] longform finalizer smoke passed');
