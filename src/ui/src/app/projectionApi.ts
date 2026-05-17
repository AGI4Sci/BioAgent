import type { PreviewDescriptor, RuntimeArtifact, SciForgeRun, SciForgeSession } from '../domain';
import { artifactHasUserFacingDelivery } from '../../../../packages/support/object-references';
import { normalizeArtifactPreviewDescriptor } from './results/previewDescriptor';
import {
  conversationProjectionArtifactRefs,
  conversationProjectionForSession,
  conversationProjectionRecoverActions,
  conversationProjectionStatus,
  conversationProjectionVisibleText,
} from './conversation-projection-view-model';
import { runAuditRefs, runPresentationState } from './results-renderer-execution-model';
import {
  createApproveResultUIAction,
  createLoadArtifactPreviewUIAction,
  createRequestRetryUIAction,
  createSelectObjectUIAction,
  createSubmitTurnUIAction,
  createUpdateCapabilityPreferenceUIAction,
  type UIAction,
} from './uiActionBoundary';

export interface ProjectionApi {
  getConversationProjection(input: { session: SciForgeSession; focusedRunId?: string }): Promise<ConversationProjectionView>;
  listRuns(input: { session: SciForgeSession; filter?: 'all' | 'active' | 'recoverable' | 'completed' | 'failed' }): Promise<RunSummary[]>;
  getRunProjection(input: { session: SciForgeSession; runId: string }): Promise<RunProjectionView>;
  getArtifactPreview(input: { session: SciForgeSession; artifactRef: string; mode?: 'summary' | 'inline' | 'manual-load' | 'raw'; byteLimit?: number }): Promise<ArtifactPreview>;
  getExecutionTrace(input: { session: SciForgeSession; runId: string; audience: 'user' | 'debug' | 'audit' }): Promise<ExecutionTraceView>;
  getCapabilityPlanSummary(input: { session: SciForgeSession; runId?: string }): Promise<CapabilityPlanSummary | undefined>;
}

export interface UserActionApi {
  submitTurn(input: { session: SciForgeSession; text: string; selectedRefs?: string[] }): Promise<UserActionResult>;
  selectObject(input: { session: SciForgeSession; objectRef: string; intent: 'inspect' | 'ask-followup' | 'compare' | 'pin' }): Promise<UserActionResult>;
  loadArtifactPreview(input: { session: SciForgeSession; artifactRef: string; byteLimit?: number }): Promise<ArtifactPreview>;
  requestRetry(input: { session: SciForgeSession; runId: string; reason?: string; scope: 'same-input' | 'with-repair-evidence' | 'rediscover-capabilities' }): Promise<UserActionResult>;
  approveResult(input: { session: SciForgeSession; runId: string; approval: 'human-approved' | 'reject-result'; note?: string }): Promise<UserActionResult>;
  updateCapabilityPreference(input: { session: SciForgeSession; preference: Record<string, unknown> }): Promise<UserActionResult>;
}

export interface ConversationProjectionView {
  sessionId: string;
  visibleAnswer: {
    status: ReturnType<typeof conversationProjectionStatus>;
    text: string;
    primaryArtifactRefs: string[];
    nextActions: UserActionDescriptor[];
  };
  focusedRun?: RunSummary;
  artifacts: ArtifactCard[];
  verification: VerificationSummary;
  debugAvailable: boolean;
}

export interface RunSummary {
  runId: string;
  status: string;
  presentationKind: string;
  title: string;
  artifactRefs: string[];
  recoverActions: string[];
}

export interface RunProjectionView {
  run: RunSummary;
  answer: ConversationProjectionView['visibleAnswer'];
  trace: ExecutionTraceView;
}

export interface ArtifactPreview {
  artifactRef: string;
  status: 'ready' | 'requires-manual-load' | 'too-large' | 'unavailable' | 'unsupported';
  title: string;
  mediaType?: string;
  sizeBytes?: number;
  preview?: string;
  structuredData?: unknown;
  actions: UserActionDescriptor[];
}

