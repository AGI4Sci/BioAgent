import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BIOAGENT_PROFILES } from '../agentProfiles';
import type { AgentId } from '../data';
import { runLocalBioAgentAdapter } from './localAdapters';

describe('runLocalBioAgentAdapter', () => {
  it('generates schema-compliant record-only responses for every BioAgent profile', () => {
    (Object.keys(BIOAGENT_PROFILES) as AgentId[]).forEach((agentId) => {
      const profile = BIOAGENT_PROFILES[agentId];
      const response = runLocalBioAgentAdapter(agentId, `Analyze KRAS with ${agentId}`);
      const expectedArtifact = profile.outputArtifacts[0].type;

      assert.equal(response.message.role, 'agent');
      assert.equal(response.artifacts[0].type, expectedArtifact);
      assert.equal(response.artifacts[0].producerAgent, agentId);
      assert.equal(response.uiManifest[0].artifactRef, expectedArtifact);
      assert.equal(response.executionUnits[0].outputArtifacts?.[0], expectedArtifact);
      assert.match(response.executionUnits[0].tool, new RegExp(`^${agentId}\\.local-record-adapter$`));
      assert.ok(response.claims[0].supportingRefs.length > 0);
      assert.equal(response.run.raw && typeof response.run.raw === 'object' ? (response.run.raw as { source?: string }).source : undefined, 'local-record-adapter');
    });
  });
});
