import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendTaskAttempt } from '../../src/runtime/task-attempt-history.js';
import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-artifact-ref-followup-'));
await mkdir(join(workspace, '.sciforge', 'artifacts'), { recursive: true });

await appendTaskAttempt(workspace, {
  id: 'generated-literature-smoke',
  prompt: 'Round 1: search recent AI agent papers and write a report',
  skillDomain: 'literature',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  attempt: 1,
  status: 'done',
  codeRef: '.sciforge/tasks/generated-literature-smoke/run.py',
  inputRef: '.sciforge/task-inputs/generated-literature-smoke.json',
  outputRef: '.sciforge/task-results/generated-literature-smoke.json',
  stdoutRef: '.sciforge/logs/generated-literature-smoke.stdout.log',
  stderrRef: '.sciforge/logs/generated-literature-smoke.stderr.log',
  exitCode: 0,
  createdAt: new Date().toISOString(),
});

await writeFile(join(workspace, '.sciforge', 'artifacts', 'session-smoke-paper-list.json'), JSON.stringify({
  id: 'paper-list',
  type: 'paper-list',
  data: {
    rows: [
      { title: 'AgentPulse: A Continuous Multi-Signal Framework for Evaluating AI Agents in Deployment' },
      { title: 'On the Footprints of Reviewer Bots Feedback on Agentic Pull Requests in OSS GitHub Repositories' },
      { title: 'GAMMAF: Graph-Based Anomaly Monitoring Benchmarking in LLM Multi-Agent Systems' },
      { title: 'AgenticCache: Cache-Driven Asynchronous Planning for Embodied AI Agents' },
      { title: 'QED: An Open-Source Multi-Agent System for Generating Mathematical Proofs' },
    ],
  },
}, null, 2));

await writeFile(join(workspace, '.sciforge', 'artifacts', 'session-smoke-research-report.json'), JSON.stringify({
  id: 'research-report',
  type: 'research-report',
  data: { markdown: '## Summary\nAI agent papers cover deployment monitoring, software engineering, multi-agent anomaly detection, planning caches, and math proof systems.' },
}, null, 2));

