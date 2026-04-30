import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-agentserver-direct-text-'));

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && String(req.url).includes('/api/agent-server/agents/') && String(req.url).endsWith('/context')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      data: {
        session: { id: 'mock-direct-text-context', status: 'active' },
        operationalGuidance: { summary: ['context healthy'], items: [] },
        workLayout: { strategy: 'live_only', safetyPointReached: true, segments: [] },
        workBudget: { status: 'healthy', approxCurrentWorkTokens: 80 },
        recentTurns: [],
        currentWorkEntries: [],
      },
    }));
    return;
  }
  if (!['/api/agent-server/runs', '/api/agent-server/runs/stream'].includes(String(req.url)) || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-agentserver-direct-text-run',
        status: 'completed',
        output: {
          success: true,
          result: [
            '# Agent paper report',
            '',
            'AgentServer completed the reading task but returned plain text instead of taskFiles.',
            'BioAgent should preserve this as a research-report artifact for the user.',
          ].join('\n'),
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
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: '帮我搜索arxiv上最新的agent论文，阅读并总结成报告',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    expectedArtifactTypes: ['paper-list', 'research-report'],
    selectedComponentIds: ['paper-card-list', 'report-viewer', 'execution-unit-table'],
    uiState: {
      freshTaskGeneration: true,
      forceAgentServerGeneration: true,
      expectedArtifactTypes: ['paper-list', 'research-report'],
      selectedComponentIds: ['paper-card-list', 'report-viewer', 'execution-unit-table'],
    },
    artifacts: [],
  });

  const report = result.artifacts.find((artifact) => artifact.type === 'research-report');
  assert.ok(report);
  assert.ok(result.uiManifest.some((slot) => slot.componentId === 'report-viewer'));
  assert.ok(result.executionUnits.some((unit) => isRecord(unit) && unit.tool === 'agentserver.direct-text'));
  assert.match(result.reasoningTrace, /direct ToolPayload|plain text|AgentServer returned plain text/i);
  console.log('[ok] AgentServer plain-text output is bridged into a research-report ToolPayload');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const fencedWorkspace = await mkdtemp(join(tmpdir(), 'bioagent-agentserver-fenced-json-'));
const fencedServer = createServer(async (req, res) => {
  if (req.method === 'GET' && String(req.url).includes('/api/agent-server/agents/') && String(req.url).endsWith('/context')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: { session: { id: 'mock-fenced-context' }, recentTurns: [], currentWorkEntries: [] } }));
    return;
  }
  if (!['/api/agent-server/runs', '/api/agent-server/runs/stream'].includes(String(req.url)) || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const structuredAnswer = {
    message: 'Updated the prior report from existing artifacts without rerunning.',
    confidence: 0.91,
    claimType: 'direct_answer',
    evidenceLevel: 'agentserver',
    reasoningTrace: 'Parsed the continuation request and reused prior refs.',
    claims: ['The research-report artifact was updated from existing context.'],
    uiManifest: { components: ['report-viewer', 'unknown-artifact-inspector'], layout: 'report-view' },
    executionUnits: [],
    artifacts: [{
      id: 'updated-research-report',
      type: 'research-report',
      dataRef: 'agentserver://mock-fenced-run/updated-report.md',
      metadata: { title: 'Updated Report', format: 'markdown' },
    }],
  };
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-fenced-run',
        status: 'completed',
        output: {
          success: true,
          result: `\`\`\`json\n${JSON.stringify(structuredAnswer, null, 2)}\n\`\`\``,
        },
      },
    },
  };
  res.writeHead(200, { 'Content-Type': req.url === '/api/agent-server/runs/stream' ? 'application/x-ndjson' : 'application/json' });
  res.end(req.url === '/api/agent-server/runs/stream' ? `${JSON.stringify({ result })}\n` : JSON.stringify(result));
});

await new Promise<void>((resolve) => fencedServer.listen(0, '127.0.0.1', resolve));
const fencedAddress = fencedServer.address();
assert.ok(fencedAddress && typeof fencedAddress === 'object');
const fencedBaseUrl = `http://127.0.0.1:${fencedAddress.port}`;

try {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: '基于上一轮结果继续补充报告，不要重新检索；请更新 research-report artifact。',
    workspacePath: fencedWorkspace,
    agentServerBaseUrl: fencedBaseUrl,
    expectedArtifactTypes: ['research-report'],
    selectedComponentIds: ['report-viewer', 'execution-unit-table'],
    uiState: {
      freshTaskGeneration: true,
      forceAgentServerGeneration: true,
      expectedArtifactTypes: ['research-report'],
      selectedComponentIds: ['report-viewer', 'execution-unit-table'],
    },
    artifacts: [],
  });

  assert.equal(result.message, 'Updated the prior report from existing artifacts without rerunning.');
  const reportData = isRecord(result.artifacts[0]?.data) ? result.artifacts[0].data : {};
  assert.doesNotMatch(typeof reportData.markdown === 'string' ? reportData.markdown : '', /```json/);
  assert.ok(result.artifacts.some((artifact) => artifact.type === 'research-report'));
  assert.ok(result.uiManifest.some((slot) => slot.componentId === 'report-viewer'));
  assert.match(result.reasoningTrace, /structured answer JSON|ToolPayload/i);
  console.log('[ok] AgentServer fenced structured JSON is normalized into clean artifacts');
} finally {
  await new Promise<void>((resolve) => fencedServer.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
