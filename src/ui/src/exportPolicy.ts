import { nowIso, type BioAgentSession, type RuntimeArtifact } from './domain';

export interface ExportPolicyDecision {
  allowed: boolean;
  blockedArtifactIds: string[];
  restrictedArtifactIds: string[];
  sensitiveFlags: string[];
  warnings: string[];
}

export function evaluateExecutionBundleExport(session: BioAgentSession): ExportPolicyDecision {
  const blocked = session.artifacts.filter((artifact) => artifact.exportPolicy === 'blocked');
  const restricted = session.artifacts.filter((artifact) => artifact.exportPolicy === 'restricted');
  const sensitiveFlags = unique(session.artifacts.flatMap((artifact) => artifact.sensitiveDataFlags ?? []));
  const missingAudience = session.artifacts.filter((artifact) => (
    artifact.exportPolicy === 'restricted'
    && (!artifact.audience || artifact.audience.length === 0)
  ));
  const warnings = [
    ...restricted.map((artifact) => `restricted artifact ${artifact.id} requires audience review`),
    ...missingAudience.map((artifact) => `restricted artifact ${artifact.id} has no explicit audience`),
    ...sensitiveFlags.map((flag) => `sensitive data flag: ${flag}`),
  ];
  return {
    allowed: blocked.length === 0,
    blockedArtifactIds: blocked.map((artifact) => artifact.id),
    restrictedArtifactIds: restricted.map((artifact) => artifact.id),
    sensitiveFlags,
    warnings: unique(warnings),
  };
}

export function buildExecutionBundle(session: BioAgentSession, decision = evaluateExecutionBundleExport(session)) {
  if (!decision.allowed) {
    throw new Error(`Export blocked by artifact policy: ${decision.blockedArtifactIds.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    sessionId: session.sessionId,
    scenarioId: session.scenarioId,
    exportedAt: nowIso(),
    exportPolicy: {
      restrictedArtifactIds: decision.restrictedArtifactIds,
      sensitiveDataFlags: decision.sensitiveFlags,
      warnings: decision.warnings,
    },
    executionUnits: session.executionUnits,
    artifacts: session.artifacts.map(summarizeArtifactForExport),
    runs: session.runs.map((run) => ({
      id: run.id,
      scenarioId: run.scenarioId,
      scenarioPackageRef: run.scenarioPackageRef,
      skillPlanRef: run.skillPlanRef,
      uiPlanRef: run.uiPlanRef,
      status: run.status,
      prompt: run.prompt,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    })),
  };
}

function summarizeArtifactForExport(artifact: RuntimeArtifact) {
  return {
    id: artifact.id,
    type: artifact.type,
    producerScenario: artifact.producerScenario,
    scenarioPackageRef: artifact.scenarioPackageRef,
    schemaVersion: artifact.schemaVersion,
    metadata: artifact.metadata,
    dataRef: artifact.dataRef,
    visibility: artifact.visibility,
    audience: artifact.audience,
    sensitiveDataFlags: artifact.sensitiveDataFlags,
    exportPolicy: artifact.exportPolicy,
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
