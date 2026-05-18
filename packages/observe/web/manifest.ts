import browserFetchManifest from './capabilities/browser_fetch.manifest.json';
import browserSearchManifest from './capabilities/browser_search.manifest.json';
import playwrightEdgeBrowserManifest from './capabilities/playwright_edge_browser.manifest.json';
import webFetchManifest from './capabilities/web_fetch.manifest.json';
import webSearchManifest from './capabilities/web_search.manifest.json';

export {
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
  PLAYWRIGHT_EDGE_MCP_BROWSER,
  PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID,
  PLAYWRIGHT_EDGE_MCP_DEFAULT_VIEWPORT,
  PLAYWRIGHT_EDGE_MCP_PACKAGE,
  PLAYWRIGHT_EDGE_MCP_PROVIDER_ID,
  PLAYWRIGHT_EDGE_MCP_SERVER_NAME,
  type PlaywrightEdgeMcpPathOptions,
  type PlaywrightEdgeMcpProviderAvailabilityOptions,
  type PlaywrightEdgeMcpServerConfig,
  type PlaywrightEdgeMcpServerOptions,
  type PlaywrightEdgeMcpServersConfig,
} from './mcp/playwright-edge';
export {
  createPlaywrightEdgeBrowserAutomationProvider,
  invokePlaywrightEdgeBrowser,
  type PlaywrightEdgeBrowserAutomationProvider,
  type PlaywrightEdgeBrowserAutomationProviderOptions,
  type PlaywrightEdgeBrowserInvocationInput,
  type PlaywrightEdgeBrowserInvocationOutput,
} from './mcp/playwright-edge-provider';

export const webObserveCapabilityManifests = [
  webSearchManifest,
  webFetchManifest,
  browserSearchManifest,
  browserFetchManifest,
  playwrightEdgeBrowserManifest,
];

export function webObserveCapabilityManifest(id: string) {
  return webObserveCapabilityManifests.find((manifest) => manifest.id === id);
}
