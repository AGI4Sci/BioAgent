# Dependency Risk Register

## 3Dmol Direct Eval

- Source: `node_modules/3dmol/build/3Dmol.js`
- Build signal: Vite/Rolldown reports direct `eval` usage during production build.
- Current impact: warning only; build succeeds. Risk is limited to the molecule viewer dependency path.
- Near-term mitigation: lazy-load or isolate the molecule viewer so 3Dmol is not part of non-structure scenario first paint.
- Release policy: keep as a documented exception until lazy-loading or replacement is implemented.

## Large Client Chunk

- Source: combined React app, charting, visualization, Scenario Builder, and molecule viewer dependencies.
- Build signal: main JS chunk exceeds 500KB after minification.
- Current impact: slower first load and noisy production build output.
- Near-term mitigation: split heavy visualization components and scenario compiler views behind dynamic imports.
- Release policy: establish a chunk budget after T046 analysis; warnings remain tracked until budget is enforced.

## Alternative Viewer Options

- Keep 3Dmol with lazy boundary: lowest migration risk, warning remains documented.
- Mol* integration: stronger structural biology viewer, higher integration cost.
- iframe/sandbox viewer: stronger isolation, more communication plumbing.
