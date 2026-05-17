import { createHash } from 'node:crypto';
import {
  CAPABILITY_DISCOVERY_CONTRACT_ID,
  tinyCapabilityDiscoveryBrief,
  type CapabilityDiscoveryAvailability,
  type CapabilityDiscoveryTinyBrief,
  type CapabilityExpandQuery,
  type CapabilityExpansionResult,
  type CapabilityExplainQuery,
  type CapabilityExplainResult,
  type CapabilityPlanQuery,
  type CapabilityPlanResult,
  type CapabilitySearchCandidate,
  type CapabilitySearchQuery,
  type CapabilitySearchResult,
} from '../../packages/contracts/runtime/capability-discovery.js';
import type {
  CapabilityManifest,
  CapabilityProviderManifest,
} from '../../packages/contracts/runtime/capability-manifest.js';
import {
  CapabilityManifestRegistry as BrokerRegistry,
  brokerCapabilities,
  type CapabilityBrokerToolBudget,
} from './capability-broker.js';
import {
  loadCoreCapabilityManifestRegistry,
  type LoadedCapabilityManifestRegistry,
} from './capability-manifest-registry.js';

export interface CapabilityDiscoveryOptions {
  registry?: LoadedCapabilityManifestRegistry;
  availableProviderIds?: string[];
  unavailableProviderReasons?: Record<string, string>;
  auditSeed?: string;
}

export function capabilityDiscoveryTinyBrief(): CapabilityDiscoveryTinyBrief {
  return tinyCapabilityDiscoveryBrief();
}

export class CapabilityDiscoveryService {
  private readonly registry: LoadedCapabilityManifestRegistry;
  private readonly availableProviderIds: Set<string>;
  private readonly unavailableProviderReasons: Record<string, string>;
  private readonly auditSeed: string;

  constructor(options: CapabilityDiscoveryOptions = {}) {
    this.registry = options.registry ?? loadCoreCapabilityManifestRegistry();
    this.availableProviderIds = new Set(options.availableProviderIds ?? []);
    this.unavailableProviderReasons = options.unavailableProviderReasons ?? {};
    this.auditSeed = options.auditSeed ?? 'default';
  }

  search(query: CapabilitySearchQuery): CapabilitySearchResult {
    const maxCandidates = clamp(query.constraints?.maxCandidates ?? 6, 1, 12);
    const brokerRegistry = new BrokerRegistry(this.registry.manifests);
    const brokered = brokerCapabilities({
      prompt: query.goal,
      objectRefs: refsToObjects([...(query.currentContextRefs ?? []), ...(query.selectedRefs ?? [])]),
      artifactIndex: query.desiredArtifacts?.map((artifactType) => ({ artifactType, tags: tokenList(artifactType) })),
      runtimePolicy: {
        topK: maxCandidates,
        allowSideEffects: query.constraints?.allowedSideEffects as CapabilityManifest['sideEffects'] | undefined,
      },
      toolBudget: toolBudgetForSearch(query),
      availableProviders: this.availableProviderIds.size
        ? [...this.availableProviderIds].map((id) => ({ id, available: true }))
        : undefined,
    }, brokerRegistry);
    const candidates = brokered.briefs.slice(0, maxCandidates).map((brief): CapabilitySearchCandidate => {
      const manifest = this.registry.getManifest(brief.id);
      const availability = availabilityForManifest(manifest, this.availableProviderIds, this.unavailableProviderReasons);
      return {
        capabilityId: brief.id,
        title: brief.name,
        brief: brief.brief,
        kind: brief.kind,
        confidence: Math.max(0, Math.min(1, brief.score / 100)),
        availability: availability.status,
        why: brief.matchedSignals.slice(0, 4),
        sideEffectClass: brief.sideEffectClass,
        missing: availability.missing.length ? availability.missing : undefined,
      };
    });
    const result = {
      contract: CAPABILITY_DISCOVERY_CONTRACT_ID,
      discoveryRef: discoveryRef('search', this.auditSeed, query),
      auditRef: auditRef('search', this.auditSeed, query),
      candidates,
      excluded: brokered.excluded.slice(0, 24).map((item) => ({
        capabilityId: item.id,
        reason: item.reason,
      })),
      next: nextActions(candidates),
    } satisfies CapabilitySearchResult;
    return sanitizeDiscoveryResult(result) as CapabilitySearchResult;
  }

