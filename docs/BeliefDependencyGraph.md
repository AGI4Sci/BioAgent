# Belief Dependency Graph

SciForge separates evidence from conclusions. A claim can depend on papers, runtime artifacts, assumptions, decisions, and opposing evidence.

Node kinds:

- `claim`: a statement made by an agent or researcher.
- `evidence`: paper, database record, wet-lab result summary, or external source.
- `artifact`: runtime artifact, file, notebook, or ExecutionUnit output.
- `assumption`: explicit premise that may later be revised.
- `decision`: researcher or authorized-role confirmation.

Edge kinds:

- `supports`: source increases confidence in target.
- `opposes`: source decreases confidence in target or raises a contradiction.
- `depends-on`: target should be revisited if source changes.
- `derived-from`: target was computed or summarized from source.
- `supersedes`: revision event replaces an earlier decision or claim without deleting it.

Update workflow:

1. Attach new evidence as a node.
2. Traverse only outgoing dependency edges from the changed evidence.
3. Update impacted claims with `dependencyRefs` and `updateReason`.
4. Leave unrelated claims unchanged and record why they were not updated.
5. Require a researcher decision node before upgrading wet-lab evidence into “supported” or “not-supported”.

Phase 1 implementation:

- `EvidenceClaim` supports `dependencyRefs` and `updateReason`.
- Workspace state can carry optional `beliefGraphs`.
- EvidenceMatrix displays dependency refs and update reasons.

