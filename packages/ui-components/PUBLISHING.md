# SciForge UI Component Package Boundary

Run the boundary check before treating a UI component as independently publishable:

```sh
npm --workspace @sciforge-ui/components run packages:check
```

From the repository root, the broader package gate also runs the UI component boundary check after the existing skill/package catalog check:

```sh
npm run packages:check
```

The check verifies that each component package has the minimum package surface:

- `package.json`, `README.md`, and `manifest.ts`
- `README.md` with an `Agent quick contract` section
- `package.json` `files` coverage for README, manifest, fixtures, renderer, assets, and workbench demo assets when present
- `package.json` `exports` coverage for manifest, README, `fixtures/basic`, `fixtures/empty`, renderer, assets, and workbench demo assets when present
- `fixtures/basic` and `fixtures/empty` presence
- interactive components include a selection/open-ref fixture
- errors for app-private imports, sibling component relative imports, or any relative import that reaches outside the component package
- `@sciforge-ui/runtime-contract` declared as a package dependency or peer dependency so manifests, fixtures, and renderers do not depend on parent-directory source files
- whether `packages/ui-components/index.ts` exports the component manifest

Each child package must contain every resource it needs to operate after publishing. Shared runtime types should come from `@sciforge-ui/runtime-contract`; package code, fixtures, assets, and workbench demo files must not import or read from `packages/ui-components` parent files.

Published components are strict: missing package resources fail the command. Draft skeleton packages are included in the same scan, but incomplete publish resources are reported as warnings so the acceptance gate can stay usable while draft package bodies are being filled in.

The script is intentionally read-only for component implementation files. It reports missing resources so follow-up package work can add fixtures, renderers, assets, or root index exports without changing unrelated component logic.
