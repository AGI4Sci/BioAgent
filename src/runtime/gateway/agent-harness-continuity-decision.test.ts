import assert from 'node:assert/strict';
import test from 'node:test';

import type { GatewayRequest } from '../runtime-types';
import { agentHarnessContinuityDecision } from './agent-harness-continuity-decision';

test('continue reuse policy reuses AgentServer session context', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Find new papers and write a report.',
    artifacts: [],
    uiState: {
      sessionId: 'session-1',
      contextReusePolicy: {
        mode: 'continue',
        historyReuse: { allowed: true },
      },
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, true);
  assert.equal(decision.decision, 'continuity');
  assert.equal(decision.runtimeSignals.policyDrivesContinuity, true);
  assert.ok(decision.reasons.includes('reuse-policy-advisory'));
});

test('explicit continuation signals still reuse AgentServer context', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Continue the previous run.',
    artifacts: [],
    uiState: {
      agentHarness: {
        contract: {
          intentMode: 'continuation',
        },
      },
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, true);
  assert.equal(decision.decision, 'continuity');
  assert.ok(decision.reasons.includes('intent-continuity'));
});

test('repair reuse policy without a concrete current repair target stays fresh', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Debug paper_metric_kernel.py and rerun pytest.',
    artifacts: [],
    uiState: {
      sessionId: 'fresh-code-debug',
      contextReusePolicy: {
        mode: 'repair',
        historyReuse: { allowed: true },
      },
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, false);
  assert.equal(decision.decision, 'fresh');
  assert.equal(decision.runtimeSignals.policyDrivesContinuity, undefined);
  assert.equal(decision.runtimeSignals.repairTargetAvailable, false);
});

test('stale harness repair intent without a concrete target stays fresh', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Debug paper_metric_kernel.py and rerun pytest.',
    artifacts: [],
    uiState: {
      agentHarness: {
        contract: { intentMode: 'repair' },
        summary: { intentMode: 'repair' },
      },
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, false);
  assert.equal(decision.decision, 'fresh');
  assert.equal(decision.harnessSignals.intentUseContinuity, false);
});

test('harness repair intent with a concrete target uses continuity', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Repair the failed run.',
    artifacts: [],
    uiState: {
      agentHarness: {
        contract: { intentMode: 'repair' },
      },
      currentRun: {
        id: 'run-failed',
        status: 'failed',
        failureReason: 'needs repair',
      },
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, true);
  assert.equal(decision.decision, 'continuity');
  assert.equal(decision.harnessSignals.intentUseContinuity, true);
});

test('repair reuse policy with a failed current target uses continuity', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Continue the failed repair.',
    artifacts: [],
    uiState: {
      sessionId: 'repair-target',
      contextReusePolicy: {
        mode: 'repair',
        historyReuse: { allowed: true },
      },
      recentExecutionRefs: [{
        id: 'EU-failed',
        status: 'repair-needed',
        failureReason: 'previous bounded failure',
      }],
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, true);
  assert.equal(decision.decision, 'continuity');
  assert.equal(decision.runtimeSignals.policyDrivesContinuity, true);
  assert.equal(decision.runtimeSignals.repairTargetAvailable, true);
});

test('current-turn references stay fresh unless harness intent asks for continuity', () => {
  const decision = agentHarnessContinuityDecision({
    skillDomain: 'literature',
    prompt: 'Summarize this selected paper.',
    artifacts: [],
    uiState: {
      currentReferences: [{ ref: 'file:paper.pdf', title: 'paper.pdf' }],
    },
  } as GatewayRequest);

  assert.equal(decision.useContinuity, false);
  assert.equal(decision.decision, 'fresh');
  assert.ok(decision.reasons.includes('current-reference'));
  assert.equal(decision.runtimeSignals.currentReferenceCount, 1);
});
