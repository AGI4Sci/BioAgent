# BioAgent

This repository has been reset to keep only:

- The integrated React web UI in `ui/`
- Product/design documentation in `docs/`
- Lightweight frontend project config

The current UI merges the best parts of the two early prototypes:

- `bioagent-platform.jsx`: product structure, workbench layout, pipeline, notebook, and alignment workspace.
- `bioagent-glm.html`: polished dark BioAgent visual language, evidence/claim tags, agent cards, and scientific canvas visualization style.

## Run The UI

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

## Build

```bash
npm run typecheck
npm run build
```

## Kept Source

```text
docs/
ui/
package.json
tsconfig.json
vite.config.ts
PROJECT.md
README.md
```
