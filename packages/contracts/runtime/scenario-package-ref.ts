export type RuntimeScenarioPackageSource = 'built-in' | 'workspace' | 'generated';

export interface RuntimeScenarioPackageRef {
  id: string;
  version: string;
  source: RuntimeScenarioPackageSource;
}

export function normalizeRuntimeScenarioPackageRef(value: unknown): RuntimeScenarioPackageRef | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const version = typeof value.version === 'string' ? value.version.trim() : '';
  const source = normalizeRuntimeScenarioPackageSource(value.source);
  return id && version && source ? { id, version, source } : undefined;
}

export function normalizeRuntimeScenarioPackageSource(value: unknown): RuntimeScenarioPackageSource | undefined {
  return value === 'built-in' || value === 'workspace' || value === 'generated'
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
