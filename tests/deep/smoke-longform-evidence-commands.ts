import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLongformEvidenceCommandPlan, prepareLongformRegression, recordLongformRoundObservation } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'sciforge-longform-evidence-commands-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-literature-evidence-report',
  outRoot,
  runId: 'evidence-commands-fixture',
});

let plan = buildLongformEvidenceCommandPlan(prepared.manifest);
assert.equal(plan.scenarioId, 'longform-literature-evidence-report');
assert.equal(plan.roundCommands.length, 6);
assert.match(plan.roundCommands[0].command, /longform:record-round/);
assert.match(plan.roundCommands[0].command, /--artifact-ref run-plan/);
assert.match(plan.roundCommands[5].command, /--artifact-ref final-research-report\.md/);
assert.equal(plan.evidenceCommands.length, 4);
assert.ok(plan.evidenceCommands.some((command) => command.includes('--kind artifact')));
assert.ok(plan.evidenceCommands.some((command) => command.includes('--kind execution-unit')));
assert.ok(plan.evidenceCommands.some((command) => command.includes('computer-use-evidence')));
assert.match(plan.finalizeCommand, /longform:finalize/);
assert.match(plan.finalizeCommand, /--score-overall 4/);

const manifestAfterRoundOne = await recordLongformRoundObservation({
  manifestPath: prepared.manifestPath,
  round: 1,
  status: 'passed',
  observedBehavior: 'Round 1 passed and produced artifact refs.',
  artifactRefs: ['run-plan'],
  executionUnitRefs: ['EU-round-1'],
  screenshotRefs: ['browser-round-1'],
});
plan = buildLongformEvidenceCommandPlan(manifestAfterRoundOne);
assert.equal(plan.roundCommands.some((item) => item.round === 1), false);
assert.equal(plan.roundCommands.some((item) => item.round === 2), true);

console.log('[ok] longform evidence commands smoke passed');
