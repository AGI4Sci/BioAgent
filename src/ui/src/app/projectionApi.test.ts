import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeArtifact, SciForgeSession } from '../domain';
import { conversationProjectionForSession } from './conversation-projection-view-model';
import { browserVisibleRuntimeState, runPresentationState } from './results-renderer-execution-model';
import { createLocalProjectionApi, createLocalUserActionApi } from './projectionApi';

test('ProjectionApi restores default view from materialized projection and keeps raw run failures audit-only', async () => {
  const projection = {
    schemaVersion: 'sciforge.conversation-projection.v1',
    conversationId: 'conversation-projection-api',
    visibleAnswer: {
      status: 'satisfied',
      text: 'Projection answer is authoritative.',
      artifactRefs: ['artifact:report'],
    },
    activeRun: { id: 'run-1', status: 'satisfied' },
    artifacts: [{ ref: 'artifact:report', label: 'Report' }],
    executionProcess: [],
    recoverActions: [],
    verificationState: { status: 'verified' },
    auditRefs: ['raw:debug-only'],
    diagnostics: [],
  };
  const session = testSession({
    runs: [{
      id: 'run-1',
      scenarioId: 'literature-evidence-review',
      status: 'failed',
      prompt: 'make report',
      response: 'RAW_RESPONSE_SHOULD_NOT_RENDER',
      createdAt: '2026-05-17T00:00:00.000Z',
      raw: {
        failureReason: 'RAW_FAILURE_SHOULD_NOT_RENDER',
        displayIntent: { conversationProjection: projection },
      },
    }],
    artifacts: [deliveryArtifact('report')],
  });

  const api = createLocalProjectionApi();
  const view = await api.getConversationProjection({ session, focusedRunId: 'run-1' });
  const runtimeState = browserVisibleRuntimeState(session, session.runs[0]);

  assert.equal(view.visibleAnswer.status, 'satisfied');
  assert.equal(view.visibleAnswer.text, 'Projection answer is authoritative.');
  assert.deepEqual(view.visibleAnswer.primaryArtifactRefs, ['artifact:report']);
  assert.equal(runtimeState.rawFallbackUsed, false);
  assert.equal(runtimeState.rawLeak, false);
  assert.doesNotMatch(JSON.stringify(view), /RAW_FAILURE|RAW_RESPONSE/);
});

test('ProjectionApi exposes manual artifact preview and selected artifact actions as semantic functions', async () => {
  const session = testSession({
    artifacts: [deliveryArtifact('large-report', {
      delivery: {
        contractId: 'sciforge.artifact-delivery.v1',
        ref: 'artifact:large-report',
        role: 'primary-deliverable',
        declaredMediaType: 'text/markdown',
        declaredExtension: 'md',
        contentShape: 'raw-file',
        readableRef: '.sciforge/artifacts/large-report.md',
        previewPolicy: 'inline',
        sizeBytes: 2 * 1024 * 1024,
      } as never,
    })],
  });
  const projectionApi = createLocalProjectionApi();
  const actionApi = createLocalUserActionApi(projectionApi);

  const preview = await projectionApi.getArtifactPreview({ session, artifactRef: 'artifact:large-report', mode: 'summary' });
  const loaded = await actionApi.loadArtifactPreview({ session, artifactRef: 'artifact:large-report', byteLimit: 4096 });
  const selected = await actionApi.selectObject({ session, objectRef: 'artifact:large-report', intent: 'ask-followup' });

  assert.equal(preview.status, 'requires-manual-load');
  assert.deepEqual(preview.actions.map((action) => action.kind), ['load-preview']);
  assert.equal(loaded.artifactRef, 'artifact:large-report');
  assert.equal(selected.accepted, true);
  assert.equal(selected.action?.type, 'select-object');
  assert.equal(selected.auditRef?.startsWith('ui-action:select-object-'), true);
});

