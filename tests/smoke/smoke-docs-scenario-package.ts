import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requiredDocs = [
  'docs/BioAgent_Project_Document.md',
  'docs/ScenarioPackageAuthoring.md',
  'docs/DependencyRiskRegister.md',
  'README.md',
];

for (const path of requiredDocs) {
  const text = await readFile(path, 'utf8');
  assert.ok(text.length > 200, `${path} should not be empty`);
}

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-docs-scenario-'));
await cp('docs/examples/workspace-scenario', join(workspace, '.bioagent', 'scenarios', 'example-literature-service'), { recursive: true });

const port = 20080 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ['--import', 'tsx', 'src/runtime/workspace-server.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    BIOAGENT_WORKSPACE_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForHealth(port);
  const response = await fetch(`http://127.0.0.1:${port}/api/bioagent/scenarios/get?workspacePath=${encodeURIComponent(workspace)}&id=example-literature-service`);
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const json = JSON.parse(text) as { package: { id: string; qualityReport?: { ok: boolean } } };
  assert.equal(json.package.id, 'example-literature-service');
  assert.equal(json.package.qualityReport?.ok, true);
  console.log('[ok] docs and example scenario package are readable by workspace API');
} finally {
  child.kill('SIGTERM');
}

async function waitForHealth(portNumber: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`workspace server did not start on ${portNumber}`);
}
