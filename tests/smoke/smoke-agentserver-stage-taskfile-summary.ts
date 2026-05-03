import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-agentserver-stage-summary-'));
const taskRel = '.sciforge/tasks/stage-summary/run.py';
const taskCode = [
  'import argparse, json, os',
  'parser = argparse.ArgumentParser()',
  'parser.add_argument("--inputPath", required=False)',
  'parser.add_argument("--outputPath", required=True)',
  'args = parser.parse_args()',
  'payload = {',
  '    "message": "stage summary task path executed",',
  '    "confidence": 0.86,',
  '    "claimType": "fact",',
  '    "evidenceLevel": "runtime",',
  '    "reasoningTrace": "Recovered from stage finalText summary path and executed workspace file.",',
  '    "claims": [],',
  '    "uiManifest": [{"componentId": "report-viewer", "artifactRef": "stage-summary-report"}],',
  '    "executionUnits": [{"id": "stage-summary-task", "status": "done", "tool": "agentserver.stage-summary"}],',
  '    "artifacts": [{"id": "stage-summary-report", "type": "research-report", "data": {"markdown": "stage summary task ran"}}]',
  '}',
  'os.makedirs(os.path.dirname(args.outputPath), exist_ok=True)',
  'with open(args.outputPath, "w", encoding="utf-8") as handle:',
  '    json.dump(payload, handle, indent=2)',
].join('\n');

const server = createServer(async (req, res) => {
  if (req.url !== '/api/agent-server/runs/stream' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  const workspacePath = isRecord(body.agent) && typeof body.agent.workspace === 'string' ? body.agent.workspace : workspace;
  const taskPath = join(workspacePath, taskRel);
  await mkdir(dirname(taskPath), { recursive: true });
  await writeFile(taskPath, taskCode, 'utf8');
  const finalText = [
    'Generated the requested task and wrote it to disk.',
    `**Task File**: \`${taskRel}\``,
    `**Entrypoint**: \`python3 ${taskRel} --inputPath {inputPath} --outputPath {outputPath}\``,
    'This is a natural-language summary, not a taskFiles JSON block.',
  ].join('\n');
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-stage-summary-run',
        status: 'completed',
        output: { success: true, result: { finalText: '', outputSummary: '' }, text: '' },
        stages: [{ result: { status: 'completed', finalText } }],
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
    prompt: 'Generate task code and return only a prose summary with the workspace task path.',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    expectedArtifactTypes: ['research-report'],
    uiState: { forceAgentServerGeneration: true },
    artifacts: [],
  });
  assert.match(result.message, /Generated the requested task/);
  assert.ok(result.executionUnits.some((unit) => isRecord(unit) && unit.tool === 'agentserver.direct-text'));
  const materialized = await readFile(join(workspace, taskRel), 'utf8');
  assert.match(materialized, /stage summary task path executed/);
  console.log('[ok] AgentServer stage finalText prose task path is preserved as a direct answer instead of keyword-routed execution');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
