# BioAgent

This repository currently contains:

- The integrated React web UI in `ui/`
- The workspace runtime gateway, task runner, seed skill registry, and smoke scripts in `scripts/`
- Python-first scientific task templates in `scripts/python_tasks/`
- Seed skills in `skills/seed/`
- Product/design documentation in `docs/`

The current UI merges the best parts of the two early prototypes:

- `bioagent-platform.jsx`: product structure, workbench layout, pipeline, notebook, and alignment workspace.
- `bioagent-glm.html`: polished dark BioAgent visual language, evidence/claim tags, agent cards, and scientific canvas visualization style.

## Run The UI

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

For workspace-backed chat records, also start the local writer:

```bash
npm run workspace:server
```

The workspace path is edited from the left Resource Explorer panel or the Settings dialog. BioAgent writes structured state under:

```text
<workspace>/.bioagent/
```

## Runtime Mode

The workbench first calls the BioAgent project workspace service for profile-specific tools:

```text
POST http://127.0.0.1:5174/api/bioagent/tools/run
```

If the project tool is unavailable or cannot satisfy the request, the chat panel falls back to AgentServer:

```text
POST http://127.0.0.1:18080/api/agent-server/runs
```

Start the workspace service for real BioAgent profile tools. Start AgentServer when you want the generic agent backend fallback. If both are unavailable, BioAgent keeps the user message locally and shows a clear connection error instead of silently falling back to mock output.

BioAgent keeps the frontend protocol in `ui/src/agentProfiles.ts`:

- per-agent AgentServer id and mode
- native tools and fallback tools
- input contracts
- expected artifact schemas
- default UIManifest slots
- execution defaults

Agent replies should return natural language plus optional structured JSON with `claims`, `uiManifest`, `executionUnits`, and `artifacts`. The UI never executes generated UI code; it renders only registered components.

The AgentServer fallback prefers streaming via:

```text
POST http://127.0.0.1:18080/api/agent-server/runs/stream
```

Streaming envelopes are rendered in the event panel while the run is active. The composer stays editable during a run; extra user guidance is queued visibly and automatically sent as follow-up turns after the active run completes. This keeps the UI responsive today and leaves room for true backend mid-run message injection later.

## Chat Records

Chat state is stored as `bioagent.workspace.v2` in localStorage and can also be mirrored into the selected workspace directory. The active workspace state includes:

- active sessions per Agent
- archived sessions created by new-chat and delete-chat actions
- per-session version snapshots with reason, timestamp, counts, checksum, and snapshot payload
- artifacts and execution records generated from Agent responses

The workspace writer splits those records into:

```text
.bioagent/workspace-state.json
.bioagent/sessions/*.json
.bioagent/artifacts/*.json
.bioagent/versions/*.json
.bioagent/config.json
```

This keeps BioAgent aligned with AgentServer-style session and artifact bookkeeping while MCP and skills resources remain user-configured later.

The left Resource Explorer can list the selected workspace and supports file/folder creation, rename, delete, refresh, copy path, and double-click folder navigation through the local workspace writer.

## Runtime Settings

Use the top-right Settings button to configure:

- AgentServer base URL
- workspace writer URL
- workspace path
- model provider
- model base URL
- model name
- API key
- request timeout

Those values are kept in localStorage and mirrored to `<workspace>/.bioagent/config.json`. BioAgent passes model provider/name/base URL/API key to AgentServer per request through `runtime`, so AgentServer can switch model connection without hard-coded frontend constants.

## Runtime Boundary

Example seed data lives in `ui/src/demoData.ts` for first-screen sessions and the global timeline. Dynamic result panels prioritize runtime artifacts from the workspace gateway and show empty or failed states when no real artifact is available.

Current real-mode boundary:

- Literature, structure, omics, and knowledge profiles are marked `agent-server`.
- BioAgent project tools run from `npm run workspace:server`; `scripts/bioagent-tools.ts` is a compatibility shim over `scripts/workspace-runtime-gateway.ts`.
- The gateway loads seed/workspace/installed skills, runs workspace-local task code, writes task inputs/results/logs/attempts under `<workspace>/.bioagent/`, and bridges task generation plus repair to AgentServer when configured.
- Literature uses PubMed E-utilities; structure uses RCSB core entry and AlphaFold DB APIs; knowledge uses UniProt and ChEMBL; unsupported disease/clinical-trial connectors return explicit `failed-with-reason` units.
- Omics reads workspace CSV matrix/metadata and can use Scanpy, DESeq2, edgeR, or the bounded Python CSV runner while recording requested/effective runner metadata.
- AgentServer can be running at `http://127.0.0.1:18080` for generic fallback responses.
- The old local record-only adapter path has been removed. If workspace runtime and AgentServer are unavailable, the UI shows a clear error instead of generating chart-driving draft artifacts.

## Verify

```bash
npm run verify
```

`npm run verify` runs typecheck, unit tests, all smoke checks, and the production build. The smoke suite includes fixture normalization, skill registry availability, real seed runtime tasks, unsupported connector semantics, repair-needed behavior, AgentServer task generation, AgentServer repair/rerun, workspace-server HTTP repair, view composition, omics runner selection, and UI unit coverage for execution bundle export policy.

## Kept Source

```text
docs/
scripts/
skills/
ui/
package.json
tsconfig.json
vite.config.ts
PROJECT.md
README.md
```
