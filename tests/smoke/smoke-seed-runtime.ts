import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';
import type { BioAgentSkillDomain } from '../../src/runtime/runtime-types.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-seed-capability-'));

const cases: Array<{
  skillDomain: BioAgentSkillDomain;
  prompt: string;
  skillId: string;
  expectedArtifactType: string;
}> = [
  {
    skillDomain: 'literature',
    prompt: 'TP53 tumor suppressor reviews',
    skillId: 'literature.pubmed_search',
    expectedArtifactType: 'paper-list',
  },
  {
    skillDomain: 'structure',
    prompt: 'PDB 7BZ5 residues 142-158',
    skillId: 'structure.rcsb_latest_or_entry',
    expectedArtifactType: 'structure-summary',
  },
  {
    skillDomain: 'knowledge',
    prompt: 'TP53 gene',
    skillId: 'knowledge.uniprot_chembl_lookup',
    expectedArtifactType: 'knowledge-graph',
  },
  {
    skillDomain: 'knowledge',
    prompt: 'BLASTP protein sequence alignment',
    skillId: 'sequence.ncbi_blastp_search',
    expectedArtifactType: 'sequence-alignment',
  },
  {
    skillDomain: 'omics',
    prompt: 'matrixRef=matrix.csv metadataRef=metadata.csv groupColumn=condition caseGroup=treated controlGroup=control',
    skillId: 'omics.differential_expression',
    expectedArtifactType: 'omics-differential-expression',
  },
];

for (const item of cases) {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: item.skillDomain,
    prompt: item.prompt,
    workspacePath: workspace,
    artifacts: [],
    availableSkills: [item.skillId],
    expectedArtifactTypes: [item.expectedArtifactType],
    selectedComponentIds: ['execution-unit-table'],
    uiState: {
      forceAgentServerGeneration: false,
      freshTaskGeneration: true,
    },
  });

  const unit = result.executionUnits[0] ?? {};
  assert.equal(unit.status, 'repair-needed');
  const routeDecision = unit.routeDecision as Record<string, unknown> | undefined;
  assert.equal(routeDecision?.selectedSkill, item.skillId);
  assert.equal(routeDecision?.selectedRuntime, 'agentserver-generation');
  assert.match(String(unit.failureReason || ''), /AgentServer base URL is not configured|No validated local skill matched/i);
  assert.ok(result.message || unit.failureReason, `${item.skillId} should explain why generation cannot run`);
  console.log(`[ok] ${item.skillId} seed capability requires AgentServer generation`);
}
