# Scenario Template

> Copy this file when proposing a new BioAgent scenario. Fill the required fields first; optional fields can stay blank until the scenario is ready to become a ScenarioSpec or workspace task.

## Scenario Identity

- Name:
- Short ID:
- Domain: literature | structure | omics | knowledge | other
- Owner:
- Status: draft | test-fixture | ready-for-implementation

## User Goal

Describe the research job in one or two paragraphs. Focus on what the user wants to decide, compare, validate, or reproduce.

Example:
Run single-cell analysis on an uploaded h5ad or 10x matrix, compare treated and control cells within a selected cell type, and produce marker genes, differential genes, UMAP views, QC summaries, and reproducible method records.

## Scientific Scope

Supported tasks:
- 

Out of scope:
- 

Failure cases that must be reported honestly:
- 

## Input Contract

Required inputs:
- `dataRef`:
- `groupColumn`:
- `caseGroup`:
- `controlGroup`:

Optional inputs:
- `metadataRef`:
- `batchColumn`:
- `organism`:
- `method`:
- `alpha`:

Accepted data formats:
- 

Example prompt:
```text

```

Example workspace files:
```text
workspace/data/
```

## Data Sources

Primary source:
- local workspace file | public accession | API | database | uploaded file

Known example datasets:
- 

Access requirements:
- network required: yes | no
- API key required: yes | no
- license or usage notes:

## Runtime Expectations

Preferred implementation:
- workspace Python task | R task | AgentServer-generated task | existing seed skill | other

Required libraries or tools:
- 

Expected runtime limits:
- max input size:
- expected duration:
- memory notes:

Reproducibility requirements:
- record software versions
- record parameters
- record input file fingerprints
- write stdout/stderr logs

## Output Contract

Required artifacts:
- type:
  - required fields:
  - source refs:
  - download files:

Optional artifacts:
- 

Expected downloadable outputs:
- 

ExecutionUnit requirements:
- codeRef
- inputRef
- outputRef
- stdoutRef
- stderrRef
- method name
- runtime versions

## UI Presentation

Primary view:
- component:
- artifact type:

Secondary views:
- 

Suggested UIManifest:
```json
[
  {
    "component": "unknown-artifact-inspector",
    "artifactRef": "",
    "slot": "primary"
  }
]
```

Download or export behavior:
- 

## Success Criteria

A run is successful when:
- 

A run must fail or return repair-needed when:
- 

Minimum smoke test:
```text

```

## Example Result Shape

```json
{
  "message": "",
  "claims": [],
  "artifacts": [
    {
      "id": "",
      "type": "",
      "data": {}
    }
  ],
  "executionUnits": [],
  "uiManifest": []
}
```

## Notes

- 
