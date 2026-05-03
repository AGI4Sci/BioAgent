import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import type { GatewayRequest, ToolPayload, WorkspaceRuntimeCallbacks } from './runtime-types.js';
import { isRecord, toStringList, uniqueStrings } from './gateway-utils.js';
import { emitWorkspaceRuntimeEvent } from './workspace-runtime-events.js';

const VISION_TOOL_ID = 'local.vision-sense';
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADgwGOSyRGjgAAAABJRU5ErkJggg==',
  'base64',
);

type GenericVisionAction =
  | { type: 'click'; x: number; y: number }
  | { type: 'double_click'; x: number; y: number }
  | { type: 'drag'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'type_text'; text: string }
  | { type: 'press_key'; key: string }
  | { type: 'hotkey'; keys: string[] }
  | { type: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount?: number }
  | { type: 'wait'; ms?: number };

interface VisionSenseConfig {
  desktopBridgeEnabled: boolean;
  dryRun: boolean;
  captureDisplays: number[];
  runId?: string;
  outputDir?: string;
  maxSteps: number;
  plannedActions: GenericVisionAction[];
}

interface ScreenshotRef {
  id: string;
  path: string;
  absPath: string;
  displayId: number;
  width?: number;
  height?: number;
  sha256: string;
  bytes: number;
}

interface LoopStep {
  id: string;
  kind: string;
  status: 'done' | 'failed' | 'blocked';
  screenshotRefs?: Array<ReturnType<typeof toTraceScreenshotRef>>;
  action?: GenericVisionAction;
  executor?: string;
  stdout?: string;
  stderr?: string;
  failureReason?: string;
}

export async function tryRunVisionSenseRuntime(
  request: GatewayRequest,
  callbacks: WorkspaceRuntimeCallbacks = {},
): Promise<ToolPayload | undefined> {
  if (!visionSenseSelected(request)) return undefined;
  if (!looksLikeComputerUseRequest(request.prompt)) return undefined;

  const workspace = resolve(request.workspacePath || process.cwd());
  const config = await loadVisionSenseConfig(workspace, request);
  emitWorkspaceRuntimeEvent(callbacks, {
    type: 'vision-sense-runtime-selected',
    source: 'workspace-runtime',
    toolName: VISION_TOOL_ID,
    status: 'running',
    message: 'Selected generic vision-sense Computer Use loop.',
    detail: JSON.stringify({
      dryRun: config.dryRun,
      captureDisplays: config.captureDisplays,
      plannedActions: config.plannedActions.length,
    }),
  });

  if (!config.desktopBridgeEnabled) {
    return genericBridgeBlockedPayload(
      request,
      workspace,
      'local.vision-sense is selected, but the generic desktop bridge is disabled. Enable SCIFORGE_VISION_DESKTOP_BRIDGE=1 or .sciforge/config.json visionSense.desktopBridgeEnabled=true.',
      { selectedRuntime: 'vision-sense-generic-computer-use-loop', selectedToolId: VISION_TOOL_ID },
    );
  }

  return runGenericVisionComputerUseLoop(request, workspace, config, callbacks);
}

function visionSenseSelected(request: GatewayRequest) {
  const selected = uniqueStrings([
    ...(request.selectedToolIds ?? []),
    ...toStringList(request.uiState?.selectedToolIds),
  ]);
  return selected.includes(VISION_TOOL_ID);
}

function looksLikeComputerUseRequest(prompt: string) {
  return /computer\s*use|gui|desktop|screen|screenshot|mouse|keyboard|click|type|scroll|drag|browser|word|powerpoint|ppt|电脑|桌面|屏幕|截图|鼠标|键盘|点击|输入|滚动|拖拽|操作|使用|打开|创建|保存|文档|演示文稿|应用/i.test(prompt);
}

