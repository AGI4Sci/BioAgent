import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-agentserver-stage-taskfiles-'));
const taskCode = [
  'import json, sys',
  'with open(sys.argv[1], "r", encoding="utf-8") as handle:',
  '    request = json.load(handle)',
  'payload = {',
  '    "message": "stage taskFiles content executed",',
  '    "confidence": 0.84,',
  '    "claimType": "fact",',
  '    "evidenceLevel": "runtime",',
  '    "reasoningTrace": "AgentServer stage finalText taskFiles content was materialized and executed.",',
  '    "claims": [],',
  '    "uiManifest": [{"componentId": "report-viewer", "artifactRef": "stage-report"}],',
  '    "executionUnits": [{"id": "stage-task", "status": "done", "tool": "agentserver.stage-taskfiles"}],',
  '    "artifacts": [{"id": "stage-report", "type": "research-report", "data": {"markdown": "stage task ran"}}]',
  '}',
  'with open(sys.argv[2], "w", encoding="utf-8") as handle:',
  '    json.dump(payload, handle, indent=2)',
].join('\n');

const server = createServer(async (req, res) => {
  if (req.url !== '/api/agent-server/runs/stream' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const finalText = [
    '```json',
    JSON.stringify({
      taskFiles: [{
        path: '.bioagent/tasks/stage-generated/run.py',
        language: 'python',
        content: taskCode,
      }],
      entrypoint: { language: 'python', path: '.bioagent/tasks/stage-generated/run.py' },
      expectedArtifacts: ['research-report'],
      patchSummary: 'Generated task file content in stage finalText.',
    }, null, 2),
    '```',
  ].join('\n');
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-stage-taskfiles-run',
        status: 'completed',
        output: { text: 'Codex run completed' },
        stages: [{ result: { finalText } }],
      },
    },
  };
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  res.end(JSON.stringify({ result }) + '\n');
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'Generate task code in AgentServer stage finalText, then BioAgent must execute it.',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    expectedArtifactTypes: ['research-report'],
    uiState: { forceAgentServerGeneration: true },
    artifacts: [],
  });
  assert.equal(result.message, 'stage taskFiles content executed');
  assert.ok(result.executionUnits.some((unit) => isRecord(unit) && unit.tool === 'agentserver.stage-taskfiles'));
  const materialized = await readFile(join(workspace, '.bioagent', 'tasks', 'stage-generated', 'run.py'), 'utf8');
  assert.match(materialized, /stage taskFiles content executed/);
  console.log('[ok] AgentServer stage finalText taskFiles content is materialized and executed');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
