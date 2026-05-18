import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { GatewayRequest, ToolPayload } from '../runtime-types.js';
import { isRecord } from '../gateway-utils.js';
import { resolveWorkspaceFileRefPath } from '../workspace-paths.js';

export async function persistFinalGatewayPayloadIfManagedOutputRef(payload: ToolPayload, request: GatewayRequest) {
  const outputRef = firstExecutionUnitString(payload, 'outputRef');
  if (!outputRef || outputRef.includes('://')) return false;
  if (!isManagedTaskResultJsonRef(outputRef)) return false;
  if (!isSessionTaskResultJsonRef(outputRef)
    && payload.artifacts.filter(isRecord).some((artifact) => artifactRefsFromRecord(artifact).includes(outputRef))) return false;
  try {
    const outputPath = resolveWorkspaceFileRefPath(outputRef, request.workspacePath || process.cwd());
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  } catch {
    // Persistence repair is best-effort; the returned payload remains authoritative for this turn.
    return false;
  }
}

function isManagedTaskResultJsonRef(outputRef: string) {
  return isSessionTaskResultJsonRef(outputRef)
    || /(?:^|\/)task-results\/.+\.json$/i.test(outputRef);
}

function isSessionTaskResultJsonRef(outputRef: string) {
  return /\.sciforge\/sessions\/[^/]+\/task-results\/.+\.json$/i.test(outputRef);
}

function firstExecutionUnitString(payload: ToolPayload, key: string) {
  for (const unit of payload.executionUnits) {
    if (!isRecord(unit)) continue;
    const value = unit[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function artifactRefsFromRecord(record: Record<string, unknown>) {
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  return [
    record.dataRef,
    record.ref,
    record.path,
    record.rawRef,
    metadata.artifactRef,
    metadata.outputRef,
  ].filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0);
}
