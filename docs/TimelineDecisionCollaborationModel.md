# Timeline, Decision, and Collaboration Model

Timeline events are structured research memory records, not prose logs.

Minimum timeline event:

```json
{
  "id": "event-1",
  "actor": "researcher",
  "action": "confirmed-decision",
  "subject": "claim-1",
  "artifactRefs": ["wetlab-result-1"],
  "executionUnitRefs": [],
  "beliefRefs": ["belief-graph-1", "decision-1"],
  "branchId": "hypothesis-main",
  "visibility": "project-record",
  "decisionStatus": "inconclusive",
  "createdAt": "ISO-8601"
}
```

Wet-lab evidence summary:

```json
{
  "qualityChecks": [{ "key": "replicates", "status": "warn", "detail": "n=2" }],
  "supports": [],
  "opposes": [],
  "uncertain": ["effect direction varies by replicate"],
  "limitations": ["repeat required"],
  "recommendedNextActions": ["repeat assay with n>=3"],
  "researcherDecisionRefs": ["decision-1"]
}
```

Researcher decisions:

- Status is one of `supported`, `not-supported`, `inconclusive`, `needs-repeat`.
- Revision status is one of `original`, `supersede`, `retract`, `amend`, `reaffirm`.
- New decisions never overwrite original evidence nodes.
- Revisions form a sequence through `supersedesRef` and belief graph `supersedes` edges.

Branch model:

- `variantKind=parameter` is a run attribute and should not create a branch by default.
- `variantKind=method` creates a method branch.
- `variantKind=hypothesis` creates a hypothesis branch and should point to an alignment contract or belief graph source.

Collaboration model:

- Visibility: `private-draft`, `team-visible`, `project-record`, `restricted-sensitive`.
- Export policy: `allowed`, `restricted`, `blocked`.
- Artifacts and timeline events carry visibility/audience/sensitive data fields before export.

