import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { attachResearcherDecision } from './beliefGraph';
import type { BeliefDependencyGraph, ResearcherDecisionRecord } from './domain';

describe('attachResearcherDecision', () => {
  it('adds a decision node without replacing original evidence', () => {
    const graph: BeliefDependencyGraph = {
      id: 'belief-1',
      schemaVersion: '1',
      nodes: [
        { id: 'claim-1', kind: 'claim', label: 'Hypothesis A', confidence: 0.5, createdAt: '2026-04-20T00:00:00Z' },
        { id: 'wetlab-1', kind: 'evidence', label: 'Wet-lab result', createdAt: '2026-04-20T00:00:00Z' },
      ],
      edges: [{ id: 'wetlab-1->claim-1', kind: 'supports', source: 'wetlab-1', target: 'claim-1', createdAt: '2026-04-20T00:00:00Z' }],
      updatedAt: '2026-04-20T00:00:00Z',
    };
    const decision: ResearcherDecisionRecord = {
      id: 'decision-1',
      status: 'inconclusive',
      revisionStatus: 'original',
      subjectRef: 'claim-1',
      evidenceRefs: ['wetlab-1'],
      confirmedBy: 'researcher',
      confirmedAt: '2026-04-20T01:00:00Z',
      rationale: 'Signal is noisy; repeat is required.',
    };

    const next = attachResearcherDecision(graph, decision);

    assert.ok(next.nodes.find((node) => node.id === 'wetlab-1'));
    assert.ok(next.nodes.find((node) => node.id === 'decision-1' && node.kind === 'decision'));
    assert.ok(next.edges.find((edge) => edge.source === 'decision-1' && edge.target === 'claim-1'));
    assert.deepEqual(next.currentDecisionRefs, ['decision-1']);
  });
});

