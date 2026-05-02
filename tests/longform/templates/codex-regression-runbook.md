# Codex Longform Regression Runbook

Use this template for each T060 real run.

## Runtime

- Script: `tests/longform/scenarios/<scenario>.json`
- App URL: `http://localhost:5173/`
- Workspace path:
- Backend/model:
- Start time:
- End time:
- Operator:

## Required Codex Actions

- Open the app in the in-app browser at `http://localhost:5173/`.
- Complete every prompt in order.
- For text references, select the exact visible text, right-click, choose `引用到对话栏`, confirm a `※n` marker and chip appear, then click the chip to verify source highlight.
- For UI references, enable `点选`, click the intended UI block, confirm a `※n` marker and chip appear, then click the chip to verify block highlight.
- For object references, click the final object chip and confirm the right pane focuses or previews the object.
- Use Computer Use at least once for a desktop-level screenshot or coordinate operation of right-click selection/chip highlight.

## Per-Round Record

| Round | Prompt | Reference marker/source | Backend stream events | Artifact refs | Failure/repair | Browser evidence | Computer Use evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |

## Final Checks

- The final answer explains how each explicit reference changed the conclusion, plan, artifact, or next step.
- Generated reports/tables/scripts are clickable object references and preview safely where possible.
- Session export, workspace refs, screenshots, and logs are preserved under `docs/test-artifacts/deep-scenarios/<scenarioId>/`.
- The final `manifest.json` validates with `npm run verify:deep`.
