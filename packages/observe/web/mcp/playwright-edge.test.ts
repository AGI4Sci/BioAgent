import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParallelPlaywrightEdgeMcpServersConfig,
  buildPlaywrightEdgeMcpCodexTomlSnippet,
  buildPlaywrightEdgeMcpProviderAvailability,
  buildPlaywrightEdgeMcpServerConfig,
  buildPlaywrightEdgeMcpServersConfig,
  buildPlaywrightEdgeMcpToolProviderRoutes,
  playwrightEdgeMcpHttpUrl,
  playwrightEdgeMcpOutputDir,
  playwrightEdgeMcpServerName,
  playwrightEdgeMcpUserDataDir,
  PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID,
  PLAYWRIGHT_EDGE_MCP_PROVIDER_ID,
} from './playwright-edge';

test('buildPlaywrightEdgeMcpServerConfig uses Microsoft Edge, headed defaults, and an isolated profile', () => {
  const config = buildPlaywrightEdgeMcpServerConfig({
    homeDir: '/Users/example',
  });

  assert.equal(config.command, 'npx');
  assert.deepEqual(config.args, [
    '@playwright/mcp@latest',
    '--browser=msedge',
    '--user-data-dir=/Users/example/.pw-mcp-edge-profile',
    '--viewport-size=1440x900',
    '--output-dir=/Users/example/.pw-mcp-edge-output',
  ]);
  assert.equal(config.args.some((arg) => arg === '--headless'), false);
});

test('buildParallelPlaywrightEdgeMcpServersConfig allocates separate profile directories per process', () => {
  const config = buildParallelPlaywrightEdgeMcpServersConfig(['p1', 'p2'], {
    homeDir: '/Users/example',
    portBase: 8931,
  });

  assert.deepEqual(Object.keys(config.mcpServers), ['playwright-edge-p1', 'playwright-edge-p2']);
  assert.ok(config.mcpServers['playwright-edge-p1']?.args.includes('--user-data-dir=/Users/example/.pw-mcp-edge-profile-p1'));
  assert.ok(config.mcpServers['playwright-edge-p2']?.args.includes('--user-data-dir=/Users/example/.pw-mcp-edge-profile-p2'));
  assert.ok(config.mcpServers['playwright-edge-p1']?.args.includes('--port=8931'));
  assert.ok(config.mcpServers['playwright-edge-p2']?.args.includes('--port=8932'));
});

test('Playwright Edge helpers project MCP config and SciForge provider availability', () => {
  assert.equal(playwrightEdgeMcpServerName({ instanceId: 'P1 Browser' }), 'playwright-edge-p1-browser');
  assert.equal(playwrightEdgeMcpUserDataDir({ homeDir: '/Users/example', instanceId: 'p1' }), '/Users/example/.pw-mcp-edge-profile-p1');
  assert.equal(playwrightEdgeMcpOutputDir({ homeDir: '/Users/example', instanceId: 'p1' }), '/Users/example/.pw-mcp-edge-output/p1');
  assert.equal(playwrightEdgeMcpHttpUrl(8931), 'http://localhost:8931/mcp');

  const servers = buildPlaywrightEdgeMcpServersConfig({
    homeDir: '/Users/example',
    userDataDir: '/Users/example/.pw-mcp-edge-profile',
    outputDir: '/Users/example/.pw-mcp-edge-output',
  });
  assert.deepEqual(Object.keys(servers.mcpServers), ['playwright-edge']);

  const availability = buildPlaywrightEdgeMcpProviderAvailability({ port: 8931 });
  assert.equal(availability.id, PLAYWRIGHT_EDGE_MCP_PROVIDER_ID);
  assert.equal(availability.capabilityId, PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID);
  assert.equal(availability.transport, 'mcp');
  assert.equal(availability.url, 'http://localhost:8931/mcp');
  assert.equal(availability.available, true);

  const routes = buildPlaywrightEdgeMcpToolProviderRoutes({ port: 8931 });
  assert.equal(routes.playwright_edge_browser.primaryProviderId, PLAYWRIGHT_EDGE_MCP_PROVIDER_ID);
  assert.equal(routes.playwright_edge_browser.capabilityId, PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID);
});

test('Codex TOML snippet matches the generated server arguments', () => {
  const snippet = buildPlaywrightEdgeMcpCodexTomlSnippet({
    homeDir: '/Users/example',
    serverName: 'playwright-edge',
  });

  assert.match(snippet, /^\[mcp_servers\.playwright-edge\]/);
  assert.match(snippet, /"--browser=msedge"/);
  assert.match(snippet, /"--user-data-dir=\/Users\/example\/\.pw-mcp-edge-profile"/);
  assert.doesNotMatch(snippet, /--headless/);
});