async function loadVisionSenseConfig(workspace: string, request: GatewayRequest): Promise<VisionSenseConfig> {
  const fileConfig = await readWorkspaceVisionConfig(workspace);
  const requestConfig = isRecord(request.uiState?.visionSenseConfig) ? request.uiState.visionSenseConfig : {};
  const displayValue = envOrValue(process.env.SCIFORGE_VISION_CAPTURE_DISPLAYS, requestConfig.captureDisplays, fileConfig.captureDisplays);
  const captureDisplays = parseDisplayList(displayValue);
  return {
    desktopBridgeEnabled: booleanConfig(
      process.env.SCIFORGE_VISION_DESKTOP_BRIDGE,
      requestConfig.desktopBridgeEnabled,
      fileConfig.desktopBridgeEnabled,
      process.platform === 'darwin',
    ),
    dryRun: booleanConfig(
      process.env.SCIFORGE_VISION_DESKTOP_BRIDGE_DRY_RUN,
      requestConfig.dryRun,
      fileConfig.dryRun,
      false,
    ),
    captureDisplays: captureDisplays.length ? captureDisplays : [1, 2],
    runId: stringConfig(process.env.SCIFORGE_VISION_RUN_ID, requestConfig.runId, fileConfig.runId),
    outputDir: stringConfig(process.env.SCIFORGE_VISION_OUTPUT_DIR, requestConfig.outputDir, fileConfig.outputDir),
    maxSteps: numberConfig(process.env.SCIFORGE_VISION_MAX_STEPS, requestConfig.maxSteps, fileConfig.maxSteps) ?? 8,
    plannedActions: parseGenericActions(envOrValue(process.env.SCIFORGE_VISION_ACTIONS_JSON, requestConfig.actions, fileConfig.actions)),
  };
}

async function readWorkspaceVisionConfig(workspace: string): Promise<Record<string, unknown>> {
  const configPath = join(workspace, '.sciforge', 'config.json');
  try {
    const parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
    if (isRecord(parsed) && isRecord(parsed.visionSense)) return parsed.visionSense;
  } catch {
    return {};
  }
  return {};
}

