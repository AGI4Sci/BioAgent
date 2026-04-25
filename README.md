# BioAgent

BioAgent is a scenario-first AI4Science workbench for life-science research.

The product shape is no longer "one page per agent". A user enters a research scenario, or starts from a built-in Scenario preset, and works in one chat-driven workspace. The scenario contract decides:

- what the user is trying to do
- which skill domain and seed/workspace skills are available
- what input contract and artifact schemas are expected
- which registered UI components may render the results
- what the honest scope boundaries and failure states are

The UI renders structured runtime artifacts through a component registry. The LLM may choose components and View Composition parameters through JSON, but it does not generate arbitrary UI code.
Workspace seed skills also pass through the same UIManifest composition layer: task-requested components and user-edited Scenario settings can reorder or replace the default slots before React renders the component registry.

BioAgent separates extension capability into two families:

- **Tools**: deterministic MCP tools, database connectors, workspace runners, and repair flows.
- **Skills**: markdown or executable task knowledge. Executable seed skills live in `skills/seed`; installed SCP markdown skills live in `skills/installed/scp`, are indexed in the UI, and are discoverable by the runtime registry as `markdown-skill` entries.

## Repository

- `src/ui/`: React + Vite Scenario workbench
- `src/runtime/`: workspace server, runtime gateway, task runner, skill registry, and shared runtime types
- `src/runtime/python_tasks/`: Python-first scientific task templates
- `tests/smoke/`: end-to-end and contract smoke scripts
- `skills/seed/`: built-in validated executable skills with `skill.json`
- `skills/installed/scp/`: installed SCP markdown skills copied from the SCP skill library
- `docs/`: product and architecture documentation
- `docs/templates/scenario.md`: template for proposing new scenario cases
- `workspace/`: default ignored runtime workspace; BioAgent writes generated files to `workspace/.bioagent/`

## Product Model

The core chain is:

```text
scenario.md or built-in preset
  -> ScenarioSpec
  -> skill registry / workspace task / AgentServer repair
  -> Artifact + ExecutionUnit + claims + UIManifest
  -> registered scientific UI components
```

Built-in Scenario presets currently include:

- `literature-evidence-review`
- `structure-exploration`
- `omics-differential-exploration`
- `biomedical-knowledge-graph`

They live in `src/ui/src/scenarioSpecs.ts`. Each preset declares its `skillDomain`, input contract, output artifacts, scope declaration, default UIManifest slots, and component policy. These presets are not separate pages; they are contracts loaded into the same Scenario workbench.

## Run The UI

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

For workspace-backed runs and persisted chat records, also start:

```bash
npm run workspace:server
```

The selected workspace is configured in the Resource Explorer or Settings dialog. BioAgent writes structured state under:

```text
<workspace>/.bioagent/
```

By default this repository now points at:

```text
./workspace/
```

## Runtime

The workbench first calls the BioAgent workspace runtime:

```text
POST http://127.0.0.1:5174/api/bioagent/tools/run
```

Requests are scenario-first: the UI sends `scenarioId` plus the scenario's internal `skillDomain`. The runtime uses the skill domain only to match seed/workspace skills, installed Markdown skills, and run scientific task code. Installed SCP Markdown skills run through the live SCP adapter when `SCP_HUB_API_KEY` or `SCPhub_api_key` is present: the adapter parses each `SKILL.md`, discovers MCP servers/tools, can execute selected tools with prompt-provided inputs, and returns explicit blockers instead of fake artifacts.

If no validated local skill can satisfy the request, the runtime can ask AgentServer to generate or repair workspace-local task code:

```text
POST http://127.0.0.1:18080/api/agent-server/runs
```

The UI also uses AgentServer directly as a fallback for structured chat responses:

```text
POST http://127.0.0.1:18080/api/agent-server/runs/stream
```

If neither workspace runtime nor AgentServer is available, BioAgent records the user message and shows a clear connection error. It does not synthesize chart-driving demo artifacts.

## Structured Output Contract

Scenario responses can include natural language plus structured JSON:

```json
{
  "message": "...",
  "confidence": 0.86,
  "claimType": "inference",
  "evidenceLevel": "database",
  "claims": [],
  "artifacts": [],
  "executionUnits": [],
  "uiManifest": []
}
```

`uiManifest` may reference only registered components such as `molecule-viewer`, `paper-card-list`, `volcano-plot`, `heatmap-viewer`, `umap-viewer`, `network-graph`, `data-table`, `evidence-matrix`, `execution-unit-table`, `notebook-timeline`, or `unknown-artifact-inspector`.

Unknown components fall back to `UnknownArtifactInspector`; generated UI plugins remain disabled by default and must be sandboxed before use.

For workspace-backed runs, BioAgent normalizes returned `uiManifest` with the current task prompt and editable Scenario settings. This keeps high-frequency seed skills stable while still allowing a prompt such as "only show data table + evidence matrix + execution unit" or "UMAP colorBy cellCycle splitBy batch" to produce a different formatted JSON manifest from the same artifact.

## Workspace Records

Chat state is stored in localStorage and mirrored to the workspace when the writer is available:

```text
workspace/.bioagent/workspace-state.json
workspace/.bioagent/sessions/*.json
workspace/.bioagent/artifacts/*.json
workspace/.bioagent/versions/*.json
workspace/.bioagent/config.json
```

The state model stores sessions by Scenario, archived sessions, artifacts, ExecutionUnits, alignment contracts, timeline records, and collaboration/export policy fields.

## Verify

```bash
npm run verify
```

`npm run verify` runs typecheck, unit tests, smoke checks, and production build. During active development, use:

```bash
npm run typecheck
npm run test
npm run build
```
