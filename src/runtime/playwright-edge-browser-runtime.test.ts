import assert from 'node:assert/strict';
import { test } from 'node:test';

import { playwrightEdgeBrowserInvocationInputFromRequest } from './playwright-edge-browser-runtime.js';

test('Playwright Edge browser runtime builds invocation input from configured provider route', () => {
  const input = playwrightEdgeBrowserInvocationInputFromRequest({
    skillDomain: 'literature',
    prompt: '请使用 playwright_edge_browser / sciforge.observe.playwright-edge-mcp 打开 https://example.com 并读取页面。',
    workspacePath: '/tmp/sciforge',
    artifacts: [],
    uiState: {
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

  assert.deepEqual(input, {
    task: '请使用 playwright_edge_browser / sciforge.observe.playwright-edge-mcp 打开 https://example.com 并读取页面。',
    url: 'https://example.com',
    mode: 'read',
    maxChars: 1800,
    timeoutMs: 60000,
    mcpUrl: 'http://localhost:8931/mcp',
  });
});

test('Playwright Edge browser runtime ignores generic browser prompts without explicit Edge MCP intent', () => {
  const input = playwrightEdgeBrowserInvocationInputFromRequest({
    skillDomain: 'literature',
    prompt: '打开 https://example.com 并总结网页。',
    workspacePath: '/tmp/sciforge',
    artifacts: [],
    uiState: {
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

  assert.equal(input, undefined);
});
