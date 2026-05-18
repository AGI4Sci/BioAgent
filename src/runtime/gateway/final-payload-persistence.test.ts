import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import type { GatewayRequest, ToolPayload } from '../runtime-types.js';
import { persistFinalGatewayPayloadIfManagedOutputRef } from './final-payload-persistence.js';

function request(workspacePath: string): GatewayRequest {
  return {
    skillDomain: 'literature',
    prompt: 'Create a verified research report artifact.',
    workspacePath,
    artifacts: [],
  };
}

function payload(outputRef: string, artifacts: ToolPayload['artifacts'] = []): ToolPayload {
  return {
    message: 'Final answer with verified artifacts.',
    confidence: 0.9,
    claimType: 'literature-survey',
    evidenceLevel: 'provider-grounded',
    reasoningTrace: 'trace',
    claims: [],
    uiManifest: [],
    artifacts,
    executionUnits: [{ id: 'generated-task', status: 'done', tool: 'workspace-task', outputRef }],
    verificationResults: [{
      id: 'verification-1',
      verdict: 'unverified',
      confidence: 0,
      evidenceRefs: ['execution-unit:generated-task'],
      repairHints: [],
      diagnostics: { required: false, nonBlocking: true },
    }],
    displayIntent: {
      resultPresentation: { status: 'complete' },
    },
  };
}

test('persistFinalGatewayPayloadIfManagedOutputRef writes final projection back to managed task-results JSON', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-final-payload-'));
  try {
    const outputRef = '.sciforge/sessions/session-1/task-results/generated-task.json';
    const result = payload(outputRef);

    const wrote = await persistFinalGatewayPayloadIfManagedOutputRef(result, request(workspace));
    const persisted = JSON.parse(await readFile(join(workspace, outputRef), 'utf8')) as ToolPayload;

    assert.equal(wrote, true);
    assert.equal(persisted.message, result.message);
    assert.equal(persisted.verificationResults?.[0]?.diagnostics?.nonBlocking, true);
    assert.deepEqual(persisted.displayIntent, result.displayIntent);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('persistFinalGatewayPayloadIfManagedOutputRef writes session output even when derived artifacts reference the payload JSON', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-final-payload-'));
  try {
    const outputRef = '.sciforge/sessions/session-1/task-results/generated-task.json';
    const result = payload(outputRef, [{ id: 'paper-list', type: 'paper-list', path: outputRef }]);

    const wrote = await persistFinalGatewayPayloadIfManagedOutputRef(result, request(workspace));
    const persisted = JSON.parse(await readFile(join(workspace, outputRef), 'utf8')) as ToolPayload;

    assert.equal(wrote, true);
    assert.equal(persisted.artifacts[0]?.id, 'paper-list');
    assert.deepEqual(persisted.displayIntent, result.displayIntent);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('persistFinalGatewayPayloadIfManagedOutputRef does not overwrite user-facing artifact output refs', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-final-payload-'));
  try {
    const outputRef = 'task-results/report.json';
    await mkdir(join(workspace, 'task-results'), { recursive: true });
    await writeFile(join(workspace, outputRef), '{"artifact":true}', 'utf8');
    const result = payload(outputRef, [{ id: 'report', type: 'research-report', dataRef: outputRef }]);

    const wrote = await persistFinalGatewayPayloadIfManagedOutputRef(result, request(workspace));
    const persisted = await readFile(join(workspace, outputRef), 'utf8');

    assert.equal(wrote, false);
    assert.equal(persisted, '{"artifact":true}');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
