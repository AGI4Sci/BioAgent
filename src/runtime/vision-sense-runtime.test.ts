import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { tryRunVisionSenseRuntime } from './vision-sense-runtime.js';

test('vision-sense does not intercept explicit Playwright Edge MCP browser provider requests', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-edge-mcp-sense-skip-'));
  try {
    const payload = await tryRunVisionSenseRuntime({
      skillDomain: 'literature',
      prompt: '请调用 playwright_edge_browser / sciforge.observe.playwright-edge-mcp，用 Microsoft Edge + Playwright MCP 打开网页并读取正文。',
      workspacePath: workspace,
      selectedToolIds: ['local.vision-sense'],
      artifacts: [],
      uiState: {
        selectedToolIds: ['local.vision-sense'],
        visionSenseConfig: { desktopBridgeEnabled: false },
        toolProviderRoutes: {
          playwright_edge_browser: {
            enabled: true,
            capabilityId: 'playwright_edge_browser',
            source: 'mcp',
            primaryProviderId: 'sciforge.observe.playwright-edge-mcp',
            health: 'ready',
            endpoint: 'http://localhost:8931/mcp',
          },
        },
      },
    });

    assert.equal(payload, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('vision-sense does not intercept literature research topics that mention computer use', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-literature-topic-sense-skip-'));
  try {
    const payload = await tryRunVisionSenseRuntime({
      skillDomain: 'literature',
      prompt: 'Research today arxiv papers about agent computer use. Read full text or PDF as much as possible. Write a Chinese summary report artifact.',
      workspacePath: workspace,
      selectedToolIds: ['local.vision-sense'],
      artifacts: [],
      uiState: {
        selectedToolIds: ['local.vision-sense'],
        visionSenseConfig: { desktopBridgeEnabled: true },
      },
    });

    assert.equal(payload, undefined);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
