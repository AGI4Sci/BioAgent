import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-agentserver-path-only-retry-'));
let requestCount = 0;
const bodies: Array<Record<string, unknown>> = [];

const taskCode = [
  'import json, sys',
  'with open(sys.argv[1], "r", encoding="utf-8") as handle:',
  '    request = json.load(handle)',
  'payload = {',
  '    "message": "retried inline task ran",',
  '    "confidence": 0.86,',
  '    "claimType": "evidence-summary",',
  '    "evidenceLevel": "mock-agentserver",',
  '    "reasoningTrace": "strict retry supplied inline content for " + request.get("prompt", ""),',
  '    "claims": [],',
  '    "uiManifest": [{"componentId": "report-viewer", "artifactRef": "retry-report"}],',
  '    "executionUnits": [{"id": "retry-eu", "status": "done", "tool": "agentserver.path-only-retry"}],',
  '    "artifacts": [{"id": "retry-report", "type": "research-report", "data": {"markdown": "strict retry recovered missing task content"}}]',
  '}',
  'with open(sys.argv[2], "w", encoding="utf-8") as handle:',
  '    json.dump(payload, handle)',
].join('\n');

const server = createServer(async (req, res) => {
  if (!['/api/agent-server/runs', '/api/agent-server/runs/stream'].includes(String(req.url)) || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  requestCount += 1;
  bodies.push(JSON.parse(await readBody(req)) as Record<string, unknown>);
  const includeContent = requestCount > 1;
  const result = {
    ok: true,
    data: {
      run: {
        id: `mock-agentserver-path-only-retry-${requestCount}`,
        status: 'completed',
        output: {
          taskFiles: [{
            path: '.bioagent/tasks/missing_path_only_retry.py',
            language: 'python',
            ...(includeContent ? { content: taskCode } : {}),
          }],
          entrypoint: { language: 'python', path: '.bioagent/tasks/missing_path_only_retry.py' },
          expectedArtifacts: ['research-report'],
          patchSummary: includeContent
            ? 'Strict retry returned inline task content.'
            : 'First response returned a path-only reference without writing the file.',
        },
      },
    },
  };
  if (req.url === '/api/agent-server/runs/stream') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(JSON.stringify({ result }) + '\n');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const events: Array<Record<string, unknown>> = [];
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'path-only missing AgentServer taskFiles must be retried with inline content',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    modelProvider: 'openai-compatible',
    modelName: 'mock-model',
    llmEndpoint: {
      provider: 'openai-compatible',
      baseUrl: 'http://llm.example.test/v1',
      apiKey: 'path-only-retry-secret',
      modelName: 'mock-model',
    },
    expectedArtifactTypes: ['research-report'],
    selectedComponentIds: ['report-viewer', 'execution-unit-table'],
    artifacts: [],
  }, {
    onEvent(event) {
      events.push(event as unknown as Record<string, unknown>);
    },
  });

  assert.equal(result.message, 'retried inline task ran');
  assert.equal(requestCount, 2);
  assert.ok(events.some((event) => event.type === 'agentserver-generation-retry'));
  assert.ok(result.executionUnits.some((unit) => isRecord(unit) && unit.tool === 'agentserver.path-only-retry'));
  const secondInput = isRecord(bodies[1]?.input) ? bodies[1].input : {};
  assert.match(String(secondInput.text || ''), /path-only taskFiles/);
  assert.match(String(secondInput.text || ''), /inline content/);
  console.log('[ok] missing path-only AgentServer taskFiles trigger strict inline-content retry');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function readBody(req: AsyncIterable<Buffer | string>) {
  return new Promise<string>(async (resolve) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    resolve(Buffer.concat(chunks).toString('utf8'));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
