import type { ScenarioInstanceId, SciForgeReference, SciForgeSession } from '../domain';

export type UIActionType =
  | 'submit-turn'
  | 'select-object'
  | 'load-artifact-preview'
  | 'request-retry'
  | 'trigger-recover'
  | 'approve-result'
  | 'update-capability-preference'
  | 'cancel-run'
  | 'concurrency-decision'
  | 'open-debug-audit';

export interface UIActionBase {
  kind: 'UIAction';
  id: string;
  type: UIActionType;
  sessionId: string;
  scenarioId: ScenarioInstanceId;
  createdAt: string;
}

export type UIAction =
  | (UIActionBase & {
    type: 'submit-turn';
    promptPreview: string;
    referenceRefs: string[];
  })
  | (UIActionBase & {
    type: 'select-object';
    objectRef: string;
    intent: 'inspect' | 'ask-followup' | 'compare' | 'pin';
  })
  | (UIActionBase & {
    type: 'load-artifact-preview';
    artifactRef: string;
    byteLimit?: number;
  })
  | (UIActionBase & {
    type: 'request-retry';
    runId?: string;
    reason?: string;
    scope: 'same-input' | 'with-repair-evidence' | 'rediscover-capabilities';
    auditRefs: string[];
  })
  | (UIActionBase & {
    type: 'trigger-recover';
    runId?: string;
    recoverAction: string;
    auditRefs: string[];
  })
  | (UIActionBase & {
    type: 'approve-result';
    runId?: string;
    approval: 'human-approved' | 'reject-result';
    notePreview?: string;
  })
  | (UIActionBase & {
    type: 'update-capability-preference';
    preference: Record<string, unknown>;
  })
  | (UIActionBase & {
    type: 'cancel-run';
    runId?: string;
    rejectedGuidanceIds: string[];
  })
  | (UIActionBase & {
    type: 'concurrency-decision';
    activeRunId?: string;
    decision: 'queue-guidance' | 'wait' | 'attach' | 'cancel' | 'fork';
    promptPreview?: string;
  })
  | (UIActionBase & {
    type: 'open-debug-audit';
    runId?: string;
    auditRefs: string[];
  });

export type SubmitTurnUIAction = Extract<UIAction, { type: 'submit-turn' }>;
export type SelectObjectUIAction = Extract<UIAction, { type: 'select-object' }>;
export type LoadArtifactPreviewUIAction = Extract<UIAction, { type: 'load-artifact-preview' }>;
export type RequestRetryUIAction = Extract<UIAction, { type: 'request-retry' }>;
export type TriggerRecoverUIAction = Extract<UIAction, { type: 'trigger-recover' }>;
export type ApproveResultUIAction = Extract<UIAction, { type: 'approve-result' }>;
export type UpdateCapabilityPreferenceUIAction = Extract<UIAction, { type: 'update-capability-preference' }>;
export type CancelRunUIAction = Extract<UIAction, { type: 'cancel-run' }>;
export type ConcurrencyDecisionUIAction = Extract<UIAction, { type: 'concurrency-decision' }>;
export type OpenDebugAuditUIAction = Extract<UIAction, { type: 'open-debug-audit' }>;

type UIActionInput = {
  [Action in UIAction as Action['type']]: Omit<Action, 'kind' | 'id' | 'sessionId' | 'scenarioId' | 'createdAt'>;
}[UIActionType];

export type UIActionSession = SciForgeSession & {
  uiActionAuditLog?: UIAction[];
};

export function createUIAction(
  input: UIActionInput & {
    session: SciForgeSession;
    id: string;
    createdAt: string;
  },
): UIAction {
  const { session, id, createdAt, ...rest } = input;
  return {
    kind: 'UIAction',
    id,
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    createdAt,
    ...rest,
  } as UIAction;
}

export function createSubmitTurnUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  prompt: string;
  references?: SciForgeReference[];
}): SubmitTurnUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'submit-turn',
    promptPreview: compactUIActionPromptPreview(input.prompt),
    referenceRefs: uiActionReferenceRefs(input.references ?? []),
  }) as SubmitTurnUIAction;
}

export function createSelectObjectUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  objectRef: string;
  intent: SelectObjectUIAction['intent'];
}): SelectObjectUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'select-object',
    objectRef: input.objectRef,
    intent: input.intent,
  }) as SelectObjectUIAction;
}

export function createLoadArtifactPreviewUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  artifactRef: string;
  byteLimit?: number;
}): LoadArtifactPreviewUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'load-artifact-preview',
    artifactRef: input.artifactRef,
    byteLimit: input.byteLimit,
  }) as LoadArtifactPreviewUIAction;
}

export function createRequestRetryUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  runId?: string;
  reason?: string;
  scope: RequestRetryUIAction['scope'];
  auditRefs?: string[];
}): RequestRetryUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'request-retry',
    runId: input.runId,
    reason: input.reason,
    scope: input.scope,
    auditRefs: uniqueStringList(input.auditRefs ?? []),
  }) as RequestRetryUIAction;
}

export function createTriggerRecoverUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  runId?: string;
  recoverAction: string;
  auditRefs?: string[];
}): TriggerRecoverUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'trigger-recover',
    runId: input.runId,
    recoverAction: input.recoverAction,
    auditRefs: uniqueStringList(input.auditRefs ?? []),
  }) as TriggerRecoverUIAction;
}

export function createApproveResultUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  runId?: string;
  approval: ApproveResultUIAction['approval'];
  note?: string;
}): ApproveResultUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'approve-result',
    runId: input.runId,
    approval: input.approval,
    notePreview: input.note ? compactUIActionPromptPreview(input.note) : undefined,
  }) as ApproveResultUIAction;
}

export function createUpdateCapabilityPreferenceUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  preference: Record<string, unknown>;
}): UpdateCapabilityPreferenceUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'update-capability-preference',
    preference: scrubPreference(input.preference),
  }) as UpdateCapabilityPreferenceUIAction;
}

export function createCancelRunUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  runId?: string;
  rejectedGuidanceIds?: string[];
}): CancelRunUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'cancel-run',
    runId: input.runId,
    rejectedGuidanceIds: uniqueStringList(input.rejectedGuidanceIds ?? []),
  }) as CancelRunUIAction;
}

export function createConcurrencyDecisionUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  activeRunId?: string;
  decision: ConcurrencyDecisionUIAction['decision'];
  prompt?: string;
}): ConcurrencyDecisionUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'concurrency-decision',
    activeRunId: input.activeRunId,
    decision: input.decision,
    promptPreview: input.prompt ? compactUIActionPromptPreview(input.prompt) : undefined,
  }) as ConcurrencyDecisionUIAction;
}

export function createOpenDebugAuditUIAction(input: {
  session: SciForgeSession;
  id: string;
  createdAt: string;
  runId?: string;
  auditRefs?: string[];
}): OpenDebugAuditUIAction {
  return createUIAction({
    id: input.id,
    session: input.session,
    createdAt: input.createdAt,
    type: 'open-debug-audit',
    runId: input.runId,
    auditRefs: uniqueStringList(input.auditRefs ?? []),
  }) as OpenDebugAuditUIAction;
}

export function uiActionReferenceRefs(references: SciForgeReference[]): string[] {
  return uniqueStringList(references.map((reference) => reference.ref));
}

export function compactUIActionPromptPreview(prompt: string, limit = 160): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1).trim()}...` : compact;
}

export function appendUIActionAuditLog(log: UIAction[], action: UIAction, limit = 64): UIAction[] {
  return [...log, action].slice(-limit);
}

export function uiActionAuditLogForSession(session: SciForgeSession): UIAction[] {
  const log = (session as UIActionSession).uiActionAuditLog;
  if (!Array.isArray(log)) return [];
  return log.filter(isUIAction);
}

export function recordUIActionInSession(session: SciForgeSession, action: UIAction, limit = 64): UIActionSession {
  const current = uiActionAuditLogForSession(session);
  return {
    ...session,
    uiActionAuditLog: appendUIActionAuditLog(current, action, limit),
    updatedAt: action.createdAt,
  };
}

function uniqueStringList(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function isUIAction(value: unknown): value is UIAction {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<UIAction>;
  return record.kind === 'UIAction'
    && typeof record.id === 'string'
    && typeof record.sessionId === 'string'
    && typeof record.scenarioId === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.type === 'string'
    && ['submit-turn', 'select-object', 'load-artifact-preview', 'request-retry', 'trigger-recover', 'approve-result', 'update-capability-preference', 'cancel-run', 'concurrency-decision', 'open-debug-audit'].includes(record.type);
}

function scrubPreference(preference: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(preference).filter(([key]) => !/secret|token|api.?key|authorization|password/i.test(key)));
}
