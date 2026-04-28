import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendTaskAttempt } from '../../src/runtime/task-attempt-history.js';
import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-artifact-ref-followup-'));
await mkdir(join(workspace, '.bioagent', 'artifacts'), { recursive: true });

await appendTaskAttempt(workspace, {
  id: 'generated-literature-smoke',
  prompt: 'Round 1: search recent AI agent papers and write a report',
  skillDomain: 'literature',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-smoke',
  attempt: 1,
  status: 'done',
  codeRef: '.bioagent/tasks/generated-literature-smoke/run.py',
  inputRef: '.bioagent/task-inputs/generated-literature-smoke.json',
  outputRef: '.bioagent/task-results/generated-literature-smoke.json',
  stdoutRef: '.bioagent/logs/generated-literature-smoke.stdout.log',
  stderrRef: '.bioagent/logs/generated-literature-smoke.stderr.log',
  exitCode: 0,
  createdAt: new Date().toISOString(),
});

await writeFile(join(workspace, '.bioagent', 'artifacts', 'session-smoke-paper-list.json'), JSON.stringify({
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

await writeFile(join(workspace, '.bioagent', 'artifacts', 'session-smoke-research-report.json'), JSON.stringify({
  id: 'research-report',
  type: 'research-report',
  data: { markdown: '## Summary\nAI agent papers cover deployment monitoring, software engineering, multi-agent anomaly detection, planning caches, and math proof systems.' },
}, null, 2));

let requestBody = '';
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
  res.setHeader('Content-Type', 'application/jsonl');
  res.end(JSON.stringify({
    result: {
      data: {
        run: {
          id: 'mock-context-answer',
          output: {
            text: [
              '我先判断当前问题是在询问上一轮产物位置和主题要点，而不是请求重新检索。',
              '任务脚本在 .bioagent/tasks/generated-literature-smoke/run.py，paper-list artifact 在 session-smoke-paper-list.json，research-report artifact 在 session-smoke-research-report.json。',
              '主题包括 deployment monitoring、software engineering、multi-agent anomaly detection、planning caches 和 math proof systems。',
            ].join('\n'),
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
      codeRef: '.bioagent/tasks/generated-literature-smoke/run.py',
      outputRef: '.bioagent/task-results/generated-literature-smoke.json',
      stdoutRef: '.bioagent/logs/generated-literature-smoke.stdout.log',
      stderrRef: '.bioagent/logs/generated-literature-smoke.stderr.log',
    }],
  },
  artifacts: [],
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
  },
});

await new Promise<void>((resolve) => server.close(() => resolve()));

assert.equal(contextDispatchCount, 1);
assert.match(requestBody, /context-answer/);
assert.match(requestBody, /referenceContext/);
assert.match(result.reasoningTrace, /AgentServer reasoning|AgentServer returned plain text|context answer/i);
assert.match(result.message, /generated-literature-smoke\/run\.py/);
assert.match(result.message, /session-smoke-paper-list\.json/);
assert.match(result.message, /session-smoke-research-report\.json/);
assert.match(result.message, /软件工程|software|部署|deployment|多智能体|multi-agent/i);
assert.notEqual(result.executionUnits[0]?.tool, 'bioagent.context-ref-inspector');
assert.equal(result.executionUnits[0]?.status, 'done');
assert.ok(result.artifacts.some((artifact) => artifact.type === 'research-report'));

const reportContinuation = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: '你怎么没有按照要求写一份总结报告，每篇论文需要有简要总结、创新点、方法介绍。请基于上一轮结果继续完成，不要重新检索。',
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
      codeRef: '.bioagent/tasks/generated-literature-smoke/run.py',
      outputRef: '.bioagent/task-results/generated-literature-smoke.json',
      stdoutRef: '.bioagent/logs/generated-literature-smoke.stdout.log',
      stderrRef: '.bioagent/logs/generated-literature-smoke.stderr.log',
    }],
  },
  artifacts: [],
}, {
  onEvent(event) {
    if (event.type === 'agentserver-context-answer-dispatch') contextDispatchCount += 1;
  },
});
assert.equal(contextDispatchCount, 2);
assert.notEqual(reportContinuation.executionUnits[0]?.tool, 'bioagent.context-ref-inspector');
assert.match(reportContinuation.reasoningTrace, /AgentServer reasoning|AgentServer returned plain text|context answer/i);

const freshRound = await runWorkspaceRuntimeGateway({
  skillDomain: 'literature',
  prompt: [
    'BioAgent should complete the user task end-to-end.',
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
assert.notEqual(freshRound.executionUnits[0]?.tool, 'bioagent.context-ref-inspector');
assert.match(freshRound.message, /AgentServer|runtime gateway|repair/i);

const failedWorkspace = await mkdtemp(join(tmpdir(), 'bioagent-artifact-ref-failed-'));
await mkdir(join(failedWorkspace, '.bioagent', 'artifacts'), { recursive: true });
await appendTaskAttempt(failedWorkspace, {
  id: 'generated-literature-success-old',
  prompt: 'older successful search',
  skillDomain: 'literature',
  scenarioPackageRef: { id: 'literature-evidence-review', version: '1.0.0', source: 'built-in' },
  skillPlanRef: 'skill-plan-failed-smoke',
  attempt: 1,
  status: 'done',
  codeRef: '.bioagent/tasks/old-success.py',
  outputRef: '.bioagent/task-results/old-success.json',
  stdoutRef: '.bioagent/logs/old-success.stdout.log',
  stderrRef: '.bioagent/logs/old-success.stderr.log',
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
  codeRef: '.bioagent/tasks/current-failed.py',
  inputRef: '.bioagent/task-inputs/current-failed.json',
  outputRef: '.bioagent/task-results/current-failed.json',
  stdoutRef: '.bioagent/logs/current-failed.stdout.log',
  stderrRef: '.bioagent/logs/current-failed.stderr.log',
  exitCode: 2,
  failureReason: 'missing --outputPath',
  createdAt: '2026-04-28T01:00:00.000Z',
});
await writeFile(join(failedWorkspace, '.bioagent', 'artifacts', 'session-other-paper-list.json'), JSON.stringify({
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
      codeRef: '.bioagent/tasks/current-failed.py',
      outputRef: '.bioagent/task-results/current-failed.json',
      stdoutRef: '.bioagent/logs/current-failed.stdout.log',
      stderrRef: '.bioagent/logs/current-failed.stderr.log',
      failureReason: 'missing --outputPath',
    }],
  },
  artifacts: [],
});
assert.match(failedAnswer.message, /Agent backend context answer failed|Agent backend is required/);
assert.doesNotMatch(failedAnswer.message, /old-success\.py|Unrelated old paper/);

console.log('[ok] artifact reference follow-up is routed through AgentServer context reasoning');
