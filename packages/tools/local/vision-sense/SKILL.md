---
name: vision-sense
description: Vision Sense Plugin for turning text plus screenshot/image modalities into text-form Computer Use signals and auditable vision traces.
metadata:
  provider: local
  packageRoot: packages/senses/vision-sense
  toolType: sense-plugin
  modality: vision
  acceptedModalities: screenshot, image
  skillDomains: knowledge
  producesArtifactTypes: vision-trace
  requiredConfig: shared-llm-config, kv-ground-base-url, gui-executor
  tags: vision, modality:vision, gui, grounding, computer-use, kv-ground
---

# vision-sense

## Agent quick contract

- Kind: sense-plugin tool. Input is `text + modalities`; output is text.
- Boundary: skills construct a `SensePluginRequest` or `VisionTaskRequest`; the package can emit Computer Use text commands, but real desktop execution remains outside the package.
- Runtime: Python package at `packages/senses/vision-sense`, import root `sciforge_vision_sense`.
- Best for: low-risk linear GUI tasks where screenshots, visual target descriptions, KV-Ground coordinates, text-form executor actions, and pixel diff trace are enough.
- Avoid: high-risk actions, DOM/accessibility-tree workflows, cross-window automation, payment/delete/send/authorize operations, or tasks requiring semantic post-action proof beyond the next VLM completion check.

## Execution contract

```python
from sciforge_vision_sense import VisionTaskRequest, run_vision_task

request = VisionTaskRequest(
    task="Search for a paper title and stop on the results page",
    appWindowTarget={"app": "browser"},
    artifactOutputDir=".bioagent/vision-runs/run-001",
)

result = run_vision_task(request, vlm, observer, grounder, executor)
```

Text-only Computer Use signal:

```python
from sciforge_vision_sense import ComputerUseTextCommand, build_sense_plugin_request, sense_text_result_for_computer_use

request = build_sense_plugin_request(
    "Click the Upload button",
    modalities=[{"kind": "screenshot", "ref": "artifact:screen-001.png"}],
)
command = ComputerUseTextCommand(action="click", target={"x": 682, "y": 1101, "description": "Upload button"})
result = sense_text_result_for_computer_use(request, command)
```

`type_text` means clipboard paste. Executors should paste the full text once
instead of typing character by character.

## Human notes

The package is intentionally dependency-injected and fake-testable. It ships the
contract, manifest, prompt helpers, KV-Ground HTTP adapter, VLM helper, runner,
and verifier, but real desktop control remains outside the package boundary.