let requestBody = '';
let generationDispatchCount = 0;
const generatedReportTask = String.raw`
import json
import sys

output_path = sys.argv[2]
payload = {
  "message": "Completed the requested per-paper summary report from prior context.",
  "confidence": 0.82,
  "claimType": "evidence-summary",
  "evidenceLevel": "workspace-task",
  "reasoningTrace": "AgentServer generation run completed a continuation report task.",
  "claims": [{"text": "The continuation report was generated from prior paper-list context.", "confidence": 0.82, "evidenceLevel": "workspace-task"}],
  "uiManifest": [
    {"componentId": "report-viewer", "artifactRef": "research-report", "priority": 1},
    {"componentId": "paper-card-list", "artifactRef": "paper-list", "priority": 2},
    {"componentId": "execution-unit-table", "artifactRef": "research-report", "priority": 3}
  ],
  "executionUnits": [{
    "id": "literature-continuation-report",
    "status": "done",
    "tool": "agentserver.generated.python",
    "params": "{}"
  }],
  "artifacts": [{
    "id": "paper-list",
    "type": "paper-list",
    "producerScenario": "literature",
    "schemaVersion": "1",
    "data": {"rows": [
      {"title": "AgentPulse", "summary": "deployment monitoring", "innovation": "continuous multi-signal evaluation", "method": "benchmark instrumentation"},
      {"title": "Reviewer Bots", "summary": "agentic PR feedback", "innovation": "OSS footprint analysis", "method": "repository mining"}
    ]}
  }, {
    "id": "research-report",
    "type": "research-report",
    "producerScenario": "literature",
    "schemaVersion": "1",
    "data": {"markdown": "## Per-paper report\n\n- AgentPulse: summary, innovation, method.\n- Reviewer Bots: summary, innovation, method."}
  }]
}
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
`;
const server = createServer(async (req, res) => {
  if (req.url !== '/api/agent-server/runs/stream') {
    res.writeHead(404);
    res.end();
    return;
  }
  requestBody = await new Promise<string>((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
  });
  const parsed = JSON.parse(requestBody || '{}');
  const metadata = isRecord(parsed.input) && isRecord(parsed.input.metadata) ? parsed.input.metadata : {};
  const inputText = isRecord(parsed.input) && typeof parsed.input.text === 'string' ? parsed.input.text : '';
  if (metadata.purpose === 'workspace-task-generation') {
    if (/分别在哪里|按执行建议重新分组|不要重新开始独立任务|我在哪可以找到/.test(inputText)) {
      const contextAnswerPayload = inputText.includes('按执行建议重新分组') ? {
        message: [
          '已只读取当前会话已有 paper-list 和 claims。',
          '上一轮失败来自 path-only taskFiles；本轮不需要重新生成脚本。',
          '证据分组摘要已写入 research-report，paper-list 应沿用上一轮上下文 artifact。',
        ].join('\n'),
        confidence: 0.91,
        claimType: 'context-summary',
        evidenceLevel: 'agentserver-context',
        reasoningTrace: 'AgentServer returned only a direct report; SciForge should preserve existing context artifacts.',
        claims: ['Existing paper-list should be carried through for context answers.'],
        uiManifest: { components: ['report-viewer', 'paper-card-list', 'evidence-matrix'] },
        executionUnits: [],
        artifacts: [{
          id: 'research-report',
          type: 'research-report',
          data: { markdown: '## Existing-context regrouping\nNo new scripts or papers were generated.' },
        }],
      } : {
        message: [
          '我先判断当前问题是在询问上一轮产物位置和主题要点，而不是请求重新检索。',
          '任务脚本在 .sciforge/tasks/generated-literature-smoke/run.py，paper-list artifact 在 session-smoke-paper-list.json，research-report artifact 在 session-smoke-research-report.json。',
          '主题包括 deployment monitoring、software engineering、multi-agent anomaly detection、planning caches 和 math proof systems。',
        ].join('\n'),
        confidence: 0.9,
        claimType: 'context-summary',
        evidenceLevel: 'agentserver-context',
        reasoningTrace: 'AgentServer returned a structured context answer from prior refs.',
        claims: ['Existing paper-list and claims are sufficient for this follow-up.'],
        uiManifest: { components: ['paper-card-list', 'evidence-matrix', 'notebook-timeline'] },
        executionUnits: [],
        artifacts: [{
          id: 'paper-list',
          type: 'paper-list',
          dataRef: '.sciforge/task-results/generated-literature-smoke.json',
          metadata: { source: 'existing-context' },
        }],
      };
      res.setHeader('Content-Type', 'application/jsonl');
      res.end(JSON.stringify({
        result: {
          data: {
            run: {
              id: 'mock-backend-decision-context-answer',
              status: 'completed',
              output: {
                text: `\`\`\`json\n${JSON.stringify(contextAnswerPayload, null, 2)}\n\`\`\``,
              },
            },
          },
        },
      }) + '\n');
      return;
    }
    res.setHeader('Content-Type', 'application/jsonl');
    res.end(JSON.stringify({
      result: {
        ok: true,
        data: {
          run: {
            id: 'mock-report-continuation-generation',
            output: {
              result: {
                taskFiles: [{ path: '.sciforge/tasks/literature-continuation-report.py', language: 'python', content: generatedReportTask }],
                entrypoint: { language: 'python', path: '.sciforge/tasks/literature-continuation-report.py' },
                environmentRequirements: { language: 'python' },
                validationCommand: 'python .sciforge/tasks/literature-continuation-report.py <input> <output>',
                expectedArtifacts: ['paper-list', 'research-report'],
                patchSummary: 'Generated a continuation report task from prior context.',
              },
            },
          },
        },
      },
    }) + '\n');
    return;
  }
  res.setHeader('Content-Type', 'application/jsonl');
  const contextAnswerPayload = inputText.includes('按执行建议重新分组') ? {
    message: [
      '已只读取当前会话已有 paper-list 和 claims。',
      '上一轮失败来自 path-only taskFiles；本轮不需要重新生成脚本。',
      '证据分组摘要已写入 research-report，paper-list 应沿用上一轮上下文 artifact。',
    ].join('\n'),
    confidence: 0.91,
    claimType: 'context-summary',
    evidenceLevel: 'agentserver-context',
    reasoningTrace: 'AgentServer returned only a direct report; SciForge should preserve existing context artifacts.',
    claims: ['Existing paper-list should be carried through for context answers.'],
    uiManifest: { components: ['report-viewer', 'paper-card-list', 'evidence-matrix'] },
    executionUnits: [],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: '## Existing-context regrouping\nNo new scripts or papers were generated.' },
    }],
  } : {
    message: [
      '我先判断当前问题是在询问上一轮产物位置和主题要点，而不是请求重新检索。',
      '任务脚本在 .sciforge/tasks/generated-literature-smoke/run.py，paper-list artifact 在 session-smoke-paper-list.json，research-report artifact 在 session-smoke-research-report.json。',
      '主题包括 deployment monitoring、software engineering、multi-agent anomaly detection、planning caches 和 math proof systems。',
    ].join('\n'),
    confidence: 0.9,
    claimType: 'context-summary',
    evidenceLevel: 'agentserver-context',
    reasoningTrace: 'AgentServer returned a structured context answer from prior refs.',
    claims: ['Existing paper-list and claims are sufficient for this follow-up.'],
    uiManifest: { components: ['paper-card-list', 'evidence-matrix', 'notebook-timeline'] },
    executionUnits: [],
    artifacts: [{
      id: 'paper-list',
      type: 'paper-list',
      dataRef: '.sciforge/task-results/generated-literature-smoke.json',
      metadata: { source: 'existing-context' },
    }],
  };
  res.end(JSON.stringify({
    result: {
      data: {
        run: {
          id: 'mock-context-answer',
          output: {
            text: `\`\`\`json\n${JSON.stringify(contextAnswerPayload, null, 2)}\n\`\`\``,
          },
        },
      },
    },
  }) + '\n');
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const mockBaseUrl = `http://127.0.0.1:${address.port}`;

