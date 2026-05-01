import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-context-meter-smoke-'));
const workspacePort = 24080 + Math.floor(Math.random() * 1000);
const uiPort = 25080 + Math.floor(Math.random() * 1000);
const children: ChildProcess[] = [];

try {
  await mkdir(join(workspace, '.bioagent', 'artifacts'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'task-results'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'scenarios'), { recursive: true });
  await writeFile(join(workspace, '.bioagent', 'workspace-state.json'), JSON.stringify({
    schemaVersion: 2,
    workspacePath: workspace,
    sessionsByScenario: {},
    archivedSessions: [],
    alignmentContracts: [],
    updatedAt: new Date().toISOString(),
  }, null, 2));

  children.push(start('workspace', ['npm', 'run', 'workspace:server'], { BIOAGENT_WORKSPACE_PORT: String(workspacePort) }));
  children.push(start('ui', ['npm', 'run', 'dev:ui', '--', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], { BIOAGENT_UI_PORT: String(uiPort) }));
  await waitForHttp(`http://127.0.0.1:${workspacePort}/health`);
  await waitForHttp(`http://127.0.0.1:${uiPort}/`);

  const browser = await chromium.launch({
    executablePath: browserExecutablePath(),
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'],
  });
  try {
    const page = await newContextMeterPage(browser);
    const compactRequests: Array<Record<string, unknown>> = [];
    const runRequests: Array<Record<string, unknown>> = [];
    let runCount = 0;
    let releaseThirdRun: (() => void) | undefined;
    let resolveThirdRunStarted: (() => void) | undefined;
    const thirdRunStarted = new Promise<void>((resolve) => {
      resolveThirdRunStarted = resolve;
    });

    await page.route(`http://127.0.0.1:${workspacePort}/api/bioagent/tools/run/stream`, async (route, request) => {
      runRequests.push(request.postDataJSON() as Record<string, unknown>);
      runCount += 1;
      if (runCount === 3) {
        resolveThirdRunStarted?.();
        await new Promise<void>((resolve) => {
          releaseThirdRun = resolve;
        });
      }
      const ratio = runCount === 1 ? 0.72 : runCount === 2 ? 0.86 : runCount === 3 ? 0.61 : 0.59;
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson; charset=utf-8',
        body: contextWindowToolStreamBody(runCount, ratio),
      });
    });

    await page.route('http://127.0.0.1:18080/api/agent-server/**', async (route, request) => {
      compactRequests.push(request.postDataJSON() as Record<string, unknown>);
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          contextCompaction: {
            status: 'completed',
            source: 'agentserver',
            backend: 'codex',
            compactCapability: 'agentserver',
            reason: 'auto-threshold-before-send',
            completedAt: now,
            lastCompactedAt: now,
            message: 'browser smoke compact preflight completed',
            auditRefs: ['agentserver://browser-smoke/context-compact'],
            before: contextWindowState(0.86, 'near-limit'),
            after: contextWindowState(0.87, 'near-limit'),
          },
        }),
      });
    });

    await page.goto(`http://127.0.0.1:${uiPort}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '场景工作台' }).click();
    await page.getByText('Scenario Builder').waitFor({ timeout: 15_000 });
    await page.locator('.chat-panel .composer textarea').waitFor({ timeout: 15_000 });

    await sendPrompt(page, 'context-window round one usage reaches watch threshold', 1);
    await page.waitForFunction(() => document.querySelector('.context-window-meter.watch')?.textContent?.includes('72%'), null, { timeout: 15_000 });
    assert.equal(compactRequests.length, 0, 'watch-level usage should not compact immediately');

    await sendPrompt(page, 'context-window round two usage reaches auto compact threshold', 2);
    await page.waitForFunction(() => document.querySelector('.context-window-meter.near-limit')?.textContent?.includes('86%'), null, { timeout: 15_000 });
    assert.equal(compactRequests.length, 0, 'near-limit usage should wait for the next send');

    await page.locator('.chat-panel .composer textarea').fill('context-window round three should compact before sending');
    await page.locator('.chat-panel .composer').getByRole('button', { name: '发送' }).click();
    await waitForCondition(() => compactRequests.length === 1, 'compact preflight request');
    await thirdRunStarted;
    assert.equal(runRequests.length, 3, 'third turn should start after compact preflight');
    assert.equal(compactRequests[0]?.reason, 'auto-threshold-before-send');
    await page.getByText(/上下文压缩完成|browser smoke compact preflight completed/).waitFor({ timeout: 15_000 });

    await page.locator('.context-window-meter').click();
    await page.waitForFunction(() => document.querySelector('.context-window-meter')?.textContent?.includes('pending'), null, { timeout: 15_000 });
    await page.waitForTimeout(500);
    assert.equal(compactRequests.length, 1, 'running meter click should only mark pending compact');

    releaseThirdRun?.();
    await page.getByText('Context smoke response 3').first().waitFor({ timeout: 15_000 });
    assert.equal(runRequests.length, 3, 'running pending marker should not enqueue an extra turn');
    assert.equal(compactRequests.length, 1, 'compact preflight should be single-shot across active turn');
    assert.deepEqual((page as Page & { __bioagentPageErrors?: string[] }).__bioagentPageErrors ?? [], [], 'context meter workflow should not emit page errors');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log('[ok] browser context meter smoke covered watch/near-limit colors, preflight compact, running pending-only meter click, and user-visible compact observation');
} finally {
  for (const child of children.reverse()) child.kill('SIGTERM');
  await rm(workspace, { recursive: true, force: true });
}

async function newContextMeterPage(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 980 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[browser:${message.type()}] ${message.text()}`);
  });
  const config = {
    schemaVersion: 1,
    agentServerBaseUrl: 'http://127.0.0.1:18080',
    workspaceWriterBaseUrl: `http://127.0.0.1:${workspacePort}`,
    workspacePath: workspace,
    modelProvider: 'native',
    modelBaseUrl: '',
    modelName: '',
    apiKey: '',
    agentBackend: 'codex',
    requestTimeoutMs: 5_000,
    updatedAt: new Date().toISOString(),
  };
  await fetch(`http://127.0.0.1:${workspacePort}/api/bioagent/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  await page.addInitScript(({ config }) => {
    window.localStorage.setItem('bioagent.config.v1', JSON.stringify(config));
    window.localStorage.setItem('bioagent.workspace.v2', JSON.stringify({
      schemaVersion: 2,
      workspacePath: config.workspacePath,
      sessionsByScenario: {},
      archivedSessions: [],
      alignmentContracts: [],
      updatedAt: new Date().toISOString(),
    }));
  }, { config });
  (page as Page & { __bioagentPageErrors?: string[] }).__bioagentPageErrors = pageErrors;
  return page;
}

async function sendPrompt(page: Page, prompt: string, responseIndex: number) {
  await page.locator('.chat-panel .composer textarea').fill(prompt);
  await page.locator('.chat-panel .composer').getByRole('button', { name: '发送' }).click();
  await page.getByText(`Context smoke response ${responseIndex}`).first().waitFor({ timeout: 15_000 });
}

function contextWindowToolStreamBody(round: number, ratio: number) {
  return [
    JSON.stringify({
      event: {
        type: 'contextWindowState',
        message: `browser smoke context ratio ${Math.round(ratio * 100)}%`,
        contextWindowState: contextWindowState(ratio, ratio >= 0.82 ? 'near-limit' : ratio >= 0.68 ? 'watch' : 'healthy'),
      },
    }),
    JSON.stringify({
      result: {
        message: `Context smoke response ${round}: context meter state stayed consistent for ratio ${Math.round(ratio * 100)}%.`,
        confidence: 0.9,
        claimType: 'fact',
        evidenceLevel: 'mock-browser',
        reasoningTrace: 'Browser smoke mocked context-window usage and compaction UX.',
        claims: [],
        uiManifest: [],
        executionUnits: [{
          id: `eu-context-window-${round}`,
          tool: 'workspace.context-window-smoke',
          params: `round=${round}`,
          status: 'done',
          hash: `context-window-${round}`,
        }],
        artifacts: [],
      },
    }),
    '',
  ].join('\n');
}

function contextWindowState(ratio: number, status: 'healthy' | 'watch' | 'near-limit') {
  return {
    backend: 'codex',
    provider: 'codex',
    model: 'browser-smoke-context-model',
    usedTokens: Math.round(100_000 * ratio),
    input: Math.round(80_000 * ratio),
    output: Math.round(20_000 * ratio),
    windowTokens: 100_000,
    ratio,
    source: 'provider-usage',
    status,
    compactCapability: 'agentserver',
    autoCompactThreshold: 0.82,
    watchThreshold: 0.68,
    nearLimitThreshold: 0.86,
    auditRefs: [`agentserver://browser-smoke/context/${status}`],
  };
}

function start(label: string, command: string[], extraEnv: Record<string, string>) {
  const child = spawn(command[0] ?? 'npm', command.slice(1), {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(`[${label}] ${text}`);
  });
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(`[${label}] ${text}`);
  });
  return child;
}

async function waitForHttp(url: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForCondition(predicate: () => boolean, label: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function browserExecutablePath() {
  const candidates = [
    process.env.BIOAGENT_BROWSER_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No Chromium-compatible browser found. Set BIOAGENT_BROWSER_EXECUTABLE to run browser smoke.');
}
