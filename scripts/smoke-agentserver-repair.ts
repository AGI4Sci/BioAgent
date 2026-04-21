import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from './workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-agentserver-repair-'));
await writeFile(join(workspace, 'matrix.csv'), [
  'gene,c1,c2,t1,t2',
  'IL6,8,9,42,46',
  'TNF,7,6,25,27',
  'ACTB,12,13,12,13',
].join('\n'));
await writeFile(join(workspace, 'metadata.csv'), [
  'sample,condition',
  'c1,control',
  'c2,control',
  't1,treated',
  't2,treated',
].join('\n'));

const server = createServer(async (req, res) => {
  if (req.url !== '/api/agent-server/runs' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const body = await readJson(req);
  const metadata = isRecord(body.input) && isRecord(body.input.metadata) ? body.input.metadata : {};
  const codeRef = typeof metadata.codeRef === 'string' ? metadata.codeRef : '';
  assert.ok(codeRef.startsWith('.bioagent/tasks/omics-'));
  const taskPath = join(workspace, codeRef);
  const source = await readFile(taskPath, 'utf8');
  const patched = source.replace(
    '    params = omics_params(prompt)\n',
    [
      '    params = omics_params(prompt)\n',
      '    if not params["matrixRef"]:\n',
      '        params["matrixRef"] = "matrix.csv"\n',
      '    if not params["metadataRef"]:\n',
      '        params["metadataRef"] = "metadata.csv"\n',
    ].join(''),
  );
  await writeFile(taskPath, patched);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    data: {
      run: {
        id: 'mock-agentserver-repair-run',
        status: 'completed',
        output: {
          result: 'Patched omics task to use workspace matrix.csv and metadata.csv when refs were omitted in this smoke.',
        },
      },
    },
  }));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const result = await runWorkspaceRuntimeGateway({
    profile: 'omics',
    prompt: 'Run omics differential expression; repair smoke intentionally omits refs',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
  });

  assert.equal(result.artifacts.length, 1);
  assert.equal(result.executionUnits.length, 1);
  assert.equal(result.executionUnits[0].status, 'self-healed');
  assert.equal(result.executionUnits[0].attempt, 2);
  assert.equal(result.executionUnits[0].parentAttempt, 1);
  assert.match(String(result.executionUnits[0].diffRef || ''), /^\.bioagent\/task-diffs\/omics-/);
  assert.match(String(result.reasoningTrace), /AgentServer repair run/);

  const attemptFiles = await readdir(join(workspace, '.bioagent', 'task-attempts'));
  assert.equal(attemptFiles.length, 1);
  const attemptHistory = JSON.parse(await readFile(join(workspace, '.bioagent', 'task-attempts', attemptFiles[0]), 'utf8'));
  assert.equal(attemptHistory.attempts.length, 2);
  assert.equal(attemptHistory.attempts[0].status, 'repair-needed');
  assert.equal(attemptHistory.attempts[1].status, 'done');
  assert.equal(attemptHistory.attempts[1].parentAttempt, 1);
  assert.ok(attemptHistory.attempts[1].diffRef);

  console.log('[ok] agentserver repair smoke patches task code and reruns self-healed attempt');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function readJson(req: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
