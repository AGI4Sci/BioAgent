# Skill Promotion Proposal

BioAgent promotes a repeated successful workspace task into an installed skill only after a user review step. A proposal is a draft record, not an executable skill.

Required shape:

```json
{
  "id": "proposal.<skill-id>.<timestamp>",
  "status": "needs-user-confirmation",
  "createdAt": "ISO-8601",
  "source": {
    "workspacePath": "/absolute/workspace",
    "taskCodeRef": ".bioagent/tasks/example.py",
    "inputRef": ".bioagent/task-inputs/example.json",
    "outputRef": ".bioagent/task-results/example.json",
    "stdoutRef": ".bioagent/logs/example.stdout.log",
    "stderrRef": ".bioagent/logs/example.stderr.log",
    "successfulExecutionUnitRefs": ["EU-..."]
  },
  "proposedManifest": {
    "id": "domain.task_name",
    "kind": "workspace",
    "description": "What reusable task this skill performs.",
    "profiles": ["structure"],
    "inputContract": {},
    "outputArtifactSchema": {},
    "entrypoint": { "type": "workspace-task", "command": "python", "path": "tasks/example.py" },
    "environment": {},
    "validationSmoke": {},
    "examplePrompts": [],
    "promotionHistory": []
  },
  "generalizationNotes": [
    "Which user-specific paths, ids, or thresholds were parameterized."
  ],
  "validationPlan": {
    "smokePrompts": [],
    "expectedArtifactTypes": [],
    "requiredEnvironment": {}
  },
  "reviewChecklist": {
    "noHardCodedUserData": false,
    "reproducibleEntrypoint": false,
    "artifactSchemaValidated": false,
    "failureModeIsExplicit": false,
    "userConfirmedPromotion": false
  }
}
```

Promotion rules:

- The proposal must point to the exact task code, input, output, logs, and successful ExecutionUnit that motivated promotion.
- The proposed skill stays unavailable until validation smoke passes and `userConfirmedPromotion` is true.
- User-specific data paths, identifiers, credentials, and one-off thresholds must be parameterized or removed before acceptance.
- Failed tasks can generate repair notes, but cannot be promoted until a later successful run exists.

