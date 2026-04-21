import { runWorkspaceRuntimeGateway } from './workspace-runtime-gateway.js';
import type { ToolPayload } from './runtime-types.js';

export async function runBioAgentTool(body: Record<string, unknown>): Promise<ToolPayload> {
  return runWorkspaceRuntimeGateway(body);
}

