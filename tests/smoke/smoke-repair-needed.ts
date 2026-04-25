import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-repair-needed-'));
const result = await runWorkspaceRuntimeGateway({
  skillDomain: 'omics',
  prompt: 'Run omics differential expression without matrixRef or metadataRef',
  workspacePath: workspace,
});

assert.equal(result.artifacts.length, 0);
assert.equal(result.executionUnits.length, 1);
assert.equal(result.executionUnits[0].status, 'repair-needed');
assert.match(String(result.executionUnits[0].failureReason || result.message), /matrixRef|metadataRef|Task exited/);
assert.ok(String(result.executionUnits[0].codeRef || '').startsWith('.bioagent/tasks/omics-'));
assert.ok(String(result.executionUnits[0].stderrRef || '').startsWith('.bioagent/logs/omics-'));

const attemptsDir = join(workspace, '.bioagent', 'task-attempts');
const attemptFiles = await readdir(attemptsDir);
assert.equal(attemptFiles.length, 1);
const attemptHistory = JSON.parse(await readFile(join(attemptsDir, attemptFiles[0]), 'utf8'));
assert.equal(attemptHistory.attempts.length, 1);
assert.equal(attemptHistory.attempts[0].status, 'repair-needed');
assert.equal(attemptHistory.attempts[0].attempt, 1);
assert.ok(attemptHistory.attempts[0].codeRef);
assert.ok(attemptHistory.attempts[0].stderrRef);

console.log('[ok] repair-needed smoke writes failed payload and attempt history');