let contextDispatchCount = 0;
const result = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: 'Round 2：基于上一轮结果，不要重新检索。请告诉我上一轮生成的本地任务脚本、task result JSON、stdout/stderr 日志、paper-list artifact、research-report artifact 分别在哪里，并用 5 条要点总结上一轮检索到的论文主题。',
  workspacePath: workspace,
  agentServerBaseUrl: mockBaseUrl,
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  expectedArtifactTypes: ['paper-list', 'research-report'],
  uiState: {
    recentConversation: [
      'user: Round 1 search recent AI agent papers',
      'assistant: Completed and produced paper-list and research-report artifacts.',
    ],
    recentExecutionRefs: [{
      id: 'generated-literature-task',
      status: 'done',
      codeRef: '.sciforge/tasks/generated-literature-smoke/run.py',
      outputRef: '.sciforge/task-results/generated-literature-smoke.json',
      stdoutRef: '.sciforge/logs/generated-literature-smoke.stdout.log',
      stderrRef: '.sciforge/logs/generated-literature-smoke.stderr.log',
    }],
  },
  artifacts: [],
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
    if (event.type === 'agentserver-dispatch') generationDispatchCount += 1;
  },
});

assert.equal(contextDispatchCount, 0);
assert.equal(generationDispatchCount, 1);
assert.match(requestBody, /workspace-task-generation/);
assert.match(requestBody, /contextEnvelope/);
assert.match(requestBody, /recentExecutionRefs|priorAttempts|longTermRefs/);
assert.match(result.reasoningTrace, /AgentServer reasoning|AgentServer returned plain text|context answer/i);
assert.match(result.message, /generated-literature-smoke\/run\.py/);
assert.match(result.message, /session-smoke-paper-list\.json/);
assert.match(result.message, /session-smoke-research-report\.json/);
assert.match(result.message, /软件工程|software|部署|deployment|多智能体|multi-agent/i);
assert.notEqual(result.executionUnits[0]?.tool, 'sciforge.context-ref-inspector');
assert.equal(result.executionUnits[0]?.status, 'done');
const contextReport = result.artifacts.find((artifact) => artifact.type === 'research-report');
assert.ok(contextReport);
assert.notEqual(isRecord(contextReport.metadata) ? contextReport.metadata.status : undefined, 'repair-needed');
assert.match(isRecord(contextReport.data) ? String(contextReport.data.markdown || '') : '', /generated-literature-smoke\/run\.py/);

