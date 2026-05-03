import assert from 'node:assert/strict';
import { loadLongformScenarioScripts, validateLongformRunManifest } from '../../tools/longform-regression';
import type { DeepRunManifest } from '../../tools/deep-test-manifest';

const [script] = (await loadLongformScenarioScripts()).filter((item) => item.scenarioId === 'longform-literature-evidence-report');
assert.ok(script, 'literature longform script should exist');

const pending = fixtureManifest('not-run');
assert.deepEqual(validateLongformRunManifest(pending, script), {
  scenarioId: pending.scenarioId,
  pass: true,
  issues: [],
});

const badPassed = fixtureManifest('passed');
badPassed.rounds = badPassed.rounds.slice(0, 2);
badPassed.screenshots = [];
badPassed.artifacts = [];
badPassed.run.completedAt = undefined;
const badResult = validateLongformRunManifest(badPassed, script);
assert.equal(badResult.pass, false);
assert.ok(badResult.issues.some((issue) => /passed rounds/.test(issue)));
assert.ok(badResult.issues.some((issue) => /browser evidence/.test(issue)));
assert.ok(badResult.issues.some((issue) => /produced artifact/.test(issue)));

const goodPassed = fixtureManifest('passed');
const goodResult = validateLongformRunManifest(goodPassed, script);
assert.deepEqual(goodResult, {
  scenarioId: goodPassed.scenarioId,
  pass: true,
  issues: [],
});

console.log('[ok] longform quality gate smoke passed');

function fixtureManifest(status: DeepRunManifest['status']): DeepRunManifest {
  const now = '2026-05-01T00:00:00.000Z';
  return {
    schemaVersion: '1.0',
    scenarioId: 'longform-literature-evidence-report',
    title: 'Literature Evidence Evaluation To Reproducible Report',
    taskId: 'T060',
    status,
    coverageStage: status === 'passed' ? 'real-data-success' : 'protocol-pass',
    run: {
      id: `fixture-${status}`,
      startedAt: now,
      completedAt: status === 'passed' ? '2026-05-01T00:30:00.000Z' : undefined,
      operator: 'Codex smoke',
      entrypoint: 'manual-browser',
    },
    prompt: {
      initial: script.rounds[0].prompt,
      expectedOutcome: 'Complete longform reference regression.',
    },
    rounds: script.rounds.map((round) => ({
      round: round.round,
      userPrompt: round.prompt,
      expectedBehavior: round.acceptanceChecks.join('\n'),
      observedBehavior: `Round ${round.round} passed. ${round.referenceOps.map((op) => `${op.marker ?? ''} ${op.kind} changed the conclusion`).join(' ')}`,
      status: status === 'passed' ? 'passed' : 'not-run',
      artifactRefs: round.round === 6 ? ['final-report', 'final-evidence-table'] : [],
      executionUnitRefs: ['EU-longform'],
      screenshotRefs: [`browser-round-${round.round}`],
    })),
    runtimeProfile: {
      appUrl: 'http://localhost:5173/',
      workspacePath: '/tmp/sciforge-longform-workspace',
      agentBackend: 'codex',
      modelProvider: 'native',
      modelName: 'fixture-model',
      runtimeProfileId: 't060-longform',
      mockModel: false,
      dataMode: status === 'passed' ? 'real' : 'unavailable',
    },
    artifacts: [{
      id: 'final-report',
      type: 'research-report',
      path: '.sciforge/reports/final.md',
      round: 6,
      status: 'produced',
      summary: 'Final report explains how ※1, ※2, and ※3 changed the limitations and evidence ranking.',
    }, {
      id: 'final-evidence-table',
      type: 'evidence-table',
      path: '.sciforge/reports/final.csv',
      round: 6,
      status: 'produced',
    }],
    executionUnits: [{
      id: 'EU-longform',
      tool: 'sciforge.longform',
      status: 'done',
      logRef: '.sciforge/logs/longform.log',
      artifactRefs: ['final-report'],
    }],
    failurePoints: status === 'passed' ? [] : [{
      id: 'pending-real-regression',
      severity: 'info',
      category: 'protocol',
      summary: 'Pending real run.',
      resolved: false,
    }],
    screenshots: script.rounds.map((round) => ({
      id: `browser-round-${round.round}`,
      path: `screenshots/browser-round-${round.round}.png`,
      round: round.round,
      caption: round.round === 3 ? 'Computer Use right-click selected limitation and browser highlight evidence.' : 'Browser evidence.',
    })),
    qualityScores: {
      taskCompletion: status === 'passed' ? 4 : 1,
      reproducibility: status === 'passed' ? 4 : 1,
      dataAuthenticity: status === 'passed' ? 4 : 1,
      artifactSchema: status === 'passed' ? 4 : 1,
      selfHealing: status === 'passed' ? 4 : 1,
      reportQuality: status === 'passed' ? 4 : 1,
      rationale: status === 'passed'
        ? 'Reference impact: ※1 changed limitation severity, ※2 changed evidence ranking, ※3 changed confidence and repair notes.'
        : 'Pending.',
    },
    notes: 'Browser evidence, Computer Use right-click selected limitation evidence, and workspace .sciforge artifact refs recorded. Reference impact: ※1/※2/※3 changed final report.',
  };
}