async function runGenericVisionComputerUseLoop(
  request: GatewayRequest,
  workspace: string,
  config: VisionSenseConfig,
  callbacks: WorkspaceRuntimeCallbacks,
): Promise<ToolPayload> {
  const runId = sanitizeId(config.runId || `generic-cu-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`);
  const runDir = resolve(config.outputDir || join(workspace, '.sciforge', 'vision-runs', runId));
  await mkdir(runDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const steps: LoopStep[] = [];
  const beforeRefs = await captureDisplays(workspace, runDir, 'step-000-before', config);
  steps.push({
    id: 'step-000-observe',
    kind: 'screenshot',
    status: 'done',
    screenshotRefs: beforeRefs.map(toTraceScreenshotRef),
  });

  let executionStatus: 'done' | 'failed-with-reason' = 'done';
  let failureReason = '';
  const executableActions = config.plannedActions.slice(0, config.maxSteps);
  if (!executableActions.length) {
    executionStatus = 'failed-with-reason';
    failureReason = [
      'Generic Vision Computer Use loop is active, but no planner/grounder actions were provided.',
      'SciForge must provide a VisionPlanner + Grounder that emits generic actions such as click/type_text/press_key/hotkey/scroll/drag/wait.',
      'The runtime captured real screenshot refs and stopped instead of using app-specific shortcuts or AgentServer repository scans.',
    ].join(' ');
    steps.push({
      id: 'step-001-plan',
      kind: 'planning',
      status: 'blocked',
      failureReason,
    });
  } else {
    for (const [index, action] of executableActions.entries()) {
      emitWorkspaceRuntimeEvent(callbacks, {
        type: 'vision-sense-generic-action',
        source: 'workspace-runtime',
        toolName: VISION_TOOL_ID,
        status: 'running',
        message: `Executing generic Computer Use action ${index + 1}/${executableActions.length}: ${action.type}`,
      });
      const result = config.dryRun
        ? { exitCode: 0, stdout: 'dry-run', stderr: '' }
        : await executeGenericMacAction(action);
      const ok = result.exitCode === 0;
      if (!ok) {
        executionStatus = 'failed-with-reason';
        failureReason = result.stderr || result.stdout || `Generic action ${action.type} failed with exit ${result.exitCode}`;
      }
      steps.push({
        id: `step-${String(index + 1).padStart(3, '0')}-execute-${action.type}`,
        kind: 'gui-execution',
        status: ok ? 'done' : 'failed',
        action,
        executor: config.dryRun ? 'dry-run-generic-gui-executor' : 'macos-system-events-generic-gui-executor',
        stdout: result.stdout.trim() || undefined,
        stderr: result.stderr.trim() || undefined,
        failureReason: ok ? undefined : failureReason,
      });
      if (!ok) break;
    }
  }

  const afterRefs = await captureDisplays(workspace, runDir, 'step-999-after', config);
  steps.push({
    id: 'step-999-verify',
    kind: 'screenshot',
    status: 'done',
    screenshotRefs: afterRefs.map(toTraceScreenshotRef),
  });

  const completedAt = new Date().toISOString();
  const trace = {
    schemaVersion: 'sciforge.vision-trace.v1',
    runId,
    tool: VISION_TOOL_ID,
    runtime: 'sciforge.workspace-runtime.vision-sense-generic-loop',
    executionBoundary: config.dryRun ? 'dry-run-generic-gui-executor' : 'macos-system-events-generic-gui-executor',
    createdAt,
    completedAt,
    request: {
      text: request.prompt,
      selectedToolIds: request.selectedToolIds,
    },
    config: {
      captureDisplays: config.captureDisplays,
      outputDir: workspaceRel(workspace, runDir),
      maxSteps: config.maxSteps,
      dryRun: config.dryRun,
    },
    imageMemory: {
      policy: 'file-ref-only',
      reason: 'Multi-turn memory keeps screenshot paths, hashes, dimensions, and display ids; it never stores inline image payloads.',
      refs: [...beforeRefs, ...afterRefs].map(toTraceScreenshotRef),
    },
    genericComputerUse: {
      actionSchema: ['click', 'double_click', 'drag', 'type_text', 'press_key', 'hotkey', 'scroll', 'wait'],
      appSpecificShortcuts: [],
      requires: ['VisionPlanner', 'Grounder', 'GuiExecutor', 'Verifier'],
    },
    steps,
  };
  const tracePath = join(runDir, 'vision-trace.json');
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');

  return genericLoopPayload({
    request,
    workspace,
    runId,
    tracePath,
    beforeRefs,
    afterRefs,
    status: executionStatus,
    failureReason,
    actionCount: executableActions.length,
    dryRun: config.dryRun,
  });
}

async function captureDisplays(workspace: string, runDir: string, prefix: string, config: VisionSenseConfig) {
  const refs: ScreenshotRef[] = [];
  for (const displayId of config.captureDisplays) {
    const absPath = join(runDir, `${prefix}-display-${displayId}.png`);
    if (config.dryRun) {
      await writeFile(absPath, ONE_BY_ONE_PNG);
    } else {
      const result = await runCommand('screencapture', ['-x', '-D', String(displayId), absPath], { timeoutMs: 15000 });
      if (result.exitCode !== 0) {
        throw new Error(`screencapture display ${displayId} failed: ${result.stderr || result.stdout || `exit ${result.exitCode}`}`);
      }
    }
    const stats = await stat(absPath);
    const bytes = await readFile(absPath);
    const dimensions = pngDimensions(bytes);
    refs.push({
      id: basename(absPath, '.png'),
      path: workspaceRel(workspace, absPath),
      absPath,
      displayId,
      width: dimensions?.width,
      height: dimensions?.height,
      sha256: sha256(bytes),
      bytes: stats.size,
    });
  }
  return refs;
}

function genericLoopPayload(params: {
  request: GatewayRequest;
  workspace: string;
  runId: string;
  tracePath: string;
  beforeRefs: ScreenshotRef[];
  afterRefs: ScreenshotRef[];
  status: 'done' | 'failed-with-reason';
  failureReason: string;
  actionCount: number;
  dryRun: boolean;
}): ToolPayload {
  const traceRel = workspaceRel(params.workspace, params.tracePath);
  const allRefs = [...params.beforeRefs, ...params.afterRefs];
  const isDone = params.status === 'done';
  return {
    message: isDone
      ? `vision-sense generic Computer Use loop completed ${params.actionCount} action(s). Trace: ${traceRel}.`
      : `vision-sense generic Computer Use loop stopped with failed-with-reason: ${params.failureReason}`,
    confidence: isDone ? 0.72 : 0.35,
    claimType: 'execution',
    evidenceLevel: 'runtime',
    reasoningTrace: [
      'local.vision-sense was selected and routed to the generic Computer Use loop.',
      'The runtime uses app-agnostic screenshot refs and generic mouse/keyboard action schema.',
      params.failureReason || `Executed ${params.actionCount} generic action(s).`,
      'No app-specific shortcut or AgentServer repository scan was used.',
    ].filter(Boolean).join('\n'),
    claims: [{
      text: isDone
        ? 'SciForge executed generic Computer Use actions and wrote file-ref-only visual memory.'
        : params.failureReason,
      type: isDone ? 'execution' : 'failure',
      confidence: isDone ? 0.72 : 0.35,
      evidenceLevel: 'runtime',
      supportingRefs: [traceRel],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'vision-sense-generic-execution', priority: 1 },
      { componentId: 'unknown-artifact-inspector', title: 'Vision trace', artifactRef: 'vision-sense-trace', priority: 2 },
    ],
    executionUnits: [{
      id: `EU-vision-sense-${params.runId}`,
      tool: VISION_TOOL_ID,
      status: params.status,
      params: JSON.stringify({ prompt: params.request.prompt, runId: params.runId, actionCount: params.actionCount }),
      hash: sha256(Buffer.from(`${params.runId}:${traceRel}:${params.status}`, 'utf8')).slice(0, 12),
      time: new Date().toISOString(),
      environment: params.dryRun ? 'SciForge dry-run generic GUI executor' : 'macOS screenshot + System Events generic GUI executor',
      inputData: [params.request.prompt],
      outputArtifacts: [traceRel],
      artifacts: [traceRel],
      codeRef: 'src/runtime/vision-sense-runtime.ts',
      outputRef: traceRel,
      screenshotRef: params.afterRefs[0]?.path,
      beforeScreenshotRef: params.beforeRefs[0]?.path,
      failureReason: params.failureReason || undefined,
      routeDecision: { selectedRuntime: 'vision-sense-generic-computer-use-loop', selectedToolId: VISION_TOOL_ID },
      requiredInputs: params.status === 'done' ? undefined : ['VisionPlanner', 'Grounder', 'GuiExecutor', 'Verifier'],
      recoverActions: params.status === 'done' ? undefined : [
        'Provide a generic VisionPlanner that emits the action schema recorded in the trace.',
        'Configure KV-Ground or another Grounder so target descriptions become screen coordinates.',
        'Keep app-specific APIs out of the primary path; only mouse/keyboard executor actions should be required.',
      ],
    }],
    artifacts: [{
      id: 'vision-sense-trace',
      type: 'vision-trace',
      path: traceRel,
      dataRef: traceRel,
      producerTool: VISION_TOOL_ID,
      schemaVersion: 'sciforge.vision-trace.v1',
      metadata: {
        runId: params.runId,
        imageMemoryPolicy: 'file-ref-only',
        screenshotRefs: allRefs.map(toTraceScreenshotRef),
        noInlineImages: true,
        appSpecificShortcuts: [],
      },
    }],
  };
}

function genericBridgeBlockedPayload(
  request: GatewayRequest,
  workspace: string,
  reason: string,
  routeDecision: Record<string, unknown>,
): ToolPayload {
  const runId = sanitizeId(`generic-cu-blocked-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`);
  const expectedTrace = workspaceRel(workspace, join(workspace, '.sciforge', 'vision-runs', runId, 'vision-trace.json'));
  return {
    message: `vision-sense generic Computer Use bridge is not ready: ${reason}`,
    confidence: 0.25,
    claimType: 'fact',
    evidenceLevel: 'runtime',
    reasoningTrace: [
      'local.vision-sense was selected for a Computer Use request.',
      reason,
      `Expected generic trace shape: ${expectedTrace} with screenshot refs, generic actions, executor result, and verifier result.`,
      'No app-specific shortcut or AgentServer fallback was used.',
    ].join('\n'),
    claims: [{
      text: reason,
      type: 'failure',
      confidence: 0.25,
      evidenceLevel: 'runtime',
      supportingRefs: [VISION_TOOL_ID],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'vision-sense-generic-execution', priority: 1 },
    ],
    executionUnits: [{
      id: `EU-${runId}`,
      tool: VISION_TOOL_ID,
      status: 'failed-with-reason',
      params: JSON.stringify({ prompt: request.prompt, selectedToolIds: request.selectedToolIds }),
      hash: sha256(Buffer.from(`${runId}:${reason}`, 'utf8')).slice(0, 12),
      time: new Date().toISOString(),
      environment: 'SciForge workspace runtime gateway',
      inputData: [request.prompt],
      outputArtifacts: [],
      artifacts: [],
      failureReason: reason,
      routeDecision,
      requiredInputs: ['ScreenCaptureProvider', 'VisionPlanner', 'Grounder', 'GuiExecutor', 'Verifier'],
      recoverActions: [
        'Enable the generic desktop bridge with SCIFORGE_VISION_DESKTOP_BRIDGE=1 or .sciforge/config.json visionSense.desktopBridgeEnabled=true.',
        'Configure capture displays with SCIFORGE_VISION_CAPTURE_DISPLAYS=1,2 or visionSense.captureDisplays.',
        'Provide a planner/grounder that emits app-agnostic mouse and keyboard actions.',
      ],
      nextStep: 'Configure the generic vision loop dependencies, then rerun the same request.',
    }],
    artifacts: [],
  };
}

async function executeGenericMacAction(action: GenericVisionAction) {
  const script = genericMacActionScript(action);
  return runCommand('osascript', ['-e', script], { timeoutMs: action.type === 'wait' ? Math.max(1000, (action.ms ?? 500) + 1000) : 30000 });
}

function genericMacActionScript(action: GenericVisionAction) {
  if (action.type === 'wait') return `delay ${Math.max(0, action.ms ?? 500) / 1000}`;
  const lines = [
    'tell application "System Events"',
  ];
  if (action.type === 'click') {
    lines.push(`  click at {${Math.round(action.x)}, ${Math.round(action.y)}}`);
  } else if (action.type === 'double_click') {
    lines.push(`  click at {${Math.round(action.x)}, ${Math.round(action.y)}}`);
    lines.push(`  click at {${Math.round(action.x)}, ${Math.round(action.y)}}`);
  } else if (action.type === 'drag') {
    lines.push(`  mouse down at {${Math.round(action.fromX)}, ${Math.round(action.fromY)}}`);
    lines.push('  delay 0.1');
    lines.push(`  mouse up at {${Math.round(action.toX)}, ${Math.round(action.toY)}}`);
  } else if (action.type === 'type_text') {
    lines.push(`  keystroke ${appleScriptString(action.text)}`);
  } else if (action.type === 'press_key') {
    lines.push(`  ${keyStrokeScript(action.key)}`);
  } else if (action.type === 'hotkey') {
    const key = action.keys[action.keys.length - 1] || '';
    const modifiers = action.keys.slice(0, -1).map(appleScriptModifier).filter(Boolean);
    lines.push(`  keystroke ${appleScriptString(key)}${modifiers.length ? ` using {${modifiers.join(', ')}}` : ''}`);
  } else if (action.type === 'scroll') {
    const amount = Math.max(1, Math.round(action.amount ?? 5));
    const signedAmount = action.direction === 'up' || action.direction === 'left' ? amount : -amount;
    lines.push(`  scroll wheel ${signedAmount}`);
  }
  lines.push('end tell');
  return lines.join('\n');
}

function keyStrokeScript(key: string) {
  const normalized = key.toLowerCase();
  const keyCodes: Record<string, number> = {
    return: 36,
    enter: 36,
    tab: 48,
    escape: 53,
    esc: 53,
    delete: 51,
    backspace: 51,
    space: 49,
    left: 123,
    right: 124,
    down: 125,
    up: 126,
  };
  const code = keyCodes[normalized];
  return code !== undefined ? `key code ${code}` : `keystroke ${appleScriptString(key)}`;
}

function appleScriptModifier(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') return 'command down';
  if (normalized === 'shift') return 'shift down';
  if (normalized === 'option' || normalized === 'alt') return 'option down';
  if (normalized === 'ctrl' || normalized === 'control') return 'control down';
  return '';
}

function parseGenericActions(value: unknown): GenericVisionAction[] {
  const parsed = typeof value === 'string'
    ? parseJson(value)
    : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeGenericAction).filter((action): action is GenericVisionAction => Boolean(action));
}