const existingOnlySummary = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: '不要生成新脚本，也不要检索新论文。请只读取当前会话已有 paper-list 和 claims，把上一轮证据按执行建议重新分组并给我摘要。',
  workspacePath: workspace,
  agentServerBaseUrl: mockBaseUrl,
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  expectedArtifactTypes: ['paper-list', 'research-report'],
  uiState: {
    recentConversation: [
      'user: Round 1 search recent AI agent papers',
      'assistant: Completed and produced paper-list, claims, and research-report artifacts.',
    ],
    recentExecutionRefs: [{
      id: 'generated-literature-task',
      status: 'done',
      codeRef: '.sciforge/tasks/generated-literature-smoke/run.py',
      outputRef: '.sciforge/task-results/generated-literature-smoke.json',
      stdoutRef: '.sciforge/logs/generated-literature-smoke.stdout.log',
      stderrRef: '.sciforge/logs/generated-literature-smoke.stderr.log',
    }],
  },
  artifacts: result.artifacts,
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
    if (event.type === 'agentserver-dispatch') generationDispatchCount += 1;
  },
});
assert.equal(contextDispatchCount, 0);
assert.equal(generationDispatchCount, 2);
assert.match(existingOnlySummary.reasoningTrace, /AgentServer reasoning|AgentServer returned plain text|context answer|direct report|directly/i);
const carriedPaperList = existingOnlySummary.artifacts.find((artifact) => artifact.type === 'paper-list');
assert.ok(carriedPaperList);
assert.notEqual(isRecord(carriedPaperList.metadata) ? carriedPaperList.metadata.status : undefined, 'repair-needed');

const priorRoundDiagnosticSummary = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: 'Round 2：不要重新开始独立任务。请基于上一轮 artifacts 或诊断，总结已经完成什么、缺什么；如果上一轮进入 repair-needed/timeout，请解释原因并给出下一步可恢复计划。',
  workspacePath: workspace,
  agentServerBaseUrl: mockBaseUrl,
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  expectedArtifactTypes: ['paper-list', 'research-report'],
  uiState: {},
  artifacts: [],
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
    if (event.type === 'agentserver-dispatch') generationDispatchCount += 1;
  },
});
assert.equal(contextDispatchCount, 0);
assert.equal(generationDispatchCount, 3);
assert.match(priorRoundDiagnosticSummary.reasoningTrace, /AgentServer reasoning|AgentServer returned plain text|context answer|direct report|directly/i);
assert.match(priorRoundDiagnosticSummary.message, /上一轮|任务脚本|paper-list|context/i);

const reportContinuation = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: '你怎么没有按照要求写一份总结报告，每篇论文需要有简要总结、创新点、方法介绍，并更新 research-report artifact/ref。请基于上一轮结果继续完成，不要重新检索。',
  workspacePath: workspace,
  agentServerBaseUrl: mockBaseUrl,
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  expectedArtifactTypes: ['paper-list', 'research-report'],
  uiState: {
    recentConversation: [
      'user: Round 1 search recent AI agent papers',
      'assistant: Completed and produced paper-list and research-report artifacts.',
      'user: 你怎么没有按照要求写总结报告',
    ],
    recentExecutionRefs: [{
      id: 'generated-literature-task',
      status: 'done',
      codeRef: '.sciforge/tasks/generated-literature-smoke/run.py',
      outputRef: '.sciforge/task-results/generated-literature-smoke.json',
      stdoutRef: '.sciforge/logs/generated-literature-smoke.stdout.log',
      stderrRef: '.sciforge/logs/generated-literature-smoke.stderr.log',
    }],
  },
  artifacts: [],
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
    if (event.type === 'agentserver-dispatch') generationDispatchCount += 1;
  },
});
assert.equal(contextDispatchCount, 0);
assert.equal(generationDispatchCount, 4);
assert.notEqual(reportContinuation.executionUnits[0]?.tool, 'sciforge.context-ref-inspector');
assert.match(reportContinuation.reasoningTrace, /AgentServer generation run|continuation report task/i);
assert.ok(reportContinuation.artifacts.some((artifact) => artifact.type === 'paper-list'));
assert.ok(reportContinuation.artifacts.some((artifact) => artifact.type === 'research-report'));

await new Promise<void>((resolve) => server.close(() => resolve()));

