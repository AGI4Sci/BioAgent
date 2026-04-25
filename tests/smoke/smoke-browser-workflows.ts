import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';
import { buildBuiltInScenarioPackage } from '../../src/ui/src/scenarioCompiler/scenarioPackage';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-browser-smoke-'));
const artifactsDir = resolve('docs', 'test-artifacts');
const importPackagePath = join(workspace, 'browser-smoke-imported.scenario-package.json');
const workspacePort = 21080 + Math.floor(Math.random() * 1000);
const uiPort = 22080 + Math.floor(Math.random() * 1000);
const children: ChildProcess[] = [];

try {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(importPackagePath, JSON.stringify(browserSmokeScenarioPackage(), null, 2));
  children.push(start('workspace', ['npm', 'run', 'workspace:server'], { BIOAGENT_WORKSPACE_PORT: String(workspacePort) }));
  children.push(start('ui', ['npm', 'run', 'dev:ui', '--', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], { BIOAGENT_UI_PORT: String(uiPort) }));
  await waitForHttp(`http://127.0.0.1:${workspacePort}/health`);
  await waitForHttp(`http://127.0.0.1:${uiPort}/`);

  const executablePath = browserExecutablePath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'],
  });
  try {
    const page = await newConfiguredPage(browser, { width: 1440, height: 1050 });
    await page.goto(`http://127.0.0.1:${uiPort}/`, { waitUntil: 'networkidle' });
    await page.getByText('AI Scenario Builder').waitFor({ timeout: 15_000 });
    const importChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入 package' }).click();
    await (await importChooser).setFiles(importPackagePath);
    await page.getByText('Scenario Builder').waitFor({ timeout: 15_000 });
    await page.getByText('browser-smoke-imported-package').waitFor({ timeout: 15_000 });
    await page.getByText('研究概览').first().click();
    await page.getByRole('heading', { name: 'Scenario Library' }).waitFor();
    const importedCard = page.locator('.scenario-card', { hasText: 'browser-smoke-imported-package' }).first();
    await importedCard.getByRole('button', { name: '导出', exact: true }).click();
    await page.getByText(/已导出 Browser Smoke Imported Package package JSON/).waitFor({ timeout: 15_000 });
    await page.locator('.scenario-builder textarea').fill('构建一个单细胞差异表达场景，输入表达矩阵和metadata，输出火山图、热图、UMAP和execution diagnostics。');
    await page.getByRole('button', { name: '生成场景设置' }).click();
    await page.locator('code', { hasText: 'volcano-plot' }).first().waitFor();
    await page.getByRole('button', { name: '进入场景工作台' }).click();
    await page.getByText('Scenario Builder').waitFor();
    await page.getByRole('button', { name: 'skill', exact: true }).click();
    await page.getByText('skillPlan').waitFor();
    await page.getByRole('button', { name: 'validation', exact: true }).click();
    await page.getByText('issues').waitFor();
    await page.getByRole('button', { name: '保存 draft' }).click();
    await page.getByText('已保存 draft 到 workspace。').waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await page.getByText(/已发布到 workspace scenario library|quality gate/).waitFor({ timeout: 15_000 });
    await assertNoCriticalOverflow(page, 'desktop-builder');
    await page.screenshot({ path: join(artifactsDir, 'browser-smoke-desktop.png'), fullPage: true });

    await page.getByText('研究概览').first().click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Scenario Library' }).waitFor();
    await page.getByText('omics-differential-exploration-workspace-draft').waitFor({ timeout: 15_000 });
    await page.locator('.scenario-card', { hasText: 'omics-differential-exploration-workspace-draft' }).getByRole('button', { name: '打开' }).click();
    await page.getByText('Scenario Builder').waitFor();
    await page.getByText('omics-differential-exploration-workspace-draft').waitFor();

    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByText('Scenario Builder').waitFor();
    await assertNoCriticalOverflow(page, 'mobile-workbench');
    await page.screenshot({ path: join(artifactsDir, 'browser-smoke-mobile.png'), fullPage: true });
    assert.deepEqual((page as Page & { __bioagentPageErrors?: string[] }).__bioagentPageErrors ?? [], [], 'builder workflow should not emit page errors');
    await page.close();

    const structurePage = await newConfiguredPage(browser, { width: 1280, height: 900 }, true);
    await structurePage.goto(`http://127.0.0.1:${uiPort}/`, { waitUntil: 'networkidle' });
    await structurePage.getByRole('heading', { name: 'Official Package Catalog' }).waitFor();
    const catalog = structurePage.locator('section', { has: structurePage.getByRole('heading', { name: 'Official Package Catalog' }) });
    const structurePackageCard = catalog.locator('.scenario-card', { hasText: 'structure-exploration' }).first();
    await structurePackageCard.scrollIntoViewIfNeeded();
    const importButton = structurePackageCard.getByRole('button', { name: '导入并打开', exact: true });
    if (await importButton.count()) {
      await importButton.click();
    } else {
      await structurePackageCard.getByRole('button', { name: '打开', exact: true }).click();
    }
    await structurePage.locator('.manifest-diagnostics code', { hasText: 'molecule-viewer' }).waitFor({ timeout: 15_000 });
    await structurePage.locator('.molecule-viewer-shell').waitFor({ timeout: 15_000 });
    await structurePage.screenshot({ path: join(artifactsDir, 'browser-smoke-structure.png'), fullPage: true });
    const viewerBox = await structurePage.locator('.molecule-viewer-shell').boundingBox();
    assert.ok(viewerBox && viewerBox.width > 260 && viewerBox.height > 220, 'structure viewer should be visible and stable');
    assert.deepEqual((structurePage as Page & { __bioagentPageErrors?: string[] }).__bioagentPageErrors ?? [], [], 'structure workflow should not emit page errors');
    await structurePage.close();
  } finally {
    await browser.close();
  }

  console.log(`[ok] browser smoke covered Builder publish/open flow, mobile layout, and structure viewer screenshots in ${artifactsDir}`);
} finally {
  for (const child of children.reverse()) child.kill('SIGTERM');
  await rm(workspace, { recursive: true, force: true });
}