test('completion-candidate salvage creates recoverable projection without promoting raw ToolPayload to success', () => {
  const session = testSession({
    runs: [{
      id: 'run-candidate',
      scenarioId: 'literature-evidence-review',
      status: 'failed',
      prompt: 'handoff drifted after writing report',
      response: '{"message":"RAW_TOOLPAYLOAD_SHOULD_STAY_AUDIT_ONLY"}',
      createdAt: '2026-05-17T00:00:00.000Z',
      completedAt: '2026-05-17T00:00:10.000Z',
      raw: {
        stdoutRef: '.sciforge/logs/stdout.log',
        stderrRef: '.sciforge/logs/stderr.log',
        completionCandidate: {
          summary: '{"rawPayload":"SHOULD_NOT_RENDER"}',
          artifactRefs: ['artifact:salvaged-report'],
          auditRefs: ['raw:tool-payload-json'],
        },
      },
    }],
    artifacts: [deliveryArtifact('salvaged-report')],
  });

  const projection = conversationProjectionForSession(session, session.runs[0]);
  const state = runPresentationState(session, session.runs[0]);
  const browserState = browserVisibleRuntimeState(session, session.runs[0]);

  assert.equal(projection?.visibleAnswer?.status, 'repair-needed');
  assert.equal(projection?.visibleAnswer?.text, '发现可用结果，待导入、验证或人工确认后才能作为最终答案。');
  assert.deepEqual(projection?.visibleAnswer?.artifactRefs, ['artifact:salvaged-report']);
  assert.equal(state.kind, 'recoverable');
  assert.match(state.nextSteps.join('\n'), /导入并验证候选结果/);
  assert.equal(browserState.rawLeak, false);
  assert.doesNotMatch(JSON.stringify({ projection, state }), /SHOULD_NOT_RENDER|stdout|stderr|tool_payload/);
});

test('UserActionApi records retry with repair evidence as an action result', async () => {
  const projection = {
    schemaVersion: 'sciforge.conversation-projection.v1',
    conversationId: 'conversation-retry',
    visibleAnswer: {
      status: 'repair-needed',
      diagnostic: 'verification missing',
      artifactRefs: ['artifact:partial-report'],
    },
    activeRun: { id: 'run-retry', status: 'repair-needed' },
    artifacts: [{ ref: 'artifact:partial-report', label: 'Partial report' }],
    executionProcess: [],
    recoverActions: ['Retry with repair evidence.'],
    verificationState: { status: 'failed' },
    auditRefs: ['artifact:partial-report', 'audit:verification'],
    diagnostics: [],
  };
  const session = testSession({
    runs: [{
      id: 'run-retry',
      scenarioId: 'literature-evidence-review',
      status: 'failed',
      prompt: 'retry',
      response: 'failed',
      createdAt: '2026-05-17T00:00:00.000Z',
      raw: { displayIntent: { conversationProjection: projection } },
    }],
    artifacts: [deliveryArtifact('partial-report')],
  });

  const actionApi = createLocalUserActionApi();
  const result = await actionApi.requestRetry({
    session,
    runId: 'run-retry',
    reason: 'repair missing verifier refs',
    scope: 'with-repair-evidence',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.action?.type, 'request-retry');
  assert.equal(result.action?.type === 'request-retry' ? result.action.scope : '', 'with-repair-evidence');
  assert.deepEqual(result.action?.type === 'request-retry' ? result.action.auditRefs : [], ['artifact:partial-report', 'audit:verification']);
  assert.equal(result.projection?.visibleAnswer.status, 'repair-needed');
});

function testSession(overrides: Partial<SciForgeSession> = {}): SciForgeSession {
  return {
    schemaVersion: 2,
    sessionId: 'session-projection-api',
    scenarioId: 'literature-evidence-review',
    title: 'Projection API test',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    messages: [],
    runs: [],
    uiManifest: [],
    claims: [],
    executionUnits: [],
    artifacts: [],
    notebook: [],
    versions: [],
    hiddenResultSlotIds: [],
    ...overrides,
  };
}

function deliveryArtifact(id: string, overrides: Partial<RuntimeArtifact> = {}): RuntimeArtifact {
  return {
    id,
    type: 'research-report',
    producerScenario: 'literature-evidence-review',
    schemaVersion: '1',
    metadata: { title: id },
    data: { markdown: `# ${id}` },
    delivery: {
      contractId: 'sciforge.artifact-delivery.v1',
      ref: `artifact:${id}`,
      role: 'primary-deliverable',
      declaredMediaType: 'text/markdown',
      declaredExtension: 'md',
      contentShape: 'raw-file',
      readableRef: `.sciforge/artifacts/${id}.md`,
      previewPolicy: 'inline',
    },
    ...overrides,
  };
}