export interface ExecutionTraceView {
  runId: string;
  audience: 'user' | 'debug' | 'audit';
  events: Array<{ id: string; label: string; ref?: string }>;
}

export interface CapabilityPlanSummary {
  status: 'none' | 'available';
  summary: string;
  debugRefs: string[];
}

export interface UserActionResult {
  accepted: boolean;
  projection?: ConversationProjectionView;
  queuedRunId?: string;
  message?: string;
  auditRef?: string;
  action?: UIAction;
}

export interface UserActionDescriptor {
  id: string;
  label: string;
  kind: 'inspect' | 'load-preview' | 'retry' | 'approve' | 'cancel' | 'debug' | 'capability-preference';
  ref?: string;
}

interface ArtifactCard {
  artifactRef: string;
  title: string;
  type: string;
}

interface VerificationSummary {
  status: string;
  verifierRef?: string;
}

export function createLocalProjectionApi(): ProjectionApi {
  return {
    async getConversationProjection(input) {
      const run = focusedRun(input.session, input.focusedRunId);
      return conversationProjectionView(input.session, run);
    },
    async listRuns(input) {
      return input.session.runs
        .map((run) => runSummary(input.session, run))
        .filter((summary) => runSummaryMatchesFilter(summary, input.filter ?? 'all'));
    },
    async getRunProjection(input) {
      const run = focusedRun(input.session, input.runId);
      if (!run) throw new Error(`Unknown run ${input.runId}`);
      const projection = conversationProjectionView(input.session, run);
      return {
        run: runSummary(input.session, run),
        answer: projection.visibleAnswer,
        trace: executionTraceView(input.session, run, 'user'),
      };
    },
    async getArtifactPreview(input) {
      return artifactPreviewView(input.session, input.artifactRef, input.mode ?? 'summary', input.byteLimit);
    },
    async getExecutionTrace(input) {
      const run = focusedRun(input.session, input.runId);
      if (!run) throw new Error(`Unknown run ${input.runId}`);
      return executionTraceView(input.session, run, input.audience);
    },
    async getCapabilityPlanSummary(input) {
      return capabilityPlanSummary(input.session, input.runId);
    },
  };
}

export function createLocalUserActionApi(projectionApi: ProjectionApi = createLocalProjectionApi()): UserActionApi {
  return {
    async submitTurn(input) {
      const action = createSubmitTurnUIAction({
        session: input.session,
        id: actionId('submit-turn'),
        createdAt: new Date().toISOString(),
        prompt: input.text,
        references: (input.selectedRefs ?? []).map((ref) => ({ id: ref, kind: 'task-result', ref, title: ref })),
      });
      return acceptedAction(action, await projectionApi.getConversationProjection({ session: input.session }));
    },
    async selectObject(input) {
      const action = createSelectObjectUIAction({
        session: input.session,
        id: actionId('select-object'),
        createdAt: new Date().toISOString(),
        objectRef: input.objectRef,
        intent: input.intent,
      });
      return acceptedAction(action, await projectionApi.getConversationProjection({ session: input.session }), '对象已通过 UserActionApi 选中。');
    },
    async loadArtifactPreview(input) {
      return projectionApi.getArtifactPreview({
        session: input.session,
        artifactRef: input.artifactRef,
        mode: 'manual-load',
        byteLimit: input.byteLimit,
      });
    },
    async requestRetry(input) {
      const action = createRequestRetryUIAction({
        session: input.session,
        id: actionId('request-retry'),
        createdAt: new Date().toISOString(),
        runId: input.runId,
        reason: input.reason,
        scope: input.scope,
        auditRefs: runAuditRefs(input.session, focusedRun(input.session, input.runId)),
      });
      return acceptedAction(action, await projectionApi.getConversationProjection({ session: input.session, focusedRunId: input.runId }), '重试请求已记录为语义动作。');
    },
    async approveResult(input) {
      const action = createApproveResultUIAction({
        session: input.session,
        id: actionId('approve-result'),
        createdAt: new Date().toISOString(),
        runId: input.runId,
        approval: input.approval,
        note: input.note,
      });
      return acceptedAction(action, await projectionApi.getConversationProjection({ session: input.session, focusedRunId: input.runId }));
    },
    async updateCapabilityPreference(input) {
      const action = createUpdateCapabilityPreferenceUIAction({
        session: input.session,
        id: actionId('update-capability-preference'),
        createdAt: new Date().toISOString(),
        preference: input.preference,
      });
      return acceptedAction(action, await projectionApi.getConversationProjection({ session: input.session }));
    },
  };
}