async function newConfiguredPage(browser: Browser, viewport: { width: number; height: number }, withStructureState = false) {
  const page = await browser.newPage({ viewport });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[browser:${message.type()}] ${message.text()}`);
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.addInitScript(({ config, structureState }) => {
    window.localStorage.setItem('bioagent.config.v1', JSON.stringify(config));
    window.localStorage.setItem('bioagent.workspace.v2', JSON.stringify(structureState ?? {
      schemaVersion: 2,
      workspacePath: config.workspacePath,
      sessionsByScenario: {},
      archivedSessions: [],
      alignmentContracts: [],
      updatedAt: new Date().toISOString(),
    }));
  }, {
    config: {
      schemaVersion: 1,
      agentServerBaseUrl: 'http://127.0.0.1:18080',
      workspaceWriterBaseUrl: `http://127.0.0.1:${workspacePort}`,
      workspacePath: workspace,
      modelProvider: 'native',
      modelBaseUrl: '',
      modelName: '',
      apiKey: '',
      requestTimeoutMs: 300_000,
      updatedAt: new Date().toISOString(),
    },
    structureState: withStructureState ? structureWorkspaceState(workspace) : undefined,
  });
  (page as Page & { __bioagentPageErrors?: string[] }).__bioagentPageErrors = pageErrors;
  return page;
}