  expand(query: CapabilityExpandQuery): CapabilityExpansionResult {
    const include = new Set(query.include ?? []);
    const expanded: Array<Record<string, unknown>> = [];
    const excluded: Array<{ capabilityId: string; reason: string }> = [];
    for (const capabilityId of unique(query.capabilityIds).slice(0, 8)) {
      const manifest = this.registry.getManifest(capabilityId);
      if (!manifest) {
        excluded.push({ capabilityId, reason: 'unknown capability id' });
        continue;
      }
      const availability = availabilityForManifest(manifest, this.availableProviderIds, this.unavailableProviderReasons);
      const entry: Record<string, unknown> = {
        capabilityId: manifest.id,
        title: manifest.name,
        kind: manifest.kind,
        brief: manifest.brief,
        routingTags: manifest.routingTags.slice(0, 12),
        domains: manifest.domains.slice(0, 8),
        sideEffects: [...manifest.sideEffects],
        sideEffectClass: manifest.sideEffectClass,
        availability: availability.status,
        missing: availability.missing,
        executionContract: 'execute with invoke_capability; discovery is not completion evidence',
      };
      if (include.has('schemas')) {
        entry.inputSchema = boundedSchema(manifest.inputSchema, query.maxSchemaBytes);
        entry.outputSchema = boundedSchema(manifest.outputSchema, query.maxSchemaBytes);
      }
      if (include.has('examples')) entry.examples = manifest.examples.slice(0, 3).map((example) => ({ ...example }));
      if (include.has('providers')) entry.providers = manifest.providers.map(publicProvider);
      if (include.has('validators')) entry.validators = manifest.validators.map((validator) => ({ ...validator, expectedRefs: validator.expectedRefs?.slice(0, 8) }));
      if (include.has('repairHints')) entry.repairHints = manifest.repairHints.map((hint) => ({ ...hint, recoverActions: hint.recoverActions.slice(0, 6) }));
      if (include.has('failureModes')) {
        entry.failureModes = manifest.repairHints.map((hint) => ({
          failureCode: hint.failureCode,
          recoverActions: hint.recoverActions.slice(0, 6),
        }));
      }
      expanded.push(entry);
    }
    const result = {
      contract: CAPABILITY_DISCOVERY_CONTRACT_ID,
      discoveryRef: discoveryRef('expand', this.auditSeed, query),
      auditRef: auditRef('expand', this.auditSeed, query),
      expanded,
      excluded,
    } satisfies CapabilityExpansionResult;
    return sanitizeDiscoveryResult(result) as CapabilityExpansionResult;
  }

  plan(query: CapabilityPlanQuery): CapabilityPlanResult {
    const manifests = unique(query.candidateIds).slice(0, 8).flatMap((id) => this.registry.getManifest(id) ?? []);
    const steps = manifests.map((manifest, index) => {
      const availability = availabilityForManifest(manifest, this.availableProviderIds, this.unavailableProviderReasons);
      return {
        order: index + 1,
        capabilityId: manifest.id,
        action: availability.status === 'ready' ? 'invoke_capability' as const : 'ask-user' as const,
        dependsOn: index === 0 ? [] : [manifests[index - 1]!.id],
        expectedArtifacts: expectedArtifactsForManifest(manifest),
        fallbackCapabilityIds: fallbackCapabilityIds(manifest, manifests),
        missing: availability.missing,
      };
    });
    const missingProviders = manifests.flatMap((manifest) => {
      const availability = availabilityForManifest(manifest, this.availableProviderIds, this.unavailableProviderReasons);
      return availability.status === 'missing-provider' || availability.status === 'unavailable'
        ? [{ capabilityId: manifest.id, providerIds: manifest.providers.map((provider) => provider.id), reason: availability.missing.join('; ') || 'provider is not ready' }]
        : [];
    });
    const missingPermissions = manifests.flatMap((manifest) => {
      const permissions = unique(manifest.providers.flatMap((provider) => provider.permissions ?? []));
      const needsApproval = manifest.safety.requiresHumanApproval || permissions.some((permission) => ['desktop', 'shell', 'workspace-write', 'external-account'].includes(permission));
      return needsApproval
        ? [{ capabilityId: manifest.id, permissions, reason: 'human confirmation may be required before execution' }]
        : [];
    });
    const expectedArtifacts = unique(steps.flatMap((step) => step.expectedArtifacts));
    const result = {
      contract: CAPABILITY_DISCOVERY_CONTRACT_ID,
      planId: planId(query),
      discoveryRef: discoveryRef('plan', this.auditSeed, query),
      auditRef: auditRef('plan', this.auditSeed, query),
      summary: planSummary(manifests, missingProviders, missingPermissions),
      steps,
      missingProviders,
      missingPermissions,
      userConfirmations: missingPermissions.map((item) => ({ capabilityId: item.capabilityId, reason: item.reason })),
      expectedArtifacts,
      completionEvidence: 'not-evidence',
    } satisfies CapabilityPlanResult;
    return sanitizeDiscoveryResult(result) as CapabilityPlanResult;
  }

