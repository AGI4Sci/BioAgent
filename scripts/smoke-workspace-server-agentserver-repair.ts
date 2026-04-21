import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const workspace = await createRepairWorkspace('bioagent-workspace-http-repair-');

const agentServer = createServer(async (req, res) => {
  if (req.url !== '/api/agent-server/runs' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const body = await readJson(req);
  const agent = isRecord(body.agent) ? body.agent : {};
  const repairWorkspace = typeof agent.workingDirectory === 'string' ? agent.workingDirectory : workspace;
  const metadata = isRecord(body.input) && isRecord(body.input.metadata) ? body.input.metadata : {};
  const codeRef = typeof metadata.codeRef === 'string' ? metadata.codeRef : '';
  assert.ok(codeRef.startsWith('.bioagent/tasks/omics-'));
  const taskPath = join(repairWorkspace, codeRef);
  const source = await readFile(taskPath, 'utf8');
  await writeFile(taskPath, source.replace(
    '    params = omics_params(prompt)\n',
    [
      '    params = omics_params(prompt)\n',
      '    if not params["matrixRef"]:\n',
      '        params["matrixRef"] = "matrix.csv"\n',
      '    if not params["metadataRef"]:\n',
      '        params["metadataRef"] = "metadata.csv"\n',
    ].join(''),
  ));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    data: {
      run: {
        id: 'mock-agentserver-http-repair-run',
        status: 'completed',
        output: {
          result: 'Patched task code to use workspace fixture matrix.csv and metadata.csv.',
        },
      },
    },
  }));
});

await listen(agentServer);
const agentAddress = agentServer.address();
assert.ok(agentAddress && typeof agentAddress === 'object');
const agentServerBaseUrl = `http://127.0.0.1:${agentAddress.port}`;

const workspacePort = await freePort();
const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/workspace-server.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, BIOAGENT_WORKSPACE_PORT: String(workspacePort) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForHealth(`http://127.0.0.1:${workspacePort}/health`);
  const response = await fetch(`http://127.0.0.1:${workspacePort}/api/bioagent/tools/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillDomain: 'omics',
      prompt: 'Run omics differential expression; repair smoke intentionally omits refs',
      workspacePath: workspace,
      agentServerBaseUrl,
    }),
  });
  assert.equal(response.status, 200);
  const json = await response.json() as unknown;
  assert.ok(isRecord(json));
  assert.equal(json.ok, true);
  const result = isRecord(json.result) ? json.result : {};
  const units = Array.isArray(result.executionUnits) ? result.executionUnits : [];
  assert.equal(units.length, 1);
  assert.equal(isRecord(units[0]) ? units[0].status : undefined, 'self-healed');
  assert.equal(isRecord(units[0]) ? units[0].attempt : undefined, 2);
  assert.equal(Array.isArray(result.artifacts) ? result.artifacts.length : 0, 1);

  await assertSelfHealedAttemptHistory(workspace);

  const configuredWorkspace = await createRepairWorkspace('bioagent-workspace-http-repair-config-');
  await mkdir(join(configuredWorkspace, '.bioagent'), { recursive: true });
  await writeFile(join(configuredWorkspace, '.bioagent', 'config.json'), JSON.stringify({ agentServerBaseUrl }, null, 2));
  const configuredResponse = await fetch(`http://127.0.0.1:${workspacePort}/api/bioagent/tools/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillDomain: 'omics',
      prompt: 'Run omics differential expression; repair smoke reads AgentServer URL from workspace config',
      workspacePath: configuredWorkspace,
    }),
  });
  assert.equal(configuredResponse.status, 200);
  const configuredJson = await configuredResponse.json() as unknown;
  assert.ok(isRecord(configuredJson));
  assert.equal(configuredJson.ok, true);
  const configuredResult = isRecord(configuredJson.result) ? configuredJson.result : {};
  const configuredUnits = Array.isArray(configuredResult.executionUnits) ? configuredResult.executionUnits : [];
  assert.equal(configuredUnits.length, 1);
  assert.equal(isRecord(configuredUnits[0]) ? configuredUnits[0].status : undefined, 'self-healed');
  assert.equal(isRecord(configuredUnits[0]) ? configuredUnits[0].attempt : undefined, 2);
  assert.equal(Array.isArray(configuredResult.artifacts) ? configuredResult.artifacts.length : 0, 1);
  await assertSelfHealedAttemptHistory(configuredWorkspace);

  console.log('[ok] workspace server HTTP repair smoke patches task code via request body URL and workspace config fallback');
} finally {
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => agentServer.close(() => resolve()));
}

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

async function freePort() {
  const server = createServer();
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForHealth(url: string) {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Wait below.
    }
    if (Date.now() - started > 10000) {
      const stderr = await readPipe(child.stderr);
      throw new Error(`workspace server did not become healthy. stderr=${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  return isRecord(parsed) ? parsed : {};
}

async function readPipe(pipe: NodeJS.ReadableStream | null) {
  if (!pipe) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of pipe) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function createRepairWorkspace(prefix: string) {
  const repairWorkspace = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(join(repairWorkspace, 'matrix.csv'), [
    'gene,c1,c2,t1,t2',
    'IL6,8,9,42,46',
    'TNF,7,6,25,27',
    'ACTB,12,13,12,13',
  ].join('\n'));
  await writeFile(join(repairWorkspace, 'metadata.csv'), [
    'sample,condition',
    'c1,control',
    'c2,control',
    't1,treated',
    't2,treated',
  ].join('\n'));
  return repairWorkspace;
}

async function assertSelfHealedAttemptHistory(repairWorkspace: string) {
  const attemptFiles = await readdir(join(repairWorkspace, '.bioagent', 'task-attempts'));
  assert.equal(attemptFiles.length, 1);
  const attemptHistory = JSON.parse(await readFile(join(repairWorkspace, '.bioagent', 'task-attempts', attemptFiles[0]), 'utf8'));
  assert.equal(attemptHistory.attempts.length, 2);
  assert.equal(attemptHistory.attempts[0].status, 'repair-needed');
  assert.equal(attemptHistory.attempts[1].status, 'done');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
