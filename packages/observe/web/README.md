# SciForge Web Observe

This package owns the read-only web observe capability contracts.

It answers what SciForge can ask from web providers:

- `web_search`: search public web or configured search indexes and return ranked result refs with provider diagnostics.
- `web_fetch`: fetch a public URL or search result URL through a configured network provider and return durable content refs.
- `browser_search` / `browser_fetch`: use a real browser provider when rendered JavaScript pages or browser-only entry points are required.
- `playwright_edge_browser`: use the official Playwright MCP server with visible Microsoft Edge, a dedicated persistent profile, and structured browser actions for search, clicking, scrolling, forms, downloads, and login handoff.

It does not own where the work runs. The default standalone implementation lives in `packages/workers/web-worker` and advertises provider routes such as `sciforge.web-worker.web_search` and `sciforge.web-worker.web_fetch`.

The Edge MCP wrapper in `mcp/playwright-edge.ts` owns configuration shape. It can generate Codex/Cursor/Claude-style MCP JSON, per-process profile directories for parallel workers, and SciForge provider availability rows without binding runtime gateway code to a specific MCP client. `mcp/playwright-edge-provider.ts` is the thin provider adapter that connects to an already-running Playwright MCP HTTP endpoint and returns SciForge provider output.

Example:

```ts
import { buildPlaywrightEdgeMcpServersConfig } from '@sciforge-observe/web/mcp/playwright-edge';

const config = buildPlaywrightEdgeMcpServersConfig({
  userDataDir: '/Users/zhangyanggao/.pw-mcp-edge-profile',
  outputDir: '/Users/zhangyanggao/.pw-mcp-edge-output',
});
```

## Boundary

- Capability contract lives here: ids, schemas, validators, side effects, repair hints, and examples.
- Worker/provider implementation lives in a worker package or an AgentServer-discovered provider.
- Runtime provider selection, route recording, preflight, validation, and repair orchestration stay in `src/runtime`.
- Independent MCP server processes must use independent `--user-data-dir` values; use `buildParallelPlaywrightEdgeMcpServersConfig()` for P1/P2/P3 style isolation.