  explain(query: CapabilityExplainQuery): CapabilityExplainResult {
    const manifests = unique(query.capabilityIds ?? []).slice(0, 8).flatMap((id) => this.registry.getManifest(id) ?? []);
    const capabilityNames = manifests.map((manifest) => manifest.name || manifest.id);
    const text = query.audience === 'user'
      ? userExplanation(capabilityNames)
      : query.audience === 'debug'
        ? debugExplanation(manifests)
        : auditExplanation(query, manifests);
    const result = {
      contract: CAPABILITY_DISCOVERY_CONTRACT_ID,
      discoveryRef: discoveryRef('explain', this.auditSeed, query),
      auditRef: auditRef('explain', this.auditSeed, query),
      audience: query.audience,
      text,
      details: query.audience === 'user' ? undefined : {
        capabilityIds: manifests.map((manifest) => manifest.id),
        planId: query.planId,
        executionRequiresInvokeCapability: true,
      },
    } satisfies CapabilityExplainResult;
    return sanitizeDiscoveryResult(result) as CapabilityExplainResult;
  }
}

export function createCapabilityDiscoveryService(options: CapabilityDiscoveryOptions = {}) {
  return new CapabilityDiscoveryService(options);
}

function refsToObjects(refs: string[]) {
  return refs.map((ref) => ({ ref, summary: ref }));
}

function toolBudgetForSearch(query: CapabilitySearchQuery): CapabilityBrokerToolBudget | undefined {
  const latencyTier = query.constraints?.latencyTier;
  if (!latencyTier) return undefined;
  if (latencyTier === 'instant') return { maxToolCalls: 0, maxWallMs: 0, maxProviders: 0 };
  if (latencyTier === 'quick') return { maxToolCalls: 3, maxWallMs: 15000, maxProviders: 1 };
  if (latencyTier === 'bounded') return { maxToolCalls: 8, maxWallMs: 60000, maxProviders: 3 };
  return { maxToolCalls: 20, maxWallMs: 180000, maxProviders: 6 };
}

function availabilityForManifest(
  manifest: CapabilityManifest | undefined,
  availableProviderIds: Set<string>,
  unavailableProviderReasons: Record<string, string>,
): { status: CapabilityDiscoveryAvailability; missing: string[] } {
  if (!manifest) return { status: 'unavailable', missing: ['unknown capability'] };
  if (!manifest.providers.length) return { status: 'missing-provider', missing: ['no provider registered'] };
  const providerIds = manifest.providers.map((provider) => provider.id);
  const configuredAvailable = providerIds.some((id) => availableProviderIds.has(id));
  const builtInAvailable = manifest.providers.some((provider) => provider.status === 'available' || provider.requiredConfig.length === 0);
  if (configuredAvailable || builtInAvailable) return { status: 'ready', missing: [] };
  const unauthorized = manifest.providers.find((provider) => provider.status === 'unauthorized' || provider.auth?.required);
  if (unauthorized) return { status: 'unauthorized', missing: [`${unauthorized.id} authorization required`] };
  const reasons = providerIds.map((id) => unavailableProviderReasons[id]).filter((reason): reason is string => Boolean(reason));
  return {
    status: reasons.length ? 'unavailable' : 'missing-provider',
    missing: reasons.length ? reasons : providerIds.map((id) => `${id} provider not ready`),
  };
}

function publicProvider(provider: CapabilityProviderManifest) {
  return {
    providerId: provider.id,
    label: provider.label,
    kind: provider.kind,
    source: provider.source,
    transport: provider.transport,
    healthStatus: provider.status ?? 'unknown',
    requiredConfig: provider.requiredConfig.slice(0, 8),
    permissions: provider.permissions?.slice(0, 8) ?? [],
    fallbackEligible: provider.fallbackEligible,
  };
}

function boundedSchema(schema: Record<string, unknown>, maxSchemaBytes = 4096) {
  const json = JSON.stringify(schema);
  if (json.length <= maxSchemaBytes) return schema;
  return {
    omitted: true,
    reason: 'schema byte budget exceeded',
    originalBytes: Buffer.byteLength(json, 'utf8'),
    maxSchemaBytes,
  };
}

