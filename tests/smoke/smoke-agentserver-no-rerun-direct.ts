import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-no-rerun-direct-'));
let sawAgentServerOwnsNoRerunDecision = false;
let sawContinuationHasNoKeywordExecutionFlags = false;

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && String(req.url).includes('/api/agent-server/agents/') && String(req.url).endsWith('/context')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      data: {
        session: { id: 'session-no-rerun', status: 'active' },
        recentTurns: [],
        currentWorkEntries: [],
      },
    }));
    return;
  }
  if (req.method !== 'POST' || String(req.url) !== '/api/agent-server/runs/stream') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }
  const body = await readJson(req);
  const promptText = isRecord(body.input) && typeof body.input.text === 'string' ? body.input.text : '';
  sawAgentServerOwnsNoRerunDecision = sawAgentServerOwnsNoRerunDecision || promptText.includes('AgentServer owns orchestration')
    && promptText.includes('"decisionOwner": "AgentServer"')
    && !promptText.includes('"forbidWorkspaceExecution"')
    && !promptText.includes('"requiresWorkspaceExecution"');
  if (promptText.includes('不要重新开始独立任务') && promptText.includes('生成/运行补充 task')) {
    sawContinuationHasNoKeywordExecutionFlags = promptText.includes('AgentServer owns orchestration')
      && promptText.includes('"decisionOwner": "AgentServer"')
      && !promptText.includes('"forbidWorkspaceExecution"')
      && !promptText.includes('"requiresWorkspaceExecution"');
    const continuationPayload = {
      message: 'Continuation can still run a supplemental task when the user only forbids starting an unrelated independent task.',
      confidence: 0.9,
      claimType: 'continuation-contract',
      evidenceLevel: 'agentserver-contract',
      reasoningTrace: 'Verified no-restart wording does not forbid workspace execution.',
      claims: [{
        text: 'evidence-matrix has confidence_rationale and evidence_strength_distribution; research-report has 局限和下一轮缺口.',
        confidence: 0.9,
      }],
      uiManifest: [
        { componentId: 'evidence-matrix', artifactRef: 'evidence-matrix', priority: 1 },
        { componentId: 'report-viewer', artifactRef: 'research-report', priority: 2 },
      ],
      executionUnits: [{ id: 'agentserver-continuation-contract', status: 'done', tool: 'agentserver.direct-test' }],
      artifacts: [{
        id: 'evidence-matrix',
        type: 'evidence-matrix',
        schemaVersion: '1',
        data: {
          rows: [{
            model_sample: 'KRAS G12D organoid',
            intervention: 'MEK inhibitor',
            main_finding: 'EGFR feedback',
            evidence_strength: 'moderate',
            resistance_signal: 'RTK bypass',
            confidence_rationale: 'Model and intervention are explicit in prior corpus.',
          }],
          evidence_strength_distribution: { moderate: 1 },
        },
      }, {
        id: 'research-report',
        type: 'research-report',
        schemaVersion: '1',
        data: {
          markdown: '## 局限和下一轮缺口\n\n已补充 continuation contract 测试。',
        },
      }],
    };
    const continuationResult = {
      ok: true,
      data: {
        run: {
          id: 'mock-continuation-allows-execution-run',
          status: 'completed',
          output: { result: continuationPayload },
        },
      },
    };
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(`${JSON.stringify({ result: continuationResult })}\n`);
    return;
  }
  const answer = [
    '基于上一轮已有 refs 直接回答，不重新运行。',
    'entity: KRAS G12D; timeline steps: 4.',
    'task code: .bioagent/tasks/generated-knowledge-prev/notebook_timeline_task.py',
    'output: .bioagent/task-results/generated-knowledge-prev.json',
    'stdout: .bioagent/logs/generated-knowledge-prev.stdout.log',
    'stderr: .bioagent/logs/generated-knowledge-prev.stderr.log',
    'Even if this answer mentions taskFiles: [{"path": ".bioagent/tasks/generated-knowledge-prev/notebook_timeline_task.py"}], it is a reference, not a new task request.',
  ].join('\n');
  const result = {
    ok: true,
    data: {
      run: {
        id: 'mock-no-rerun-run',
        status: 'completed',
        output: {
          result: answer,
        },
      },
    },
  };
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  res.end(`${JSON.stringify({ result })}\n`);
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: 'knowledge',
    prompt: '不要重新运行、不要重新生成代码。只基于上一轮 notebook-timeline artifact 和 workspace refs 直接回答 entity、timeline 步数和 code/output/stdout/stderr 路径。',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    expectedArtifactTypes: ['notebook-timeline'],
    artifacts: [{
      id: 'notebook-timeline',
      type: 'notebook-timeline',
      data: {
        entity: 'KRAS G12D',
        timeline: [{ step: 1 }, { step: 2 }, { step: 3 }, { step: 4 }],
      },
      metadata: {
        outputRef: '.bioagent/task-results/generated-knowledge-prev.json',
      },
    }],
    uiState: {
      sessionId: 'session-no-rerun',
      recentExecutionRefs: [{
        id: 'generated-knowledge-prev',
        status: 'done',
        codeRef: '.bioagent/tasks/generated-knowledge-prev/notebook_timeline_task.py',
        outputRef: '.bioagent/task-results/generated-knowledge-prev.json',
        stdoutRef: '.bioagent/logs/generated-knowledge-prev.stdout.log',
        stderrRef: '.bioagent/logs/generated-knowledge-prev.stderr.log',
      }],
    },
  });

  assert.equal(sawAgentServerOwnsNoRerunDecision, true);
  assert.match(result.message, /KRAS G12D/);
  assert.match(result.message, /generated-knowledge-prev/);
  assert.equal(result.executionUnits[0].tool, 'agentserver.direct-text');
  const attempts = await readdir(join(workspace, '.bioagent', 'task-attempts')).catch(() => []);
  assert.equal(attempts.length, 0);

  const continuation = await runWorkspaceRuntimeGateway({
    skillDomain: 'literature',
    prompt: 'Round A2：继续上一轮，不要重新开始独立任务。请读取刚才成功落盘的 refs，并生成/运行补充 task：在 evidence-matrix 中补充一个 confidence_rationale 字段，并新增 evidence_strength_distribution 聚合统计；完成后列出 task result JSON、stdout/stderr 路径。',
    workspacePath: workspace,
    agentServerBaseUrl: baseUrl,
    expectedArtifactTypes: ['evidence-matrix', 'research-report'],
    artifacts: [{
      id: 'evidence-matrix',
      type: 'evidence-matrix',
      data: { rows: [] },
    }],
    uiState: {
      sessionId: 'session-no-rerun',
      recentExecutionRefs: [{
        id: 'generated-literature-prev',
        status: 'done',
        codeRef: '.bioagent/tasks/generated-literature-prev/run.py',
        outputRef: '.bioagent/task-results/generated-literature-prev.json',
        stdoutRef: '.bioagent/logs/generated-literature-prev.stdout.log',
        stderrRef: '.bioagent/logs/generated-literature-prev.stderr.log',
      }],
    },
  });

  assert.equal(sawContinuationHasNoKeywordExecutionFlags, true);
  assert.match(continuation.message, /supplemental task/);
  assert.ok(continuation.artifacts.some((artifact) => artifact.type === 'evidence-matrix'));
  console.log('[ok] no-rerun and continuation follow-ups leave execution decisions to AgentServer without BioAgent keyword flags');
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
