# Computer Use Reference Smoke

This is the minimum desktop-level evidence step for every T060 run when a full backend regression is blocked.

1. Open SciForge in the in-app browser at `http://localhost:5173/`.
2. Navigate to a scenario workbench with a visible prior message, result card, table, or artifact preview.
3. Use Computer Use to capture the browser state and confirm the app window is focused.
4. Drag-select a visible phrase inside a message or result.
5. Right-click the selected text and choose `引用到对话栏`.
6. Confirm the composer contains `※1` and the reference chip appears.
7. Click the chip and capture a Computer Use screenshot showing the source text or block highlighted.
8. Enable `点选`, click a visible UI block, confirm `※2`, click that chip, and capture the block highlight.
9. Record the screenshot paths, approximate coordinates, marker ids, source labels, and any blockers in the deep run manifest.

Passing this smoke does not count as a completed longform backend regression by itself; it only records that the real UI reference mechanics are operable.
