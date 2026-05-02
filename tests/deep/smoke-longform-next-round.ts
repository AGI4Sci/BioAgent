import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLongformNextRound, loadLongformScenarioScripts, prepareLongformRegression, recordLongformRoundObservation } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'bioagent-longform-next-round-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-context-pressure-compact',
  outRoot,
  runId: 'next-round-fixture',
});
const scripts = await loadLongformScenarioScripts();
const script = scripts.find((item) => item.scenarioId === prepared.scenarioId);
assert.ok(script);

let next = getLongformNextRound(prepared.manifest, script);
assert.equal(next.progress.completedRounds, 0);
assert.equal(next.progress.totalRounds, 8);
assert.equal(next.progress.nextRoundNumber, 1);
assert.match(next.round?.userPrompt ?? '', /候选分析 A/);
assert.deepEqual(next.referenceOps, []);
assert.equal(next.expectedArtifacts.includes('candidate-report-a'), true);
assert.match(next.recordCommand ?? '', /longform:record-round/);
assert.match(next.recordCommand ?? '', /--round 1/);

const manifestAfterRoundOne = await recordLongformRoundObservation({
  manifestPath: prepared.manifestPath,
  round: 1,
  status: 'passed',
  observedBehavior: 'Round 1 produced candidate report A and workspace refs.',
  artifactRefs: ['candidate-report-a'],
  executionUnitRefs: ['EU-round-1'],
  screenshotRefs: ['browser-round-1'],
});

next = getLongformNextRound(manifestAfterRoundOne, script);
assert.equal(next.progress.completedRounds, 1);
assert.equal(next.progress.nextRoundNumber, 2);
assert.match(next.round?.userPrompt ?? '', /候选分析 B/);
assert.equal(next.expectedArtifacts.includes('candidate-report-b'), true);

console.log('[ok] longform next round smoke passed');
