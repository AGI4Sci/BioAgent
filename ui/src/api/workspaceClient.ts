import type { BioAgentWorkspaceState } from '../domain';

const WORKSPACE_API = 'http://127.0.0.1:5174';

export async function persistWorkspaceState(state: BioAgentWorkspaceState): Promise<void> {
  if (!state.workspacePath.trim()) return;
  const response = await fetch(`${WORKSPACE_API}/api/bioagent/workspace/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspacePath: state.workspacePath,
      state,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Workspace writer failed: HTTP ${response.status}`);
  }
}
