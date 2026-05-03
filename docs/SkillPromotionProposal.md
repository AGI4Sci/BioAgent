# Skill Promotion Proposal

SciForge promotes a repeated successful workspace task into an installed skill only after a user review step. A proposal is a draft record, not an executable skill.

Required shape:

```json
{
  "id": "proposal.<skill-id>.<timestamp>",
  "status": "needs-user-confirmation",
  "createdAt": "ISO-8601",
  "source": {
    "workspacePath": "/absolute/workspace",
    "taskCodeRef": ".sciforge/tasks/example.py",
    "inputRef": ".sciforge/task-inputs/example.json",
    "outputRef": ".sciforge/task-results/example.json",
    "stdoutRef": ".sciforge/logs/example.stdout.log",
    "stderrRef": ".sciforge/logs/example.stderr.log",
    "successfulExecutionUnitRefs": ["EU-..."]
  },
  "proposedManifest": {
    "id": "domain.task_name",
    "kind": "workspace",
    "description": "What reusable task this skill performs.",
    "skillDomains": ["structure"],
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