function normalizeGenericAction(value: unknown): GenericVisionAction | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;
  const type = value.type;
  if (type === 'click' || type === 'double_click') {
    const x = numberConfig(value.x);
    const y = numberConfig(value.y);
    return x === undefined || y === undefined ? undefined : { type, x, y };
  }
  if (type === 'drag') {
    const fromX = numberConfig(value.fromX);
    const fromY = numberConfig(value.fromY);
    const toX = numberConfig(value.toX);
    const toY = numberConfig(value.toY);
    return [fromX, fromY, toX, toY].some((item) => item === undefined)
      ? undefined
      : { type, fromX: fromX as number, fromY: fromY as number, toX: toX as number, toY: toY as number };
  }
  if (type === 'type_text') return typeof value.text === 'string' ? { type, text: value.text } : undefined;
  if (type === 'press_key') return typeof value.key === 'string' ? { type, key: value.key } : undefined;
  if (type === 'hotkey') {
    const keys = toStringList(value.keys);
    return keys.length ? { type, keys } : undefined;
  }
  if (type === 'scroll') {
    const direction = value.direction === 'up' || value.direction === 'down' || value.direction === 'left' || value.direction === 'right'
      ? value.direction
      : undefined;
    return direction ? { type, direction, amount: numberConfig(value.amount) } : undefined;
  }
  if (type === 'wait') return { type, ms: numberConfig(value.ms) };
  return undefined;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function toTraceScreenshotRef(ref: ScreenshotRef) {
  return {
    id: ref.id,
    type: 'screenshot',
    path: ref.path,
    displayId: ref.displayId,
    width: ref.width,
    height: ref.height,
    sha256: ref.sha256,
    bytes: ref.bytes,
  };
}