function conversationProjectionView(session: SciForgeSession, run?: SciForgeRun): ConversationProjectionView {
  const projection = conversationProjectionForSession(session, run);
  const presentation = runPresentationState(session, run);
  const artifactRefs = projection ? conversationProjectionArtifactRefs(projection) : [];
  const recoverActions = projection ? conversationProjectionRecoverActions(projection) : [];
  return {
    sessionId: session.sessionId,
    visibleAnswer: {
      status: projection ? conversationProjectionStatus(projection) : 'idle',
      text: projection ? conversationProjectionVisibleText(projection) ?? projection.visibleAnswer?.diagnostic ?? presentation.reason : presentation.reason,
      primaryArtifactRefs: artifactRefs,
      nextActions: [
        ...artifactRefs.map((ref) => ({ id: `inspect:${ref}`, label: '查看 artifact', kind: 'inspect' as const, ref })),
        ...recoverActions.map((action, index) => ({ id: `retry:${index}`, label: action, kind: 'retry' as const })),
      ],
    },
    focusedRun: run ? runSummary(session, run) : undefined,
    artifacts: artifactRefs.map((ref) => artifactCard(session, ref)).filter((card): card is ArtifactCard => Boolean(card)),
    verification: {
      status: projection?.verificationState?.status ?? 'unknown',
      verifierRef: projection?.verificationState?.verifierRef,
    },
    debugAvailable: runAuditRefs(session, run).length > 0,
  };
}

function runSummary(session: SciForgeSession, run: SciForgeRun): RunSummary {
  const projection = conversationProjectionForSession(session, run);
  const presentation = runPresentationState(session, run);
  return {
    runId: run.id,
    status: projection ? conversationProjectionStatus(projection) : run.status,
    presentationKind: presentation.kind,
    title: presentation.title,
    artifactRefs: projection ? conversationProjectionArtifactRefs(projection) : [],
    recoverActions: projection ? conversationProjectionRecoverActions(projection) : [],
  };
}

function artifactPreviewView(
  session: SciForgeSession,
  artifactRef: string,
  mode: 'summary' | 'inline' | 'manual-load' | 'raw',
  byteLimit: number | undefined,
): ArtifactPreview {
  const artifact = artifactForRef(session, artifactRef);
  if (!artifact) {
    return {
      artifactRef,
      status: 'unavailable',
      title: artifactRef,
      actions: [],
    };
  }
  if (!artifactHasUserFacingDelivery(artifact)) {
    return {
      artifactRef,
      status: 'unsupported',
      title: artifactTitle(artifact),
      mediaType: artifact.type,
      actions: [{ id: `debug:${artifactRef}`, label: '查看调试信息', kind: 'debug', ref: artifactRef }],
    };
  }
  const descriptor = normalizeArtifactPreviewDescriptor(artifact, artifactPath(artifact));
  const sizeBytes = descriptor?.sizeBytes
    ?? numberField(isRecord(artifact.delivery) ? artifact.delivery.sizeBytes : undefined)
    ?? numberField(isRecord(artifact.metadata) ? artifact.metadata.sizeBytes : undefined);
  const manual = mode !== 'manual-load' && (descriptor?.inlinePolicy !== 'inline' || (sizeBytes ?? 0) > (byteLimit ?? 1024 * 1024));
  return {
    artifactRef,
    status: manual ? 'requires-manual-load' : 'ready',
    title: artifactTitle(artifact),
    mediaType: stringField(artifact.delivery?.declaredMediaType) ?? artifact.type,
    sizeBytes,
    preview: manual ? undefined : inlineArtifactPreview(artifact, descriptor),
    structuredData: manual || mode === 'raw' ? undefined : structuredArtifactData(artifact),
    actions: manual
      ? [{ id: `load:${artifactRef}`, label: '加载预览', kind: 'load-preview', ref: artifactRef }]
      : [{ id: `select:${artifactRef}`, label: '基于该 artifact 追问', kind: 'inspect', ref: artifactRef }],
  };
}

