import assert from 'node:assert/strict';
import { loadLongformScenarioScripts, summarizeLongformEvidenceGaps } from '../../tools/longform-regression';
import type { DeepRunManifest } from '../../tools/deep-test-manifest';

const [script] = (await loadLongformScenarioScripts()).filter((item) => item.scenarioId === 'longform-literature-evidence-report');
assert.ok(script);

const pending = fixtureManifest('not-run');
const pendingReport = summarizeLongformEvidenceGaps(pending, script);
assert.equal(pendingReport.readyToFinalizePassed, false);
assert.deepEqual(pendingReport.missing.rounds, [1, 2, 3, 4, 5, 6]);
assert.equal(pendingReport.missing.producedArtifacts, false);
assert.equal(pendingReport.missing.completedAt, false);
assert.ok(pendingReport.suggestedCommands.some((command) => command.includes('longform:next-round')));
assert.ok(pendingReport.suggestedCommands.some((command) => command.includes('longform:record-evidence')));

const passed = fixtureManifest('passed');
const passedReport = summarizeLongformEvidenceGaps(passed, script);
assert.equal(passedReport.readyToFinalizePassed, true);
assert.deepEqual(passedReport.missing.rounds, []);
assert.deepEqual(passedReport.missing.evidenceClasses, []);
assert.equal(passedReport.missing.producedArtifacts, true);
assert.equal(passedReport.missing.referenceImpact, true);
assert.equal(passedReport.missing.completedAt, true);

console.log('[ok] longform missing evidence smoke passed');

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
      observedBehavior: status === 'passed'
        ? `Round ${round.round} passed. ${round.referenceOps.map((op) => `${op.marker ?? ''} ${op.kind} changed the conclusion`).join(' ')}`
        : 'Pending real SciForge browser run. Fill this during execution.',
      status: status === 'passed' ? 'passed' : 'not-run',
      artifactRefs: round.round === 6 && status === 'passed' ? ['final-report'] : [],
      executionUnitRefs: status === 'passed' ? ['EU-longform'] : [],
      screenshotRefs: status === 'passed' ? [`browser-round-${round.round}`] : [],
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
    artifacts: status === 'passed' ? [{
      id: 'final-report',
      type: 'research-report',
      path: '.sciforge/reports/final.md',
      round: 6,
      status: 'produced',
      summary: 'Final report explains how ※1 and ※2 changed the evidence ranking.',
    }] : [],
    executionUnits: status === 'passed' ? [{
      id: 'EU-longform',
      tool: 'sciforge.longform',
      status: 'done',
      logRef: '.sciforge/logs/longform.log',
      artifactRefs: ['final-report'],
    }] : [],
    failurePoints: status === 'passed' ? [] : [{
      id: 'pending-real-regression',
      severity: 'info',
      category: 'protocol',
      summary: 'Pending real run.',
      resolved: false,
    }],
    screenshots: status === 'passed' ? script.rounds.map((round) => ({
      id: `browser-round-${round.round}`,
      path: `screenshots/browser-round-${round.round}.png`,
      round: round.round,
      caption: round.round === 3 ? 'Computer Use right-click selected limitation and browser highlight evidence.' : 'Browser evidence.',
    })) : [],
    qualityScores: {
      taskCompletion: status === 'passed' ? 4 : 1,
      reproducibility: status === 'passed' ? 4 : 1,
      dataAuthenticity: status === 'passed' ? 4 : 1,
      artifactSchema: status === 'passed' ? 4 : 1,
      selfHealing: status === 'passed' ? 4 : 1,
      reportQuality: status === 'passed' ? 4 : 1,
      rationale: status === 'passed'
        ? 'Reference impact: ※1 changed limitation severity and ※2 changed evidence ranking.'
        : 'Pending.',
    },
    notes: status === 'passed'
      ? 'Browser evidence, Computer Use right-click selected limitation evidence, and workspace .sciforge artifact refs recorded. Reference impact: ※1/※2 changed final report.'
      : 'Prepared T060 longform regression manifest.',
  };
}
