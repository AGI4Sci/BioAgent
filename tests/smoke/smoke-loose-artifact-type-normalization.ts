import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-loose-artifact-type-'));

const taskCode = String.raw`
import json
import sys

payload = {
  "message": "loose artifact shape completed",
  "confidence": 0.9,
  "claimType": "analysis-result",
  "evidenceLevel": "computed",
  "reasoningTrace": "The task emits artifactType plus top-level artifact fields.",
  "claims": [],
  "uiManifest": [
    {"componentId": "paper-card-list", "artifactRef": "paper-list"},
    {"componentId": "report-viewer", "artifactRef": "research-report"}
  ],
  "executionUnits": [{"id": "loose-shape", "status": "completed", "tool": "shape.generated"}],
  "artifacts": [
    {"artifactType": "paper-list", "papers": [{"title": "GeneAgent", "relevance_score": 84.5}]},
    {"artifactType": "research-report", "summary": "GeneAgent ranks first.", "ranking": "GeneAgent > BioDiscoveryAgent"}
  ]
}
with open(sys.argv[2], "w", encoding="utf-8") as handle:
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
        id: 'mock-loose-artifact-type',
        status: 'completed',
        output: {
          result: {
            taskFiles: [{ path: '.bioagent/tasks/loose_artifact_type.py', language: 'python', content: taskCode }],
            entrypoint: { language: 'python', path: '.bioagent/tasks/loose_artifact_type.py' },
            expectedArtifacts: ['paper-list', 'research-report'],
            patchSummary: 'Generated loose artifactType normalization smoke task.',
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
    prompt: 'emit loose artifactType payload',
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
  assert.ok(isRecord(paperList.data));
  assert.ok(Array.isArray(paperList.data.papers));
  assert.ok(isRecord(report.data));
  assert.match(String(report.data.summary || ''), /GeneAgent/);
  assert.equal(result.executionUnits[0]?.status, 'done');
  console.log('[ok] loose artifactType payloads normalize to stable artifact data');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
