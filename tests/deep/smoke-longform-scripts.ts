import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const scenariosDir = resolve('tests', 'longform', 'scenarios');
const files = (await readdir(scenariosDir)).filter((file) => file.endsWith('.json')).sort();
const expectedScoringDimensions = [
  'goal-retention',
  'reference-use',
  'reasoning-continuity',
  'execution-capability',
  'failure-recovery',
  'artifact-quality',
  'reproducibility',
  'ui-usability',
];

assert.equal(files.length, 6, 'T060 must define exactly six longform scenario scripts');

for (const file of files) {
  const script = JSON.parse(await readFile(join(scenariosDir, file), 'utf8')) as Record<string, unknown>;
  assert.equal(script.schemaVersion, '1.0', `${file} schemaVersion`);
  assert.equal(script.taskId, 'T060', `${file} taskId`);
  assert.equal(typeof script.scenarioId, 'string', `${file} scenarioId`);
  assert.equal(typeof script.title, 'string', `${file} title`);
  assert.equal(typeof script.goal, 'string', `${file} goal`);
  assert.ok(Array.isArray(script.rounds), `${file} rounds`);
  const rounds = script.rounds as Array<Record<string, unknown>>;
  assert.ok(rounds.length >= Number(script.minRounds ?? 6), `${file} should have at least minRounds`);
  assert.ok(rounds.length >= 6, `${file} should have at least 6 rounds`);

  const referenceOps = rounds.flatMap((round) => Array.isArray(round.referenceOps) ? round.referenceOps as Array<Record<string, unknown>> : []);
  assert.ok(referenceOps.length >= 2, `${file} should require at least two reference operations`);
  const referenceKinds = new Set(referenceOps.map((op) => op.kind));
  assert.ok(referenceKinds.size >= 2, `${file} should mix reference operation types`);
  assert.ok(referenceOps.some((op) => typeof op.marker === 'string' && String(op.marker).startsWith('※')) || referenceOps.some((op) => op.kind === 'click-object-chip'), `${file} should define composer markers or object chip checks`);

  for (const round of rounds) {
    assert.equal(typeof round.round, 'number', `${file} round number`);
    assert.equal(typeof round.prompt, 'string', `${file} prompt`);
    assert.ok(Array.isArray(round.expectedArtifacts), `${file} expectedArtifacts`);
    assert.ok(Array.isArray(round.acceptanceChecks), `${file} acceptanceChecks`);
  }

  const evidencePlan = script.evidencePlan as Record<string, unknown> | undefined;
  assert.ok(evidencePlan, `${file} evidencePlan`);
  assert.ok(Array.isArray(evidencePlan?.browser) && (evidencePlan?.browser as unknown[]).length > 0, `${file} browser evidence`);
  assert.ok(Array.isArray(evidencePlan?.computerUse) && (evidencePlan?.computerUse as unknown[]).length > 0, `${file} Computer Use evidence`);
  assert.ok(Array.isArray(evidencePlan?.workspace) && (evidencePlan?.workspace as unknown[]).length > 0, `${file} workspace evidence`);
  assert.deepEqual(script.scoringDimensions, expectedScoringDimensions, `${file} scoring dimensions`);
  assert.equal(typeof script.blockerTemplate, 'string', `${file} blockerTemplate`);
}

console.log(`[ok] validated ${files.length} T060 longform scripts`);
