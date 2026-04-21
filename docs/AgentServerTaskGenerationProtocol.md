# AgentServer Task Generation Protocol

BioAgent calls AgentServer only as a generic task-generation or repair brain. The request must not require AgentServer to know BioAgent-specific hard-coded tools.

Generation request:

```json
{
  "prompt": "User request",
  "profile": "structure",
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
  "taskFiles": [{ "path": ".bioagent/tasks/generated.py", "content": "print('ok')", "language": "python" }],
  "entrypoint": { "language": "python", "path": ".bioagent/tasks/generated.py" },
  "environmentRequirements": {},
  "validationCommand": "python .bioagent/tasks/generated.py ...",
  "expectedArtifacts": ["structure-summary"],
  "patchSummary": "Created a new workspace task."
}
```

Repair request:

```json
{
  "prompt": "User request",
  "profile": "structure",
  "codeRef": ".bioagent/tasks/structure.py",
  "inputRef": ".bioagent/task-inputs/structure.json",
  "outputRef": ".bioagent/task-results/structure.json",
  "stdoutRef": ".bioagent/logs/structure.stdout.log",
  "stderrRef": ".bioagent/logs/structure.stderr.log",
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

- Every run or repair attempt writes a `TaskAttemptRecord` under `.bioagent/task-attempts/`.
- A repair attempt must preserve `parentAttempt`, `selfHealReason`, `patchSummary`, and optional `diffRef`.
- If AgentServer cannot generate or repair the task, BioAgent returns `repair-needed` or `failed` with code/log refs and a concrete missing condition.
