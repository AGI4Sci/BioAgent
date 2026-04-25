# Build Performance Notes

## Current Chunk Sources

The main production build is dominated by:

- React application shell and workbench state
- Recharts and D3 charting
- 3Dmol molecule viewer
- Scenario Builder and compiler modules

## Splitting Policy

Vite is configured with manual chunks for:

- `vendor-react`
- `vendor-charts`
- `vendor-3dmol`
- `scenario-compiler`

The current chunk warning limit is set to 900KB while follow-up work moves heavy viewers behind dynamic imports. This is a temporary budget, not a final target. The desired long-term target is a sub-500KB first-load application chunk with scientific visualizations loaded only when needed.

## Build Smoke

`npm run smoke:build-budget` checks the emitted `dist-ui/assets` files after `npm run build` and fails if any single JavaScript chunk is above the current budget.
