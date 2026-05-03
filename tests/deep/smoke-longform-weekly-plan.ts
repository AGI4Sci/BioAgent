import assert from 'node:assert/strict';
import { loadLongformScenarioScripts, summarizeLongformRegressionStatus } from '../../tools/longform-regression';
import type { DeepRunManifest } from '../../tools/deep-test-manifest';

const scripts = await loadLongformScenarioScripts();
const status = summarizeLongformRegressionStatus({
  scripts,
  now: new Date('2026-05-02T10:00:00.000Z'),
  weeklyRequiredPassedRealRuns: 2,
  manifests: [
    passedManifest('longform-literature-evidence-report', 'passed-this-week', '2026-05-01T10:00:00.000Z'),
    pendingManifest('longform-context-pressure-compact'),
    repairNeededManifest('longform-single-cell-repair-analysis'),
  ],
});

assert.equal(status.weeklyDeficit, 1);
assert.equal(status.nextRecommendedScenarioIds.length, 1);
assert.equal(status.nextRecommendedScenarioIds[0], 'longform-goal-drift-plan-rebuild');

const satisfied = summarizeLongformRegressionStatus({
  scripts,
  now: new Date('2026-05-02T10:00:00.000Z'),
  weeklyRequiredPassedRealRuns: 1,
  manifests: [
    passedManifest('longform-literature-evidence-report', 'passed-this-week', '2026-05-01T10:00:00.000Z'),
  ],
});
assert.equal(satisfied.weeklyDeficit, 0);
assert.deepEqual(satisfied.nextRecommendedScenarioIds, []);

console.log('[ok] longform weekly plan smoke passed');

function passedManifest(scenarioId: string, runId: string, completedAt: string): DeepRunManifest {
  return {
    schemaVersion: '1.0',
    scenarioId,
    title: scenarioId,
    taskId: 'T060',
    status: 'passed',
    coverageStage: 'real-data-success',
    run: {
      id: runId,
      startedAt: completedAt,
      completedAt,
      entrypoint: 'manual-browser',
    },
    prompt: { initial: 'fixture' },
    rounds: Array.from({ length: 8 }, (_, index) => ({
      round: index + 1,
      userPrompt: `round ${index + 1}`,
      observedBehavior: `passed with reference impact ※${index + 1}`,
      status: 'passed' as const,
      artifactRefs: index === 7 ? ['final-report'] : [],
      executionUnitRefs: ['EU-fixture'],
      screenshotRefs: [`browser-${index + 1}`],
    })),
    runtimeProfile: {
      mockModel: false,
      dataMode: 'real',
      workspacePath: '/tmp/workspace',
    },
    artifacts: [{
      id: 'final-report',
      type: 'research-report',
      path: '.sciforge/final.md',
      status: 'produced',
      summary: 'Reference impact: ※1 changed the conclusion.',
    }],
    executionUnits: [{
      id: 'EU-fixture',
      status: 'done',
      logRef: '.sciforge/logs/fixture.log',
    }],
    failurePoints: [],
    screenshots: [{
      id: 'browser-1',
      path: 'screenshots/browser-1.png',
      caption: 'Browser and Computer Use right-click evidence.',
    }],
    qualityScores: {
      taskCompletion: 4,
      reproducibility: 4,
      dataAuthenticity: 4,
      artifactSchema: 4,
      selfHealing: 4,
      reportQuality: 4,
      rationale: 'Reference impact recorded.',
    },
    notes: 'Browser evidence. Computer Use right-click selected limitation evidence. Workspace .sciforge refs. Reference impact: ※1 changed conclusion.',
  };
}

function pendingManifest(scenarioId: string): DeepRunManifest {
  return {
    ...passedManifest(scenarioId, `pending-${scenarioId}`, '2026-05-02T10:00:00.000Z'),
    status: 'not-run',
    coverageStage: 'protocol-pass',
    run: {
      id: `pending-${scenarioId}`,
      startedAt: '2026-05-02T10:00:00.000Z',
      entrypoint: 'manual-browser',
    },
  };
}

function repairNeededManifest(scenarioId: string): DeepRunManifest {
  return {
    ...passedManifest(scenarioId, `repair-${scenarioId}`, '2026-05-02T10:00:00.000Z'),
    status: 'repair-needed',
    coverageStage: 'protocol-pass',
    failurePoints: [{
      id: 'runtime-blocker',
      severity: 'blocker',
      category: 'runtime',
      summary: 'Backend stream stopped.',
      resolved: false,
    }],
  };
}
