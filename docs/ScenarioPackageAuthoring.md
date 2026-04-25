# Scenario Package Authoring

BioAgent scenarios are now compiled services, not one-off chat templates. A published scenario package is the stable contract used by the workbench, runtime router, UI renderer, validation gate, and export bundle.

## Package Layout

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

`package.json` is the full bundled representation. The split files are kept so humans and tools can inspect and review individual contracts.

## Authoring Flow

1. Describe the research service goal in Scenario Builder.
2. Select composable elements: skills, tools, artifact schemas, UI components, and failure policies.
3. Compile the selection into `ScenarioIR`, `SkillPlan`, and `UIPlan`.
4. Run validation and dry-run smoke.
5. Publish only when the quality report has no blocking items.

Dynamic recommendation is allowed before publish. Published runtime is stable: every run records `scenarioPackageRef`, `skillPlanRef`, `uiPlanRef`, `runtimeProfileId`, and route decision.

## Element Rules

- Every output artifact must have at least one selected producer skill.
- Every artifact must have a UI consumer or fallback inspector.
- Unknown tools are warnings; unknown skills, artifact schemas, UI components, or failure policies are blocking.
- Failure states must stay explicit and recoverable. Do not replace real failures with demo success data.

## Versioning

Changing input contracts, output artifacts, selected skills, UI components, or failure policies should produce a new package version. Existing runs remain tied to their original package version.

## Quality Gate

The quality gate combines:

- static validation report
- runtime smoke result
- export policy decision
- version diff against the previous package

Blocking items prevent publish. Warnings allow publish but must remain visible in the report.
