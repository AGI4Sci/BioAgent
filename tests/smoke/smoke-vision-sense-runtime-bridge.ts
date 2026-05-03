import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const previousBridge = process.env.SCIFORGE_VISION_DESKTOP_BRIDGE;
const previousDryRun = process.env.SCIFORGE_VISION_DESKTOP_BRIDGE_DRY_RUN;
const previousRunId = process.env.SCIFORGE_VISION_RUN_ID;
const previousDisplays = process.env.SCIFORGE_VISION_CAPTURE_DISPLAYS;
const previousActions = process.env.SCIFORGE_VISION_ACTIONS_JSON;

try {
  const blockedWorkspace = await mkdtemp(join(tmpdir(), 'sciforge-vision-bridge-blocked-'));
  process.env.SCIFORGE_VISION_DESKTOP_BRIDGE = '0';
  process.env.SCIFORGE_VISION_DESKTOP_BRIDGE_DRY_RUN = '0';
  const blocked = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'Open the desktop presentation app and create a GUI Agent slide through computer use.',
    workspacePath: blockedWorkspace,
    selectedToolIds: ['local.vision-sense'],
    uiState: { selectedToolIds: ['local.vision-sense'] },
  });

  assert.equal(blocked.executionUnits.length, 1);
  assert.equal(blocked.executionUnits[0].tool, 'local.vision-sense');
  assert.equal(blocked.executionUnits[0].status, 'failed-with-reason');
  assert.match(String(blocked.executionUnits[0].failureReason || blocked.message), /desktop bridge is disabled/i);
  assert.doesNotMatch(blocked.message, /AgentServer task generation/i);

  const missingPlannerWorkspace = await mkdtemp(join(tmpdir(), 'sciforge-vision-missing-planner-'));
  process.env.SCIFORGE_VISION_DESKTOP_BRIDGE = '1';
  process.env.SCIFORGE_VISION_DESKTOP_BRIDGE_DRY_RUN = '1';
  process.env.SCIFORGE_VISION_RUN_ID = 'generic-cu-missing-planner-smoke';
  process.env.SCIFORGE_VISION_CAPTURE_DISPLAYS = '1,2';
  delete process.env.SCIFORGE_VISION_ACTIONS_JSON;
  const missingPlanner = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'Open any desktop app and complete a GUI Agent task using computer use.',
    workspacePath: missingPlannerWorkspace,
    selectedToolIds: ['local.vision-sense'],
    uiState: { selectedToolIds: ['local.vision-sense'] },
  });

  assert.equal(missingPlanner.executionUnits.length, 1);
  assert.equal(missingPlanner.executionUnits[0].tool, 'local.vision-sense');
  assert.equal(missingPlanner.executionUnits[0].status, 'failed-with-reason');
  assert.match(String(missingPlanner.executionUnits[0].failureReason || missingPlanner.message), /no planner\/grounder actions/i);
  assert.doesNotMatch(missingPlanner.message, /Word|PowerPoint|adapter/i);
  const missingTraceArtifact = missingPlanner.artifacts.find((artifact) => artifact.id === 'vision-sense-trace');
  assert.ok(missingTraceArtifact);
  assert.equal(missingTraceArtifact.path, '.sciforge/vision-runs/generic-cu-missing-planner-smoke/vision-trace.json');
  await stat(join(missingPlannerWorkspace, '.sciforge/vision-runs/generic-cu-missing-planner-smoke/step-000-before-display-1.png'));
  await stat(join(missingPlannerWorkspace, '.sciforge/vision-runs/generic-cu-missing-planner-smoke/step-999-after-display-2.png'));

  const dryRunWorkspace = await mkdtemp(join(tmpdir(), 'sciforge-vision-generic-dryrun-'));
  process.env.SCIFORGE_VISION_RUN_ID = 'generic-cu-actions-smoke';
  process.env.SCIFORGE_VISION_ACTIONS_JSON = JSON.stringify([
    { type: 'wait', ms: 1 },
    { type: 'hotkey', keys: ['command', 'n'] },
    { type: 'type_text', text: 'GUI Agent generic action smoke' },
  ]);
  const completed = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'Use generic computer use actions in whichever app is active; do not use app-specific shortcuts.',
    workspacePath: dryRunWorkspace,
    selectedToolIds: ['local.vision-sense'],
    uiState: { selectedToolIds: ['local.vision-sense'] },
  });

  assert.equal(completed.executionUnits.length, 1);
  assert.equal(completed.executionUnits[0].tool, 'local.vision-sense');
  assert.equal(completed.executionUnits[0].status, 'done');
  const traceArtifact = completed.artifacts.find((artifact) => artifact.id === 'vision-sense-trace');
  assert.ok(traceArtifact);
  assert.equal(traceArtifact.path, '.sciforge/vision-runs/generic-cu-actions-smoke/vision-trace.json');
  assert.equal(completed.artifacts.length, 1);

  const tracePath = join(dryRunWorkspace, String(traceArtifact.path));
  const traceText = await readFile(tracePath, 'utf8');
  assert.doesNotMatch(traceText, /base64|data:image/i);
  const trace = JSON.parse(traceText) as Record<string, unknown>;
  assert.equal((trace.imageMemory as Record<string, unknown>).policy, 'file-ref-only');
  assert.deepEqual((trace.genericComputerUse as Record<string, unknown>).appSpecificShortcuts, []);
  const refs = (trace.imageMemory as Record<string, unknown>).refs as Array<Record<string, unknown>>;
  assert.equal(refs.length, 4);
  assert.deepEqual(refs.map((ref) => ref.displayId), [1, 2, 1, 2]);
  assert.ok((trace.steps as Array<Record<string, unknown>>).some((step) => step.id === 'step-001-execute-wait'));
  assert.ok((trace.steps as Array<Record<string, unknown>>).some((step) => step.id === 'step-002-execute-hotkey'));
  assert.ok((trace.steps as Array<Record<string, unknown>>).some((step) => step.id === 'step-003-execute-type_text'));
  await stat(join(dryRunWorkspace, '.sciforge/vision-runs/generic-cu-actions-smoke/step-000-before-display-1.png'));
  await stat(join(dryRunWorkspace, '.sciforge/vision-runs/generic-cu-actions-smoke/step-999-after-display-2.png'));

  console.log('[ok] vision-sense runtime uses the generic Computer Use loop without app-specific shortcuts');
} finally {
  restoreEnv('SCIFORGE_VISION_DESKTOP_BRIDGE', previousBridge);
  restoreEnv('SCIFORGE_VISION_DESKTOP_BRIDGE_DRY_RUN', previousDryRun);
  restoreEnv('SCIFORGE_VISION_RUN_ID', previousRunId);
  restoreEnv('SCIFORGE_VISION_CAPTURE_DISPLAYS', previousDisplays);
  restoreEnv('SCIFORGE_VISION_ACTIONS_JSON', previousActions);
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