function nextActions(candidates: CapabilitySearchCandidate[]): CapabilitySearchResult['next'] {
  const actions: NonNullable<CapabilitySearchResult['next']> = [];
  if (candidates.length) actions.push('expand', 'plan');
  if (candidates.some((candidate) => candidate.availability === 'ready')) actions.push('invoke-capability');
  if (candidates.some((candidate) => candidate.availability !== 'ready')) actions.push('ask-user');
  return unique(actions);
}

function expectedArtifactsForManifest(manifest: CapabilityManifest) {
  const tags = new Set([...manifest.routingTags, ...manifest.domains, manifest.kind]);
  const artifacts: string[] = [];
  if (tags.has('literature') || tags.has('evidence')) artifacts.push('paper-list', 'evidence-matrix', 'research-report');
  if (tags.has('view')) artifacts.push('artifact-preview');
  if (tags.has('verifier')) artifacts.push('verification-record');
  if (!artifacts.length) artifacts.push(`${manifest.id}-result`);
  return unique(artifacts);
}

function fallbackCapabilityIds(manifest: CapabilityManifest, manifests: CapabilityManifest[]) {
  const peerIds = new Set(manifests.map((item) => item.id));
  return unique([
    ...manifest.requiredCapabilities,
    ...manifest.repairHints.flatMap((hint) => hint.recoverActions),
  ]).filter((id) => peerIds.has(id));
}

function planSummary(
  manifests: CapabilityManifest[],
  missingProviders: CapabilityPlanResult['missingProviders'],
  missingPermissions: CapabilityPlanResult['missingPermissions'],
) {
  const names = manifests.map((manifest) => manifest.name || manifest.id).join(', ') || 'no selected capabilities';
  const missing = [
    missingProviders.length ? `${missingProviders.length} provider gap(s)` : '',
    missingPermissions.length ? `${missingPermissions.length} permission confirmation(s)` : '',
  ].filter(Boolean).join('; ');
  return missing
    ? `Discovery plan: use ${names}; ${missing}. Execute only through invoke_capability.`
    : `Discovery plan: use ${names}. Execute only through invoke_capability.`;
}

function userExplanation(names: string[]) {
  if (!names.length) return 'SciForge can search for a capability plan, then execute approved work through invoke_capability.';
  return `SciForge will use ${names.join(', ')} if they fit the task; discovery itself does not execute the task.`;
}

function debugExplanation(manifests: CapabilityManifest[]) {
  return JSON.stringify({
    selectedCapabilityIds: manifests.map((manifest) => manifest.id),
    providerIds: manifests.flatMap((manifest) => manifest.providers.map((provider) => provider.id)),
    executionRequiresInvokeCapability: true,
  });
}

function auditExplanation(query: CapabilityExplainQuery, manifests: CapabilityManifest[]) {
  return JSON.stringify({
    planId: query.planId,
    capabilityIds: manifests.map((manifest) => manifest.id),
    audit: 'progressive-disclosure-only',
    completionEvidence: 'not-evidence',
  });
}

function sanitizeDiscoveryResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDiscoveryResult);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/endpoint|baseUrl|invokeUrl|url|auth|token|secret|workspaceRoot|workspaceRoots|runtimeLocation|command|mcpServer/i.test(key)) continue;
      out[key] = sanitizeDiscoveryResult(entry);
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/https?:\/\/[^\s")]+/g, '[redacted-url]')
    .replace(/\/(?:Applications|Users|private|var|tmp)\/[^\s")]+/g, '[redacted-path]')
    .replace(/(?:token|secret|api[_-]?key)=?[A-Za-z0-9._-]+/gi, '[redacted-secret]');
}

function discoveryRef(kind: string, seed: string, payload: unknown) {
  return `capability-discovery:${kind}:${digest(seed, payload)}`;
}

function auditRef(kind: string, seed: string, payload: unknown) {
  return `audit:capability-discovery:${kind}:${digest(seed, payload)}`;
}

function planId(query: CapabilityPlanQuery) {
  return `capability-plan:${digest('plan', query)}`;
}

function digest(seed: string, payload: unknown) {
  return createHash('sha256')
    .update(seed)
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function tokenList(value: string) {
  return value.toLowerCase().split(/[^a-z0-9_.-]+/i).filter(Boolean).slice(0, 12);
}