function executionTraceView(session: SciForgeSession, run: SciForgeRun, audience: 'user' | 'debug' | 'audit'): ExecutionTraceView {
  const projection = conversationProjectionForSession(session, run);
  const projectionEvents = projection?.executionProcess.map((event) => ({ id: event.eventId, label: event.summary || event.type }));
  if (projectionEvents?.length) return { runId: run.id, audience, events: projectionEvents };
  if (audience === 'user') return { runId: run.id, audience, events: [] };
  return {
    runId: run.id,
    audience,
    events: runAuditRefs(session, run).map((ref, index) => ({ id: `audit:${index}`, label: 'audit ref', ref })),
  };
}

function capabilityPlanSummary(session: SciForgeSession, runId?: string): CapabilityPlanSummary | undefined {
  const run = focusedRun(session, runId);
  const raw = isRecord(run?.raw) ? run.raw : undefined;
  const summary = stringField(raw?.capabilityPlanSummary) ?? stringField(raw?.capabilityDiscoverySummary);
  if (!summary) return undefined;
  return {
    status: 'available',
    summary,
    debugRefs: runAuditRefs(session, run).filter((ref) => /capability|discovery/i.test(ref)),
  };
}

function acceptedAction(action: UIAction, projection: ConversationProjectionView, message?: string): UserActionResult {
  return {
    accepted: true,
    projection,
    message,
    auditRef: `ui-action:${action.id}`,
    action,
  };
}

function runSummaryMatchesFilter(summary: RunSummary, filter: 'all' | 'active' | 'recoverable' | 'completed' | 'failed') {
  if (filter === 'all') return true;
  if (filter === 'active') return summary.presentationKind === 'running';
  if (filter === 'recoverable') return summary.presentationKind === 'recoverable' || summary.recoverActions.length > 0;
  if (filter === 'completed') return summary.status === 'satisfied';
  return summary.presentationKind === 'failed';
}

function focusedRun(session: SciForgeSession, focusedRunId?: string) {
  return focusedRunId ? session.runs.find((run) => run.id === focusedRunId) : session.runs.at(-1);
}

function artifactForRef(session: SciForgeSession, artifactRef: string) {
  const id = artifactRef.replace(/^artifact::?/, '');
  return session.artifacts.find((artifact) => artifact.id === id || artifact.delivery?.ref === artifactRef);
}

function artifactCard(session: SciForgeSession, artifactRef: string): ArtifactCard | undefined {
  const artifact = artifactForRef(session, artifactRef);
  if (!artifact || !artifactHasUserFacingDelivery(artifact)) return undefined;
  return {
    artifactRef,
    title: artifactTitle(artifact),
    type: artifact.type,
  };
}

function artifactTitle(artifact: RuntimeArtifact) {
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : undefined;
  return stringField(metadata?.title) || stringField(metadata?.label) || artifact.id;
}

function artifactPath(artifact: RuntimeArtifact) {
  return stringField(artifact.delivery?.readableRef)
    ?? stringField(artifact.dataRef)
    ?? stringField(artifact.path);
}

function inlineArtifactPreview(artifact: RuntimeArtifact, descriptor?: PreviewDescriptor) {
  if (descriptor?.inlinePolicy && descriptor.inlinePolicy !== 'inline') return undefined;
  const data = artifact.data;
  if (typeof data === 'string') return data.slice(0, 12_000);
  if (isRecord(data)) {
    const markdown = stringField(data.markdown) ?? stringField(data.content) ?? stringField(data.text);
    if (markdown) return markdown.slice(0, 12_000);
  }
  return undefined;
}

function structuredArtifactData(artifact: RuntimeArtifact) {
  return typeof artifact.data === 'string' ? undefined : artifact.data;
}

function actionId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
