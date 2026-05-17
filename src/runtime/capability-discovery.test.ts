import assert from 'node:assert/strict';
import test from 'node:test';

import { createCapabilityDiscoveryService } from './capability-discovery.js';

test('capability discovery search returns compact candidates and audit refs', () => {
  const discovery = createCapabilityDiscoveryService({ auditSeed: 'search-test' });

  const result = discovery.search({
    goal: 'Need to search recent arxiv papers, fetch PDFs, extract full text, and produce an evidence matrix.',
    desiredArtifacts: ['research-report', 'evidence-matrix'],
    constraints: { maxCandidates: 4, latencyTier: 'bounded' },
  });

  assert.equal(result.contract, 'sciforge.capability-discovery.v1');
  assert.match(result.discoveryRef, /^capability-discovery:search:/);
  assert.match(result.auditRef, /^audit:capability-discovery:search:/);
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.length <= 4);
  assert.ok(result.candidates.every((candidate) => candidate.capabilityId && candidate.brief && candidate.kind));
  assert.doesNotMatch(JSON.stringify(result), /inputSchema|outputSchema|examples|endpoint|workspaceRoots|auth|token|secret/i);
});

test('capability discovery expand only reveals selected capabilities and public providers', () => {
  const discovery = createCapabilityDiscoveryService({ auditSeed: 'expand-test' });

  const result = discovery.expand({
    capabilityIds: ['web_search'],
    include: ['providers', 'schemas', 'examples'],
    maxSchemaBytes: 128,
  });

  assert.deepEqual(result.expanded.map((entry) => entry.capabilityId), ['web_search']);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.expanded[0]?.executionContract, 'execute with invoke_capability; discovery is not completion evidence');
  assert.match(JSON.stringify(result), /providers/);
  assert.doesNotMatch(JSON.stringify(result), /endpoint|baseUrl|invokeUrl|workspaceRoots|runtimeLocation|auth|token|secret|\/Applications\/workspace/i);

  const unknown = discovery.expand({ capabilityIds: ['missing.capability'], include: ['providers'] });
  assert.deepEqual(unknown.expanded, []);
  assert.deepEqual(unknown.excluded, [{ capabilityId: 'missing.capability', reason: 'unknown capability id' }]);
});

test('capability discovery plan reports missing provider and permission without completion evidence', () => {
  const discovery = createCapabilityDiscoveryService({ auditSeed: 'plan-test' });

  const result = discovery.plan({
    goal: 'Open a visible browser and download a PDF after login.',
    candidateIds: ['playwright_edge_browser', 'runtime.workspace-write'],
    budget: { maxToolCalls: 4, maxProviders: 1 },
  });

  assert.equal(result.completionEvidence, 'not-evidence');
  assert.ok(result.steps.some((step) => step.action === 'ask-user' || step.action === 'invoke_capability'));
  assert.ok(result.steps.every((step) => step.action !== 'verify' || step.missing.length === 0));
  assert.ok(result.missingPermissions.some((item) => item.capabilityId === 'playwright_edge_browser' || item.capabilityId === 'runtime.workspace-write'));
  assert.match(result.summary, /invoke_capability/);
  assert.doesNotMatch(JSON.stringify(result), /endpoint|baseUrl|invokeUrl|workspaceRoots|auth|token|secret/i);
});

test('capability discovery explain changes detail by audience', () => {
  const discovery = createCapabilityDiscoveryService({ auditSeed: 'explain-test' });

  const user = discovery.explain({ capabilityIds: ['web_search'], audience: 'user' });
  const audit = discovery.explain({ capabilityIds: ['web_search'], audience: 'audit', planId: 'capability-plan:test' });

  assert.equal(user.details, undefined);
  assert.match(user.text, /does not execute/);
  assert.ok(audit.details);
  assert.match(audit.text, /not-evidence/);
});