function structureWorkspaceState(workspacePath: string) {
  const now = new Date().toISOString();
  const structureSession = {
    schemaVersion: 2,
    sessionId: 'session-structure-browser-smoke',
    scenarioId: 'structure-exploration',
    title: 'Structure browser smoke',
    createdAt: now,
    messages: [],
    runs: [],
    uiManifest: [{ componentId: 'molecule-viewer', title: 'Structure viewer', artifactRef: 'artifact-structure-browser-smoke', priority: 1 }],
    claims: [],
    executionUnits: [],
    artifacts: [{
      id: 'artifact-structure-browser-smoke',
      type: 'structure-summary',
      producerScenario: 'structure-exploration',
      schemaVersion: '1',
      metadata: { pdbId: 'browser-smoke', ligand: 'ATP', pocketLabel: 'Browser smoke pocket' },
      dataRef: `data:text/plain,${encodeURIComponent(browserSmokePdb())}`,
      data: {
        pdbId: 'browser-smoke',
        ligand: 'ATP',
        pocketLabel: 'Browser smoke pocket',
        atoms: [
          { atomName: 'N', residueName: 'GLY', chain: 'A', residueNumber: '1', element: 'N', x: -1.2, y: 0.1, z: 0.2 },
          { atomName: 'CA', residueName: 'GLY', chain: 'A', residueNumber: '1', element: 'C', x: 0.0, y: 0.3, z: 0.0 },
          { atomName: 'C', residueName: 'GLY', chain: 'A', residueNumber: '1', element: 'C', x: 1.2, y: 0.0, z: -0.2 },
          { atomName: 'O', residueName: 'GLY', chain: 'A', residueNumber: '1', element: 'O', x: 1.8, y: -0.8, z: 0.1 },
          { atomName: 'P', residueName: 'ATP', chain: 'B', residueNumber: '2', element: 'P', x: 0.2, y: 1.4, z: 0.6, hetatm: true },
        ],
      },
      visibility: 'public',
    }],
    notebook: [],
    versions: [],
    updatedAt: now,
  };
  return {
    schemaVersion: 2,
    workspacePath,
    sessionsByScenario: {
      'structure-exploration': structureSession,
    },
    archivedSessions: [],
    alignmentContracts: [],
    updatedAt: now,
  };
}

function browserSmokePdb() {
  return [
    'ATOM      1 N    GLY A   1      -1.200   0.100   0.200  1.00 20.00           N',
    'ATOM      2 CA   GLY A   1       0.000   0.300   0.000  1.00 20.00           C',
    'ATOM      3 C    GLY A   1       1.200   0.000  -0.200  1.00 20.00           C',
    'ATOM      4 O    GLY A   1       1.800  -0.800   0.100  1.00 20.00           O',
    'HETATM    5 P    ATP B   2       0.200   1.400   0.600  1.00 20.00           P',
    'END',
  ].join('\n');
}

function browserSmokeScenarioPackage() {
  const pkg = buildBuiltInScenarioPackage('biomedical-knowledge-graph', '2026-04-25T00:00:00.000Z');
  return {
    ...pkg,
    id: 'browser-smoke-imported-package',
    version: '1.0.0',
    status: 'draft',
    scenario: {
      ...pkg.scenario,
      id: 'browser-smoke-imported-package',
      title: 'Browser Smoke Imported Package',
      source: 'workspace',
    },
    versions: [{
      version: '1.0.0',
      status: 'draft',
      createdAt: '2026-04-25T00:00:00.000Z',
      summary: 'Browser smoke imported package fixture.',
      scenarioHash: 'browser-smoke',
    }],
  };
}

async function assertNoCriticalOverflow(page: Page, label: string) {
  const offenders = await page.evaluate(() => Array.from(document.querySelectorAll('button, .scenario-card, .scenario-settings-summary, .scenario-publish-row, .manifest-diagnostics'))
    .map((element) => {
      const box = element.getBoundingClientRect();
      const html = element instanceof HTMLElement ? element.innerText.trim().replace(/\s+/g, ' ').slice(0, 80) : element.tagName;
      return {
        html,
        width: box.width,
        height: box.height,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      };
    })
    .filter((item) => item.width > 0 && item.height > 0 && (item.scrollWidth > item.width + 8 || item.scrollHeight > item.height + 12)));
  assert.deepEqual(offenders, [], `${label} should not have critical text overflow`);
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
