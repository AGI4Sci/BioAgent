import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';
import type { BioAgentSkillDomain, ToolPayload } from '../../src/runtime/runtime-types.js';

if (!process.env.SCP_HUB_API_KEY && !process.env.SCPhub_api_key && !process.env.SCPHUB_API_KEY) {
  throw new Error('Set SCP_HUB_API_KEY or SCPhub_api_key to run live SCP skill smoke tests.');
}

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-scp-live-'));

const cases: Array<{
  name: string;
  skillDomain: BioAgentSkillDomain;
  availableSkills: string[];
  prompt: string;
  expectedArtifact: string;
  expectedStatus: 'done' | 'failed-with-reason';
}> = [
  {
    name: 'protein properties',
    skillDomain: 'knowledge',
    availableSkills: ['scp.protein-properties-calculation'],
    prompt: 'Calculate protein physicochemical properties sequence=MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKT',
    expectedArtifact: 'protein-properties',
    expectedStatus: 'done',
  },
  {
    name: 'TCGA expression',
    skillDomain: 'omics',
    availableSkills: ['scp.tcga-gene-expression'],
    prompt: 'Query TCGA gene expression gene=EGFR cancer_type=LUAD tumor_vs_normal',
    expectedArtifact: 'tcga-expression',
    expectedStatus: 'done',
  },
  {
    name: 'biomedical web search',
    skillDomain: 'literature',
    availableSkills: ['scp.biomedical-web-search'],
    prompt: 'query=BRCA1 PARP inhibitor resistance',
    expectedArtifact: 'paper-list',
    expectedStatus: 'done',
  },
  {
    name: 'molecular docking missing SCP path',
    skillDomain: 'structure',
    availableSkills: ['scp.molecular-docking'],
    prompt: 'Run molecular docking smiles=CC(=O)Oc1ccccc1C(=O)O PDB 1A3N',
    expectedArtifact: 'docking-result',
    expectedStatus: 'failed-with-reason',
  },
  {
    name: 'generic molecular properties execution',
    skillDomain: 'knowledge',
    availableSkills: ['scp.molecular-properties-calculation'],
    prompt: 'tool=SMILESToWeight smiles=CCO',
    expectedArtifact: 'scp-live-result',
    expectedStatus: 'done',
  },
];

for (const item of cases) {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: item.skillDomain,
    workspacePath: workspace,
    availableSkills: item.availableSkills,
    artifacts: [],
    prompt: item.prompt,
  });
  assertResult(item.name, result, item.expectedArtifact, item.expectedStatus);
  console.log(`[ok] live SCP ${item.name} -> ${item.expectedArtifact} (${item.expectedStatus})`);
}

function assertResult(name: string, result: ToolPayload, artifactType: string, status: string) {
  assert.equal(result.executionUnits[0]?.status, status, `${name} status`);
  assert.equal(result.executionUnits[0]?.skillId, cases.find((item) => item.name === name)?.availableSkills[0], `${name} skillId`);
  assert.ok(result.artifacts.some((artifact) => artifact.type === artifactType), `${name} ${artifactType} artifact missing`);
  assert.ok(result.uiManifest.length > 0, `${name} should include uiManifest`);
}
