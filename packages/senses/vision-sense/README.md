# SciForge Vision Sense

Python package for the Vision Sense Tool MVP. It defines the shared
vision-sense manifest, dataclass payloads, and dependency-injected building
blocks for observe/plan/ground/execute/verify loops without depending on
SciForge app-private Python modules.

## Agent quick contract

Use this package when an agent or skill needs a pure-vision GUI task contract or
a Sense Plugin that accepts `text + modalities` and returns `text`. The text
output can be a Computer Use command signal such as JSON/NDJSON/plain text
`click`, `type_text`, `press_key`, or `scroll`; coordinates, operation signals,
and control-code snippets are all text payloads. The package stays
executor-agnostic: it can emit text commands for a Computer Use provider, but it
does not own a desktop, browser, MCP server, DOM, or accessibility channel.

The root package exports the public contract plus lower-level observer,
planner, KV-Ground, executor, verifier, VLM helper, Computer Use text-signal
adapter, and runner APIs from `sciforge_vision_sense/__init__.py`.

Default manifest:

- `modality`: `vision`
- default VLM: `qwen3.6-plus`
- KV-Ground base URL: pass `grounderConfig.baseUrl` / `KvGroundClient(base_url=...)`
  or set `SCIFORGE_VISION_KV_GROUND_URL`
- actions in scope: `click`, `type_text`, `press_key`, `scroll`

Minimal request:

```python
from sciforge_vision_sense import DEFAULT_MANIFEST, VisionTaskRequest

request = VisionTaskRequest(
    task="Search for a paper title and stop on the results page",
    appWindowTarget={"app": "browser"},
    artifactOutputDir=".bioagent/vision-runs/run-001",
)
```

Sense Plugin request and text result:

```python
from sciforge_vision_sense import (
    ComputerUseTextCommand,
    build_sense_plugin_request,
    sense_text_result_for_computer_use,
)

request = build_sense_plugin_request(
    "Click the Upload button",
    modalities=[{"kind": "screenshot", "ref": "artifact:screen-001.png"}],
)
command = ComputerUseTextCommand(
    action="click",
    target={"x": 682, "y": 1101, "description": "Upload button"},
    sourceModalityRefs=["artifact:screen-001.png"],
)
text_result = sense_text_result_for_computer_use(request, command)
assert text_result.format == "application/json"
```

Minimal result shape:

```python
from sciforge_vision_sense import VisionTaskResult

result = VisionTaskResult(
    status="failed",
    reason="grounding_failed",
    failureDiagnostics={"lastGrounderStatus": "failed"},
)
```

Failure handling should preserve lightweight refs and summaries: screenshot
refs, planner action, KV-Ground request/response summary, execution status,
pixel diff, and `failureReason`. Do not put screenshot base64 blobs into
long-term agent context.

Mockable runner entry:

```python
from sciforge_vision_sense import run_vision_task

result = run_vision_task(request, vlm, observer, grounder, executor)
```

For AgentServer or multi-turn handoff, compact the result before adding it to
context:

```python
from sciforge_vision_sense import compact_vision_result_for_handoff

handoff = compact_vision_result_for_handoff(result)
```

## Human notes

This package is the Python-side MVP for T082. It includes:

- Manifest and dataclass contracts.
- Planner JSON extraction/validation with coordinate-field rejection.
- VLM request helpers and an OpenAI-compatible chat-completions client.
- KV-Ground `/health` and `/predict/` adapter.
- Service-readable KV-Ground path detection. Shared storage prefixes are
  deployment-specific and must be passed through
  `KvGroundClient(remote_path_prefixes=(...))`,
  `grounderConfig.remotePathPrefixes`, or the comma-separated
  `SCIFORGE_VISION_KV_GROUND_REMOTE_PATH_PREFIXES` environment variable. Local
  `.sciforge/...png` screenshots still require an explicit uploader, shared
  mount, or `allow_service_local_paths=True` when the service really can read
  the same filesystem path.
- Screenshot stability and byte-level pixel diff verification.
- A deterministic dependency-injected runner for unit/integration tests.
- A Sense Plugin text envelope for `text + modalities -> text` integration.
- A Computer Use text-signal adapter that serializes GUI actions as JSON,
  NDJSON, or `text/x-computer-use-command`.
- Optional crosshair verification hook with one revised-target grounding retry.
- Handoff compaction that keeps screenshot refs and trace summaries without
  screenshot bytes or base64 blobs.
- Executor protocols only; real mouse/keyboard backends stay outside this
  package boundary.

The manifest says the VLM should reuse the existing shared LLM configuration for
base URL, API key, headers, timeout, and retry. The package does not introduce a
new secret store and does not hardcode credentials.

The package is listed in the root tool discovery catalog as
`local.vision-sense`. The companion template skill is
`local.vision-gui-task`.

## MVP limits

- Pure vision only: no DOM reads and no accessibility tree reads.
- Planner actions describe visual targets in natural language; the VLM must not
  output coordinates.
- KV-Ground is expected to map `image_path` and `text_prompt` to pixel
  coordinates in the original screenshot size.
- Crosshair retry is orchestrated as a dependency-injected VLM verification
  hook. The MVP records the retry decision and revised target description; real
  crosshair image overlay generation remains an adapter responsibility.
- Pixel diff verification only detects visual change; semantic success is left
  to the next completion check.
- Drag, double click, right click, hotkeys, and cross-window automation are out
  of scope for this package version.

## Safety boundary

The default policy is low-risk GUI actions only. Sending, deleting, paying,
authorizing, or externally publishing must fail closed unless a future upstream
integration passes an explicit approval policy.

## Test command

Run from the repository root:

```bash
python -m unittest discover -s packages/senses/vision-sense/tests
python -m pytest packages/senses/vision-sense/tests
```

Example live KV-Ground call with deployment-specific config:

```python
import os

from sciforge_vision_sense import KvGroundClient

client = KvGroundClient(
    base_url=os.environ["SCIFORGE_VISION_KV_GROUND_URL"],
    remote_path_prefixes=("/your/shared/kv-ground/path/",),
)
result = client.predict(
    "/your/shared/kv-ground/path/restart_check.png",
    "Click the Submit button",
)
```
