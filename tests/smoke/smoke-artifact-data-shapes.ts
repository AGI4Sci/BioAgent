import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-artifact-data-shapes-'));

const taskCode = String.raw`
import json
import sys

input_path = sys.argv[1]
output_path = sys.argv[2]

payload = {
  "message": "artifact data shape smoke completed",
  "confidence": 0.9,
  "claimType": "fact",
  "evidenceLevel": "runtime",
  "reasoningTrace": "The task emits array data and markdown string data.",
  "claims": [],
  "uiManifest": [
    {"componentId": "paper-card-list", "artifactRef": "paper-list"},
    {"componentId": "report-viewer", "artifactRef": "research-report"}
  ],
  "executionUnits": [{"id": "shape-task", "status": "done", "tool": "shape.generated"}],
  "artifacts": [
    {"id": "paper-list", "type": "paper-list", "data": [{"title": "Paper A"}, {"title": "Paper B"}]},
    {"id": "research-report", "type": "research-report", "encoding": "markdown", "data": "# Report\n\n## Paper A\n\nMethod and limitation."}
  ]
}
with open(output_path, "w", encoding="utf-8") as handle:
  json.dump(payload, handle, ensure_ascii=False, indent=2)
`;

const server = createServer(async (req, res) => {
  if (!['/api/agent-server/runs', '/api/agent-server/runs/stream'].includes(String(req.url)) || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-shape-generation',
        status: 'completed',
        output: {
          result: {
            taskFiles: [{
              path: '.sciforge/tasks/artifact_shape_task.py',
              language: 'python',
              content: taskCode,
            }],
            entrypoint: { language: 'python', path: '.sciforge/tasks/artifact_shape_task.py' },
            expectedArtifacts: ['paper-list', 'research-report'],
            patchSummary: 'Generated artifact shape smoke task.',
          },
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

try {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'emit paper list and markdown report',
    workspacePath: workspace,
    agentServerBaseUrl: `http://127.0.0.1:${address.port}`,
    expectedArtifactTypes: ['paper-list', 'research-report'],
    selectedComponentIds: ['paper-card-list', 'report-viewer'],
    artifacts: [],
  });
  const paperList = result.artifacts.find((artifact) => artifact.type === 'paper-list');
  const report = result.artifacts.find((artifact) => artifact.type === 'research-report');
  assert.ok(paperList);
  assert.ok(report);
  assert.ok(Array.isArray(paperList.data), 'paper-list data array should not be converted into numeric-key object');
  assert.equal((paperList.data as unknown[]).length, 2);
  assert.ok(isRecord(report.data));
  assert.match(String(report.data.markdown || ''), /^# Report/);
  console.log('[ok] artifact data shapes preserve arrays and normalize markdown strings');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
