export const PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID = 'playwright_edge_browser' as const;
export const PLAYWRIGHT_EDGE_MCP_PROVIDER_ID = 'sciforge.observe.playwright-edge-mcp' as const;
export const PLAYWRIGHT_EDGE_MCP_SERVER_NAME = 'playwright-edge' as const;
export const PLAYWRIGHT_EDGE_MCP_PACKAGE = '@playwright/mcp@latest' as const;
export const PLAYWRIGHT_EDGE_MCP_BROWSER = 'msedge' as const;
export const PLAYWRIGHT_EDGE_MCP_DEFAULT_VIEWPORT = '1440x900' as const;

export interface PlaywrightEdgeMcpPathOptions {
  homeDir?: string;
  instanceId?: string;
  userDataDir?: string;
  outputDir?: string;
}

export interface PlaywrightEdgeMcpServerOptions extends PlaywrightEdgeMcpPathOptions {
  serverName?: string;
  command?: string;
  viewportSize?: string;
  port?: number;
  sharedBrowserContext?: boolean;
  extraArgs?: string[];
}

export interface PlaywrightEdgeMcpServerConfig {
  command: string;
  args: string[];
}

export interface PlaywrightEdgeMcpServersConfig {
  mcpServers: Record<string, PlaywrightEdgeMcpServerConfig>;
}

export interface PlaywrightEdgeMcpProviderAvailabilityOptions extends PlaywrightEdgeMcpServerOptions {
  providerId?: string;
  capabilityId?: string;
  available?: boolean;
  status?: 'available' | 'ready' | 'offline' | 'provider-unavailable' | 'unauthorized' | 'rate-limited';
  reason?: string;
  url?: string;
}

export function playwrightEdgeMcpServerName(options: Pick<PlaywrightEdgeMcpServerOptions, 'serverName' | 'instanceId'> = {}) {
  if (options.serverName?.trim()) return options.serverName.trim();
  const instance = safeProfileSegment(options.instanceId);
  return instance ? `${PLAYWRIGHT_EDGE_MCP_SERVER_NAME}-${instance}` : PLAYWRIGHT_EDGE_MCP_SERVER_NAME;
}

export function playwrightEdgeMcpUserDataDir(options: PlaywrightEdgeMcpPathOptions = {}) {
  if (options.userDataDir?.trim()) return options.userDataDir.trim();
  const suffix = safeProfileSegment(options.instanceId);
  return joinPath(options.homeDir ?? defaultHomeDir(), suffix ? `.pw-mcp-edge-profile-${suffix}` : '.pw-mcp-edge-profile');
}

export function playwrightEdgeMcpOutputDir(options: PlaywrightEdgeMcpPathOptions = {}) {
  if (options.outputDir?.trim()) return options.outputDir.trim();
  const suffix = safeProfileSegment(options.instanceId);
  return suffix
    ? joinPath(options.homeDir ?? defaultHomeDir(), '.pw-mcp-edge-output', suffix)
    : joinPath(options.homeDir ?? defaultHomeDir(), '.pw-mcp-edge-output');
}

export function buildPlaywrightEdgeMcpServerConfig(options: PlaywrightEdgeMcpServerOptions = {}): PlaywrightEdgeMcpServerConfig {
  const args = [
    PLAYWRIGHT_EDGE_MCP_PACKAGE,
    `--browser=${PLAYWRIGHT_EDGE_MCP_BROWSER}`,
    `--user-data-dir=${playwrightEdgeMcpUserDataDir(options)}`,
    `--viewport-size=${options.viewportSize ?? PLAYWRIGHT_EDGE_MCP_DEFAULT_VIEWPORT}`,
    `--output-dir=${playwrightEdgeMcpOutputDir(options)}`,
  ];
  if (options.port !== undefined) args.push(`--port=${options.port}`);
  if (options.sharedBrowserContext === true) args.push('--shared-browser-context');
  args.push(...(options.extraArgs ?? []));
  return {
    command: options.command ?? 'npx',
    args,
  };
}

export function buildPlaywrightEdgeMcpServersConfig(options: PlaywrightEdgeMcpServerOptions = {}): PlaywrightEdgeMcpServersConfig {
  return {
    mcpServers: {
      [playwrightEdgeMcpServerName(options)]: buildPlaywrightEdgeMcpServerConfig(options),
    },
  };
}

export function buildParallelPlaywrightEdgeMcpServersConfig(
  instances: string[],
  options: Omit<PlaywrightEdgeMcpServerOptions, 'instanceId' | 'serverName' | 'port'> & { portBase?: number } = {},
): PlaywrightEdgeMcpServersConfig {
  const mcpServers: PlaywrightEdgeMcpServersConfig['mcpServers'] = {};
  instances.forEach((instanceId, index) => {
    const port = options.portBase === undefined ? undefined : options.portBase + index;
    const serverName = playwrightEdgeMcpServerName({ instanceId });
    mcpServers[serverName] = buildPlaywrightEdgeMcpServerConfig({ ...options, instanceId, serverName, port });
  });
  return { mcpServers };
}

export function playwrightEdgeMcpHttpUrl(port = 8931, host = 'localhost') {
  return `http://${host}:${port}/mcp`;
}

export function buildPlaywrightEdgeMcpProviderAvailability(options: PlaywrightEdgeMcpProviderAvailabilityOptions = {}) {
  const status = options.status ?? (options.available === false ? 'provider-unavailable' : 'available');
  const available = options.available ?? (status === 'available' || status === 'ready');
  return {
    id: options.providerId ?? PLAYWRIGHT_EDGE_MCP_PROVIDER_ID,
    providerId: options.providerId ?? PLAYWRIGHT_EDGE_MCP_PROVIDER_ID,
    capabilityId: options.capabilityId ?? PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID,
    source: 'mcp',
    transport: 'mcp',
    mcpServer: playwrightEdgeMcpServerName(options),
    url: options.url ?? (options.port === undefined ? undefined : playwrightEdgeMcpHttpUrl(options.port)),
    available,
    status,
    reason: options.reason ?? (available ? 'Playwright Edge MCP server is configured.' : 'Playwright Edge MCP server is not available.'),
  };
}

export function buildPlaywrightEdgeMcpToolProviderRoutes(options: PlaywrightEdgeMcpProviderAvailabilityOptions = {}) {
  const providerId = options.providerId ?? PLAYWRIGHT_EDGE_MCP_PROVIDER_ID;
  const status = options.status ?? (options.available === false ? 'provider-unavailable' : 'available');
  return {
    [PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID]: {
      enabled: true,
      capabilityId: PLAYWRIGHT_EDGE_MCP_CAPABILITY_ID,
      source: 'mcp',
      primaryProviderId: providerId,
      health: status,
      url: options.url ?? (options.port === undefined ? undefined : playwrightEdgeMcpHttpUrl(options.port)),
    },
  };
}

export function buildPlaywrightEdgeMcpCodexTomlSnippet(options: PlaywrightEdgeMcpServerOptions = {}) {
  const serverName = playwrightEdgeMcpServerName(options);
  const config = buildPlaywrightEdgeMcpServerConfig(options);
  return [
    `[mcp_servers.${serverName}]`,
    `command = ${JSON.stringify(config.command)}`,
    `args = ${JSON.stringify(config.args)}`,
  ].join('\n');
}

function safeProfileSegment(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ?? '';
}

function defaultHomeDir() {
  return typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '~';
}

function joinPath(...parts: string[]) {
  const [first = '', ...rest] = parts;
  return rest.reduce((acc, part) => `${acc.replace(/\/+$/, '')}/${part.replace(/^\/+/, '')}`, first);
}
