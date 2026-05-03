# Dynamic UI Plugin Sandbox

SciForge should prefer standard components, View Composition, and UnknownArtifactInspector before generating or loading any UI plugin.

Minimum rules before enabling a dynamic plugin:

- The UIManifest must first fail standard component rendering and generic inspector rendering for a concrete reason.
- The plugin must declare supported artifact schemas, required permissions, version, rollback id, and allowed outbound network domains.
- The plugin receives only the selected artifact payload and declared UI state, not the full workspace by default.
- The plugin runs in an isolated iframe or equivalent sandbox with no ambient file system access.
- Generated plugin code is written as a versioned artifact and can be disabled without deleting the source artifact.
- Exported bundles must include plugin version and permission metadata so reviewers can reproduce or reject the view.

Default Phase 1 behavior:

- Do not generate plugin code automatically.
- Render unsupported UIManifest slots with UnknownArtifactInspector.
- Preserve the original UIManifest and show an unsupported-state note so a developer can decide whether a standard component should be extended.

