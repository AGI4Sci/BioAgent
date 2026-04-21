import type {
  BeliefDependencyGraph,
  BeliefGraphEdge,
  BeliefGraphNode,
  ResearcherDecisionRecord,
} from './domain';

export function attachResearcherDecision(
  graph: BeliefDependencyGraph,
  decision: ResearcherDecisionRecord,
): BeliefDependencyGraph {
  const now = decision.confirmedAt;
  const decisionNode: BeliefGraphNode = {
    id: decision.id,
    kind: 'decision',
    label: `${decision.status}: ${decision.rationale}`,
    refs: decision.evidenceRefs,
    createdAt: now,
    updatedAt: now,
  };
  const edges: BeliefGraphEdge[] = [
    ...decision.evidenceRefs.map((ref) => ({
      id: `${ref}->${decision.id}`,
      kind: 'supports' as const,
      source: ref,
      target: decision.id,
      updateReason: decision.rationale,
      createdAt: now,
    })),
    {
      id: `${decision.id}->${decision.subjectRef}`,
      kind: 'depends-on',
      source: decision.id,
      target: decision.subjectRef,
      updateReason: `researcher decision ${decision.status}`,
      createdAt: now,
    },
  ];
  if (decision.supersedesRef) {
    edges.push({
      id: `${decision.id}->${decision.supersedesRef}`,
      kind: 'supersedes',
      source: decision.id,
      target: decision.supersedesRef,
      updateReason: decision.revisionStatus,
      createdAt: now,
    });
  }
  return {
    ...graph,
    nodes: [
      ...graph.nodes.filter((node) => node.id !== decision.id),
      decisionNode,
    ],
    edges: [
      ...graph.edges.filter((edge) => !edges.some((next) => next.id === edge.id)),
      ...edges,
    ],
    currentDecisionRefs: [
      decision.id,
      ...(graph.currentDecisionRefs ?? []).filter((ref) => ref !== decision.id && ref !== decision.supersedesRef),
    ],
    updatedAt: now,
  };
}