const freshRound = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: [
    'SciForge should complete the user task end-to-end.',
    'Recent multi-turn conversation:',
    'assistant: 上一轮已经有一些 refs。',
    'Current user request:',
    '真实多轮复杂任务测试 Round 1：请基于今天日期检索并整理最近 AI agent 相关论文，必须生成 paper-list 和 research-report，并明确写出生成的本地任务脚本、task result JSON、stdout/stderr 日志路径。',
    'Work requirements:',
    '- For continuation/repair requests, read previous refs before deciding.',
    '- If the user asks where files are stored, answer with exact refs.',
  ].join('\n'),
  workspacePath: workspace,
  agentServerBaseUrl: 'http://127.0.0.1:1',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  expectedArtifactTypes: ['paper-list', 'research-report'],
  uiState: {
    recentConversation: ['assistant: 上一轮已经有一些 refs。'],
    recentExecutionRefs: result.executionUnits,
  },
  artifacts: result.artifacts,
});
assert.notEqual(freshRound.executionUnits[0]?.tool, 'sciforge.context-ref-inspector');
assert.match(freshRound.message, /AgentServer|runtime gateway|repair/i);

const failedWorkspace = await mkdtemp(join(tmpdir(), 'sciforge-artifact-ref-failed-'));
await mkdir(join(failedWorkspace, '.sciforge', 'artifacts'), { recursive: true });
await appendTaskAttempt(failedWorkspace, {
  id: 'generated-literature-success-old',
  prompt: 'older successful search',
  skillDomain: 'literature',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-failed-smoke',
  attempt: 1,
  status: 'done',
  codeRef: '.sciforge/tasks/old-success.py',
  outputRef: '.sciforge/task-results/old-success.json',
  stdoutRef: '.sciforge/logs/old-success.stdout.log',
  stderrRef: '.sciforge/logs/old-success.stderr.log',
  exitCode: 0,
  createdAt: '2026-04-28T00:00:00.000Z',
});
await appendTaskAttempt(failedWorkspace, {
  id: 'referenced-literature-latest-failure',
  prompt: 'latest follow-up tried to run current task',
  skillDomain: 'literature',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-failed-smoke',
  attempt: 1,
  status: 'failed-with-reason',
  codeRef: '.sciforge/tasks/current-failed.py',
  inputRef: '.sciforge/task-inputs/current-failed.json',
  outputRef: '.sciforge/task-results/current-failed.json',
  stdoutRef: '.sciforge/logs/current-failed.stdout.log',
  stderrRef: '.sciforge/logs/current-failed.stderr.log',
  exitCode: 2,
  failureReason: 'missing --outputPath',
  createdAt: '2026-04-28T01:00:00.000Z',
});
await writeFile(join(failedWorkspace, '.sciforge', 'artifacts', 'session-other-paper-list.json'), JSON.stringify({
  id: 'paper-list',
  type: 'paper-list',
  data: { rows: [{ title: 'Unrelated old paper' }] },
}, null, 2));

const failedAnswer = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: '我在哪可以找到下载的论文，以及总结报告',
  workspacePath: failedWorkspace,
  agentServerBaseUrl: 'http://127.0.0.1:1',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-failed-smoke',
  uiState: {
    sessionId: 'session-current-failed',
    recentConversation: [
      'user: 帮我检索今天 arxiv multi agent 论文',
      'assistant: Task failed because --outputPath was missing.',
      'user: 我在哪可以找到下载的论文，以及总结报告',
    ],
    recentExecutionRefs: [{
      id: 'current-failed',
      status: 'failed-with-reason',
      codeRef: '.sciforge/tasks/current-failed.py',
      outputRef: '.sciforge/task-results/current-failed.json',
      stdoutRef: '.sciforge/logs/current-failed.stdout.log',
      stderrRef: '.sciforge/logs/current-failed.stderr.log',
      failureReason: 'missing --outputPath',
    }],
  },
  artifacts: [],
});
assert.match(failedAnswer.message, /AgentServer generation request failed|Agent backend context answer failed|Agent backend is required/);
assert.doesNotMatch(failedAnswer.message, /old-success\.py|Unrelated old paper/);

console.log('[ok] artifact reference follow-up is routed through AgentServer context reasoning');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
