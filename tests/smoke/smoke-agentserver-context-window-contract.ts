import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const AGENT_BACKENDS = ['codex', 'openteam_agent', 'claude-code', 'hermes-agent', 'openclaw', 'gemini'] as const;
type AgentBackend = typeof AGENT_BACKENDS[number];

const stateReadsByBackend = new Map<AgentBackend, number>();
const compactionsByBackend = new Map<AgentBackend, number>();
const dispatchMetadataByBackend = new Map<AgentBackend, Record<string, unknown>>();
let activeBackend: AgentBackend = 'codex';

const server = createServer(async (req, res) => {
  const url = String(req.url || '');
  if (req.method === 'GET' && url.includes('/api/agent-server/agents/') && url.endsWith('/context')) {
    const backend = activeBackend;
    stateReadsByBackend.set(backend, (stateReadsByBackend.get(backend) ?? 0) + 1);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      data: {
        session: { id: `context-window-${backend}`, status: 'active' },
        contextWindow: {
          tokens: 91_000,
          limit: 100_000,
          ratio: 0.91,
          autoCompactThreshold: 0.82,
          status: 'near-limit',
        },
        workBudget: { status: 'near-limit', approxCurrentWorkTokens: 91_000 },
        recentTurns: [],
        currentWorkEntries: [],
      },
    }));
    return;
  }
  if (req.method === 'POST' && url.includes('/api/agent-server/agents/') && url.endsWith('/compact')) {
    const backend = activeBackend;
    compactionsByBackend.set(backend, (compactionsByBackend.get(backend) ?? 0) + 1);
    if (backend === 'openclaw') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'compact unavailable for compatibility backend' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      data: {
        message: `compacted ${backend}`,
        state: {
          contextWindow: {
            tokens: 24_000,
            limit: 100_000,
            ratio: 0.24,
            autoCompactThreshold: 0.82,
            status: 'healthy',
          },
        },
      },
    }));
    return;
  }
  if (req.method !== 'POST' || url !== '/api/agent-server/runs/stream') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }

  const body = await readJson(req);
  const agent = isRecord(body.agent) ? body.agent : {};
  const input = isRecord(body.input) ? body.input : {};
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const backend = String(agent.backend || '') as AgentBackend;
  assert.ok(AGENT_BACKENDS.includes(backend));
  dispatchMetadataByBackend.set(backend, metadata);

  const result = {
    ok: true,
    data: {
      run: {
        id: `context-window-contract-${backend}`,
        status: 'completed',
        output: { result: directPayload(backend) },
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
  for (const backend of AGENT_BACKENDS) {
    activeBackend = backend;
    const workspace = await mkdtemp(join(tmpdir(), `bioagent-context-window-${backend}-`));
    const payload = await runWorkspaceRuntimeGateway({
      skillDomain: 'literature',
      agentBackend: backend,
      workspacePath: workspace,
      agentServerBaseUrl: baseUrl,
      prompt: `T057 context window contract smoke for ${backend}`,
      expectedArtifactTypes: ['research-report'],
      artifacts: [{ id: 'prior-report', type: 'research-report', dataRef: '.bioagent/artifacts/prior-report.json' }],
      uiState: {
        sessionId: `context-window-${backend}`,
        currentPrompt: `T057 context window contract smoke for ${backend}`,
        recentConversation: ['user: previous turn', 'assistant: previous answer'],
        recentExecutionRefs: [{ id: 'prior-run', status: 'done', outputRef: '.bioagent/task-results/prior.json' }],
        forceAgentServerGeneration: true,
      },
    });
    assert.match(payload.message, new RegExp(backend.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const backend of AGENT_BACKENDS) {
    assert.ok((stateReadsByBackend.get(backend) ?? 0) >= 1, `${backend} should read context window state before dispatch`);
    assert.equal(compactionsByBackend.get(backend), 1, `${backend} should attempt preflight compaction near limit`);
    const metadata = dispatchMetadataByBackend.get(backend);
    assert.ok(metadata, `${backend} should dispatch after preflight`);
    const capabilities = isRecord(metadata.backendCapabilities) ? metadata.backendCapabilities : {};
    assert.equal(typeof capabilities.contextWindowTelemetry, 'boolean');
    assert.equal(typeof capabilities.nativeCompaction, 'boolean');
    assert.equal(typeof capabilities.compactionDuringTurn, 'boolean');
    assert.equal(typeof capabilities.rateLimitTelemetry, 'boolean');
    assert.equal(typeof capabilities.sessionRotationSafe, 'boolean');
    const contextWindow = isRecord(metadata.contextWindow) ? metadata.contextWindow : {};
    assert.equal(contextWindow.status, backend === 'openclaw' ? 'watch' : 'healthy');
    const contextCompaction = isRecord(metadata.contextCompaction) ? metadata.contextCompaction : {};
    assert.equal(contextCompaction.ok, true);
    assert.equal(contextCompaction.strategy, backend === 'openclaw' ? 'handoff-slimming' : capabilities.nativeCompaction ? 'native' : 'agentserver');
  }

  console.log('[ok] AgentServer context window contract normalizes backend telemetry, preflight compaction, and handoff fallback');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function directPayload(backend: AgentBackend) {
  return {
    message: `${backend} completed context window contract smoke.`,
    confidence: 0.82,
    claimType: 'contract-smoke',
    evidenceLevel: 'mock-agentserver',
    reasoningTrace: `${backend} received a normalized AgentServer context preflight.`,
    claims: [],
    uiManifest: [{ componentId: 'report-viewer', artifactRef: 'research-report', priority: 1 }],
    executionUnits: [{ id: `${backend}-context-window`, status: 'record-only', tool: `agentserver.${backend}.context-window` }],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      schemaVersion: '1',
      data: { markdown: `${backend} context window contract smoke passed.` },
    }],
  };
}

async function readJson(req: AsyncIterable<Buffer | string>): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
