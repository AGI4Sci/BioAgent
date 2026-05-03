import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLongformRegression, recordLongformRoundObservation } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'sciforge-longform-record-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-literature-evidence-report',
  outRoot,
  runId: 'record-round-fixture',
});

await recordLongformRoundObservation({
  manifestPath: prepared.manifestPath,
  round: 1,
  status: 'passed',
  observedBehavior: 'Round 1 produced a plan and exposed run/session refs.',
  artifactRefs: ['run-plan'],
  executionUnitRefs: ['EU-round-1'],
  screenshotRefs: ['browser-round-1'],
});

let manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8')) as typeof prepared.manifest;
assert.equal(manifest.rounds[0].status, 'passed');
assert.deepEqual(manifest.rounds[0].artifactRefs, ['run-plan']);
assert.deepEqual(manifest.rounds[0].executionUnitRefs, ['EU-round-1']);
assert.deepEqual(manifest.rounds[0].screenshotRefs, ['browser-round-1']);
assert.equal(manifest.status, 'not-run');

for (const round of manifest.rounds.slice(1)) {
  await recordLongformRoundObservation({
    manifestPath: prepared.manifestPath,
    round: round.round,
    status: 'passed',
    observedBehavior: `Round ${round.round} passed with reference impact ※${round.round}.`,
    artifactRefs: round.round === 6 ? ['final-report'] : [],
    executionUnitRefs: [`EU-round-${round.round}`],
    screenshotRefs: [`browser-round-${round.round}`],
    completedAt: '2026-05-01T01:00:00.000Z',
  });
}

manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8')) as typeof prepared.manifest;
assert.equal(manifest.status, 'passed');
assert.equal(manifest.run.completedAt, '2026-05-01T01:00:00.000Z');
assert.equal(manifest.coverageStage, 'real-data-success');
assert.equal(manifest.runtimeProfile.dataMode, 'real');

console.log('[ok] longform round recorder smoke passed');
