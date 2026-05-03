---
name: vision-gui-task
description: Template skill for converting low-risk GUI requests into SciForge VisionTaskRequest payloads and running the vision-sense tool.
metadata:
  provider: local
  visionTaskRequest: packages/senses/vision-sense/sciforge_vision_sense/types.py:VisionTaskRequest
  outputArtifactTypes: vision-trace
  requiredCapabilities: vision-sense
  tags: vision, gui, computer-use, template
---

# vision-gui-task

## Agent quick contract

- Use this skill only for low-risk GUI tasks that can be completed by looking at screenshots and executing `click`, `type_text`, `press_key`, or `scroll`.
- Build a `VisionTaskRequest` with the user task, target app/window hint, `maxSteps` defaulting to 30, low-risk policy, shared LLM config reference, KV-Ground config, screenshot policy, and artifact output directory.
- Inject runtime implementations for VLM, observer, grounder, and executor; then call the `vision-sense` tool package.
- Preserve only lightweight trace refs and summaries in follow-up context: screenshot refs, planned action, grounding summary, crosshair checks, execution status, pixel diff, and failure reason.
- Do not use DOM or accessibility tree data for the vision run.

## Request template

```python
from sciforge_vision_sense import VisionTaskRequest

request = VisionTaskRequest(
    task=user_prompt,
    appWindowTarget={"app": "browser"},
    maxSteps=30,
    riskPolicy={"allowHighRiskActions": False},
    modelConfigRef="shared-llm-config",
    grounderConfig={
        # Fill from workspace/runtime config or SCIFORGE_VISION_KV_GROUND_URL.
        "baseUrl": kv_ground_base_url,
        # Optional: service-readable shared storage prefixes for image_path.
        "remotePathPrefixes": kv_ground_remote_path_prefixes,
    },
    screenshotPolicy={
        "stabilityIntervalSeconds": 0.3,
        "stableChangeRatio": 0.01,
        "maxWaitSeconds": 8,
    },
    artifactOutputDir=".bioagent/vision-runs/current",
)
```

## Safety boundary

Fail closed for sending, deleting, paying, authorizing, external publishing, or
other irreversible actions unless a future upstream confirmation mechanism
explicitly authorizes that action class.
