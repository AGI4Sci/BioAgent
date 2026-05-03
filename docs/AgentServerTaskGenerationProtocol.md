# AgentServer Task Generation Protocol

SciForge calls AgentServer only as a generic task-generation or repair brain. The request must not require AgentServer to know SciForge-specific hard-coded tools.

Generation request:

```json
{
  "prompt": "User request",
  "skillDomain": "structure",
  "workspaceTreeSummary": [{ "path": "data/input.csv", "kind": "file", "sizeBytes": 1234 }],
  "availableSkills": [{ "id": "structure.rcsb_latest_or_entry", "kind": "seed", "available": true, "reason": "Manifest validation passed" }],
  "artifactSchema": {},
  "uiManifestContract": {},
  "uiStateSummary": {},
  "priorAttempts": []
}
```

Generation response:

```json
{
  "taskFiles": [{ "path": ".sciforge/tasks/generated.py", "content": "print('ok')", "language": "python" }],
  "entrypoint": { "language": "python", "path": ".sciforge/tasks/generated.py" },
  "environmentRequirements": {},
  "validationCommand": "python .sciforge/tasks/generated.py ...",
  "expectedArtifacts": ["structure-summary"],
  "patchSummary": "Created a new workspace task."
}
```

Repair request:

```json
{
  "prompt": "User request",
  "skillDomain": "structure",
  "codeRef": ".sciforge/tasks/structure.py",
  "inputRef": ".sciforge/task-inputs/structure.json",
  "outputRef": ".sciforge/task-results/structure.json",
  "stdoutRef": ".sciforge/logs/structure.stdout.log",
  "stderrRef": ".sciforge/logs/structure.stderr.log",
  "schemaErrors": ["missing artifacts"],
  "userFeedback": "The result is not the requested protein.",
  "uiStateSummary": {},
  "priorAttempts": []
}
```

Repair response extends generation response with:

```json
{
  "parentAttempt": 1,
  "selfHealReason": "Schema validation failed.",
  "diffSummary": "Added missing artifact metadata and dataRef."
}
```

Attempt history:

- Every run or repair attempt writes a `TaskAttemptRecord` under `.sciforge/task-attempts/`.
- A repair attempt must preserve `parentAttempt`, `selfHealReason`, `patchSummary`, and optional `diffRef`.
- If AgentServer cannot generate or repair the task, SciForge returns `repair-needed` or `failed` with code/log refs and a concrete missing condition.
