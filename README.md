# SciForge

SciForge is a scenario-first AI4Science workbench for life-science research.

The product shape is no longer "one page per agent". A user enters a research scenario, or starts from a built-in Scenario preset, and works in one chat-driven workspace. The scenario contract decides:

- what the user is trying to do
- which skill domain and seed/workspace skills are available
- what input contract and artifact schemas are expected
- which registered UI components may render the results
- what the honest scope boundaries and failure states are

The UI renders structured runtime artifacts through a component registry. The LLM may choose components and View Composition parameters through JSON, but it does not generate arbitrary UI code.
Workspace-generated tasks and evolved skills also pass through the same UIManifest composition layer: task-requested components and user-edited Scenario settings can reorder or replace the default slots before React renders the component registry.

SciForge separates extension capability into two families:

- **Tools**: deterministic MCP tools, database connectors, workspace runners, and repair flows.
- **Skills**: capability contracts, markdown task knowledge, and user-approved evolved workspace skills. Seed skills in `skills/seed` describe capabilities and artifact contracts; runtime task code is generated in the active workspace and can later be promoted with user approval.

## Repository

- `src/ui/`: React + Vite Scenario workbench
- `src/runtime/`: workspace server, runtime gateway, task runner, skill registry, and shared runtime types
- `tests/smoke/`: end-to-end and contract smoke scripts
- `skills/seed/`: built-in capability contracts with `skill.json`
- `skills/installed/scp/`: installed SCP markdown skills copied from the SCP skill library
- `docs/`: product and architecture documentation
- `docs/templates/scenario.md`: template for proposing new scenario cases
- `workspace/`: default ignored runtime workspace; SciForge writes generated files to `workspace/.sciforge/`

## Product Model

The core chain is:

```text
scenario.md or built-in preset
  -> ScenarioSpec
  -> skill registry / AgentServer-generated workspace task / evolved skill repair
  -> Artifact + ExecutionUnit + claims + UIManifest
  -> registered scientific UI components
```

Built-in Scenario presets currently include:

- `literature-evidence-review`
- `structure-exploration`
- `omics-differential-exploration`
- `biomedical-knowledge-graph`

They live in `src/ui/src/scenarioSpecs.ts`. Each preset declares its `skillDomain`, input contract, output artifacts, scope declaration, default UIManifest slots, and component policy. These presets are not separate pages; they are contracts loaded into the same Scenario workbench.

## Scenario Builder And Library

SciForge can now compile composable Scenario Packages. In the workbench, Scenario Builder lets a user select skills, tools, artifact schemas, UI components, and failure policies, then preview:

- `ScenarioIR`
- `SkillPlan`
- `UIPlan`
- validation / quality reports

Draft and published packages are written under:

```text
<workspace>/.sciforge/scenarios/<scenario-id>/
```

The split package files are:

```text
scenario.json
skill-plan.json
ui-plan.json
validation-report.json
quality-report.json
tests.json
versions.json
package.json
```

Dashboard Scenario Library lists workspace packages and supports open, copy, and archive flows. Published runs keep `scenarioPackageRef`, `skillPlanRef`, `uiPlanRef`, runtime profile, and route decision so old results remain reproducible after a package changes.

An authoring reference lives at `docs/ScenarioPackageAuthoring.md`; a minimal fixture lives at `docs/examples/workspace-scenario/`.

## Run The UI

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

`npm run dev` starts both the Vite UI and the workspace runtime used by scenario chat. To run only the UI, use:

```bash
npm run dev:ui
```

If you started the UI separately and need workspace-backed runs or persisted chat records, also start:

```bash
npm run workspace:server
```

The selected workspace is configured in the Resource Explorer or Settings dialog. SciForge writes structured state under:

```text
<workspace>/.sciforge/
```

By default this repository now points at:

```text
./workspace/
```

## Runtime

The workbench first calls the SciForge workspace runtime:

```text
POST http://127.0.0.1:5174/api/sciforge/tools/run
```

Requests are scenario-first: the UI sends `scenarioId` plus the scenario's internal `skillDomain`. The runtime uses the skill domain to match seed capability contracts, workspace/evolved skills, and installed Markdown skills. Seed and Markdown skills do not point to fixed source task scripts; SciForge asks AgentServer to generate or repair workspace-local task code when execution is needed.

If no validated local skill can satisfy the request, the runtime can ask AgentServer to generate or repair workspace-local task code:

```text
POST http://127.0.0.1:18080/api/agent-server/runs
```

The UI also uses AgentServer directly as a fallback for structured chat responses:

```text
POST http://127.0.0.1:18080/api/agent-server/runs/stream
```

If neither workspace runtime nor AgentServer is available, SciForge records the user message and shows a clear connection error. It does not synthesize chart-driving demo artifacts.

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

For workspace-backed runs, SciForge normalizes returned `uiManifest` with the current task prompt and editable Scenario settings. This keeps generated and evolved skills stable while still allowing a prompt such as "only show data table + evidence matrix + execution unit" or "UMAP colorBy cellCycle splitBy batch" to produce a different formatted JSON manifest from the same artifact.

## Workspace Records

Chat state is stored in localStorage and mirrored to the workspace when the writer is available:

```text
workspace/.sciforge/workspace-state.json
workspace/.sciforge/sessions/*.json
workspace/.sciforge/artifacts/*.json
workspace/.sciforge/versions/*.json
workspace/.sciforge/config.json
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
