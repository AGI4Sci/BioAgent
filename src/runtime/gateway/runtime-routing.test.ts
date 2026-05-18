import assert from 'node:assert/strict';
import test from 'node:test';

import type { ToolPayload, WorkspaceTaskRunResult } from '../runtime-types.js';
import { firstPayloadFailureReason, payloadHasFailureStatus } from './runtime-routing.js';

test('runtime routing treats runtime error payload text as failure status', () => {
  const payload = {
    message: 'Runtime error: invoke_capability not available.',
    claims: [],
    uiManifest: [],
    executionUnits: [],
    artifacts: [],
  } as unknown as ToolPayload;

  assert.equal(payloadHasFailureStatus(payload), true);
  assert.equal(firstPayloadFailureReason(payload), 'Runtime error: invoke_capability not available.');
});

test('runtime routing prefers payload failure text before nonzero run stderr', () => {
  const payload = {
    message: 'The task could not complete.',
    reasoningTrace: 'NameError: invoke_capability is not defined',
    claims: [],
    uiManifest: [],
    executionUnits: [],
    artifacts: [],
  } as unknown as ToolPayload;
  const run = {
    exitCode: 1,
    stderr: 'secondary stderr',
  } as unknown as WorkspaceTaskRunResult;

  assert.equal(firstPayloadFailureReason(payload, run), 'NameError: invoke_capability is not defined');
});

test('runtime routing keeps normal answer payloads out of failure status', () => {
  const payload = {
    message: 'Completed literature report with cited PDF evidence.',
    claims: [],
    uiManifest: [],
    executionUnits: [{ id: 'report', status: 'completed' }],
    artifacts: [{ id: 'report', type: 'research-report', path: 'report.md' }],
  } as unknown as ToolPayload;

  assert.equal(payloadHasFailureStatus(payload), false);
  assert.equal(firstPayloadFailureReason(payload), undefined);
});

test('runtime routing ignores historical failure text in satisfied payloads', () => {
  const payload = {
    message: 'Previous attempt showed Runtime error: invoke_capability not available; the issue is now fixed and the report was generated.',
    claims: [],
    uiManifest: [],
    executionUnits: [{ id: 'report', status: 'done' }],
    artifacts: [{ id: 'report', type: 'research-report', path: 'report.md' }],
    displayIntent: {
      taskOutcome: 'satisfied',
      status: 'completed',
      resultPresentation: { status: 'complete' },
    },
  } as unknown as ToolPayload;

  assert.equal(payloadHasFailureStatus(payload), false);
  assert.equal(firstPayloadFailureReason(payload), undefined);
});