function pngDimensions(bytes: Buffer) {
  if (bytes.length < 24) return undefined;
  if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function envOrValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function stringConfig(...values: unknown[]) {
  const value = envOrValue(...values);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberConfig(...values: unknown[]) {
  const value = envOrValue(...values);
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function booleanConfig(env: unknown, requestValue: unknown, fileValue: unknown, fallback: boolean) {
  const value = envOrValue(env, requestValue, fileValue);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^(1|true|yes|on|enabled)$/i.test(value)) return true;
    if (/^(0|false|no|off|disabled)$/i.test(value)) return false;
  }
  return fallback;
}

function parseDisplayList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0);
}

async function runCommand(command: string, args: string[], options: { timeoutMs: number }) {
  return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode: 127, stdout, stderr: stderr || error.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode: code ?? (signal ? 143 : 1), stdout, stderr });
    });
  });
}

function workspaceRel(workspace: string, absPath: string) {
  const resolvedWorkspace = resolve(workspace);
  const resolvedPath = resolve(absPath);
  if (resolvedPath === resolvedWorkspace) return '.';
  if (resolvedPath.startsWith(`${resolvedWorkspace}/`)) return resolvedPath.slice(resolvedWorkspace.length + 1);
  return resolvedPath;
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'vision-run';
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function appleScriptString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}
