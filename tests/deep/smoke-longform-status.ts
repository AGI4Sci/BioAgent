import assert from 'node:assert/strict';
import { summarizeLongformRegressionStatus, loadLongformScenarioScripts } from '../../tools/longform-regression';
import type { DeepRunManifest } from '../../tools/deep-test-manifest';

const scripts = await loadLongformScenarioScripts();
const literature = scripts.find((script) => script.scenarioId === 'longform-literature-evidence-report');
const singleCell = scripts.find((script) => script.scenarioId === 'longform-single-cell-repair-analysis');
assert.ok(literature);
assert.ok(singleCell);

const status = summarizeLongformRegressionStatus({
  scripts,
  now: new Date('2026-05-01T12:00:00.000Z'),
  manifests: [
    passedManifest(literature.scenarioId, 'passed-a', '2026-04-29T10:00:00.000Z'),
    passedManifest(singleCell.scenarioId, 'passed-b', '2026-05-01T10:00:00.000Z'),
    pendingManifest('longform-context-pressure-compact'),
  ],
});

assert.equal(status.scenarioCount, 6);
assert.equal(status.manifestCount, 3);
assert.equal(status.passedCount, 2);
assert.equal(status.pendingCount, 1);
assert.equal(status.currentWeekPassedRealRuns, 2);
assert.equal(status.weeklyRequirementMet, true);
assert.equal(status.scenarios.find((scenario) => scenario.scenarioId === literature.scenarioId)?.latestStatus, 'passed');
assert.equal(status.scenarios.find((scenario) => scenario.scenarioId === 'longform-structure-mutation-impact')?.latestStatus, 'missing');
assert.ok(status.scenarios.find((scenario) => scenario.scenarioId === 'longform-structure-mutation-impact')?.qualityIssues.includes('missing longform manifest'));

const unmet = summarizeLongformRegressionStatus({
  scripts,
  now: new Date('2026-05-01T12:00:00.000Z'),
  manifests: [passedManifest(literature.scenarioId, 'passed-a', '2026-04-22T10:00:00.000Z')],
});
assert.equal(unmet.currentWeekPassedRealRuns, 0);
assert.equal(unmet.weeklyRequirementMet, false);

console.log('[ok] longform status smoke passed');

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
      path: '.bioagent/final.md',
      status: 'produced',
      summary: 'Reference impact: ※1 changed the conclusion.',
    }],
    executionUnits: [{
      id: 'EU-fixture',
      status: 'done',
      logRef: '.bioagent/logs/fixture.log',
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
    notes: 'Browser evidence. Computer Use right-click selected limitation evidence. Workspace .bioagent refs. Reference impact: ※1 changed conclusion.',
  };
}

function pendingManifest(scenarioId: string): DeepRunManifest {
  return {
    ...passedManifest(scenarioId, `pending-${scenarioId}`, '2026-05-01T10:00:00.000Z'),
    status: 'not-run',
    coverageStage: 'protocol-pass',
    run: {
      id: `pending-${scenarioId}`,
      startedAt: '2026-05-01T10:00:00.000Z',
      entrypoint: 'manual-browser',
    },
    rounds: [],
    artifacts: [],
    executionUnits: [],
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
