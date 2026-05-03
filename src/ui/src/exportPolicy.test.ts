import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SciForgeSession, RuntimeArtifact } from './domain';
import { buildExecutionBundle, evaluateExecutionBundleExport } from './exportPolicy';

describe('execution bundle export policy', () => {
  it('blocks bundle export when an artifact policy is blocked', () => {
    const session = fixtureSession({
      id: 'artifact-sensitive',
      exportPolicy: 'blocked',
      sensitiveDataFlags: ['human-subject'],
    });

    const decision = evaluateExecutionBundleExport(session);

    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.blockedArtifactIds, ['artifact-sensitive']);
    assert.deepEqual(decision.sensitiveFlags, ['human-subject']);
    assert.throws(() => buildExecutionBundle(session, decision), /Export blocked/);
  });

  it('allows restricted exports but records audience and sensitive warnings', () => {
    const session = fixtureSession({
      id: 'artifact-team',
      exportPolicy: 'restricted',
      audience: ['team-a'],
      sensitiveDataFlags: ['cell-line-proprietary'],
    });

    const decision = evaluateExecutionBundleExport(session);
    const bundle = buildExecutionBundle(session, decision);

    assert.equal(decision.allowed, true);
    assert.deepEqual(bundle.exportPolicy.restrictedArtifactIds, ['artifact-team']);
    assert.deepEqual(bundle.exportPolicy.sensitiveDataFlags, ['cell-line-proprietary']);
    assert.match(bundle.exportPolicy.warnings.join('\n'), /restricted artifact artifact-team/);
    assert.equal(bundle.artifacts[0].exportPolicy, 'restricted');
    assert.deepEqual(bundle.artifacts[0].audience, ['team-a']);
    assert.deepEqual(bundle.runs[0].scenarioPackageRef, { id: 'omics-differential-exploration', version: '1.0.0', source: 'built-in' });
    assert.equal(bundle.runs[0].skillPlanRef, 'skill-plan.omics-differential-exploration.default');
    assert.deepEqual(bundle.artifacts[0].scenarioPackageRef, { id: 'omics-differential-exploration', version: '1.0.0', source: 'built-in' });
  });
});

function fixtureSession(artifact: Pick<RuntimeArtifact, 'id'> & Partial<RuntimeArtifact>): SciForgeSession {
  return {
    schemaVersion: 2,
    sessionId: 'session-export-policy',
    scenarioId: 'omics-differential-exploration',
    title: 'Export policy smoke',
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    messages: [],
    runs: [{
      id: 'run-1',
      scenarioId: 'omics-differential-exploration',
      scenarioPackageRef: { id: 'omics-differential-exploration', version: '1.0.0', source: 'built-in' },
      skillPlanRef: 'skill-plan.omics-differential-exploration.default',
      uiPlanRef: 'ui-plan.omics-differential-exploration.default',
      status: 'completed',
      prompt: 'export',
      response: 'done',
      createdAt: '2026-04-20T00:00:00.000Z',
      completedAt: '2026-04-20T00:00:00.000Z',
    }],
    uiManifest: [],
    claims: [],
    executionUnits: [{
      id: 'EU-export',
      tool: 'omics.runner',
      params: '{}',
      status: 'done',
      hash: 'hash-export',
      outputArtifacts: [artifact.id],
    }],
    artifacts: [{
      ...artifact,
      type: 'omics-differential-expression',
      producerScenario: 'omics-differential-exploration',
      scenarioPackageRef: { id: 'omics-differential-exploration', version: '1.0.0', source: 'built-in' },
      schemaVersion: '1',
    }],
    notebook: [],
    versions: [],
  };
}
