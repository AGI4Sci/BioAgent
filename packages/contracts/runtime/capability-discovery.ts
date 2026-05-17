import type {
  CapabilityManifestKind,
  CapabilityManifestSideEffectClass,
} from './capability-manifest';

export const CAPABILITY_DISCOVERY_CONTRACT_ID = 'sciforge.capability-discovery.v1' as const;
export const CAPABILITY_DISCOVERY_TINY_BRIEF_SCHEMA_VERSION = 'sciforge.capability-discovery.tiny-brief.v1' as const;

export type CapabilityDiscoveryAudience = 'user' | 'debug' | 'audit';
export type CapabilityDiscoveryAvailability = 'ready' | 'missing-provider' | 'unauthorized' | 'unavailable';

export interface CapabilitySearchQuery {
  goal: string;
  currentContextRefs?: string[];
  selectedRefs?: string[];
  desiredArtifacts?: string[];
  constraints?: {
    latencyTier?: 'instant' | 'quick' | 'bounded' | 'deep' | 'background';
    allowedSideEffects?: string[];
    privacyProfile?: string;
    maxCandidates?: number;
  };
}

export interface CapabilitySearchCandidate {
  capabilityId: string;
  title: string;
  brief: string;
  kind: CapabilityManifestKind;
  confidence: number;
  availability: CapabilityDiscoveryAvailability;
  why: string[];
  sideEffectClass: CapabilityManifestSideEffectClass;
  missing?: string[];
}

export interface CapabilitySearchResult {
  contract: typeof CAPABILITY_DISCOVERY_CONTRACT_ID;
  discoveryRef: string;
  auditRef: string;
  candidates: CapabilitySearchCandidate[];
  excluded: Array<{ capabilityId: string; reason: string }>;
  next?: Array<'expand' | 'plan' | 'ask-user' | 'invoke-capability'>;
}

export interface CapabilityExpandQuery {
  capabilityIds: string[];
  include?: Array<'schemas' | 'examples' | 'providers' | 'validators' | 'repairHints' | 'failureModes'>;
  maxSchemaBytes?: number;
}

export interface CapabilityExpansionResult {
  contract: typeof CAPABILITY_DISCOVERY_CONTRACT_ID;
  discoveryRef: string;
  auditRef: string;
  expanded: Array<Record<string, unknown>>;
  excluded: Array<{ capabilityId: string; reason: string }>;
}

export interface CapabilityPlanQuery {
  goal: string;
  candidateIds: string[];
  contextRefs?: string[];
  budget?: {
    maxToolCalls?: number;
    maxWallMs?: number;
    maxProviders?: number;
  };
}

export interface CapabilityPlanResult {
  contract: typeof CAPABILITY_DISCOVERY_CONTRACT_ID;
  planId: string;
  discoveryRef: string;
  auditRef: string;
  summary: string;
  steps: Array<{
    order: number;
    capabilityId: string;
    action: 'expand' | 'invoke_capability' | 'ask-user' | 'verify' | 'fallback';
    dependsOn: string[];
    expectedArtifacts: string[];
    fallbackCapabilityIds: string[];
    missing: string[];
  }>;
  missingProviders: Array<{ capabilityId: string; providerIds: string[]; reason: string }>;
  missingPermissions: Array<{ capabilityId: string; permissions: string[]; reason: string }>;
  userConfirmations: Array<{ capabilityId: string; reason: string }>;
  expectedArtifacts: string[];
  completionEvidence: 'not-evidence';
}

export interface CapabilityExplainQuery {
  planId?: string;
  capabilityIds?: string[];
  audience: CapabilityDiscoveryAudience;
}

export interface CapabilityExplainResult {
  contract: typeof CAPABILITY_DISCOVERY_CONTRACT_ID;
  discoveryRef: string;
  auditRef: string;
  audience: CapabilityDiscoveryAudience;
  text: string;
  details?: Record<string, unknown>;
}

export interface CapabilityDiscoveryTinyBrief {
  schemaVersion: typeof CAPABILITY_DISCOVERY_TINY_BRIEF_SCHEMA_VERSION;
  status: 'available';
  api: ['search', 'expand', 'plan', 'explain'];
  progressiveDisclosure: true;
  useWhen: string[];
  safety: {
    noSecrets: true;
    noInternalEndpoints: true;
    noWorkspaceRoots: true;
    executionRequiresInvokeCapability: true;
  };
}

export function tinyCapabilityDiscoveryBrief(): CapabilityDiscoveryTinyBrief {
  return {
    schemaVersion: CAPABILITY_DISCOVERY_TINY_BRIEF_SCHEMA_VERSION,
    status: 'available',
    api: ['search', 'expand', 'plan', 'explain'],
    progressiveDisclosure: true,
    useWhen: [
      'current capability brief is insufficient',
      'task requires specialized tools, skills, views, verifiers, or providers',
      'provider, preflight, validation, or repair needs an alternate route',
      'selected refs imply capabilities not present in the compact brief',
    ],
    safety: {
      noSecrets: true,
      noInternalEndpoints: true,
      noWorkspaceRoots: true,
      executionRequiresInvokeCapability: true,
    },
  };
}
