import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-knowledge-unsupported-'));
const result = await runWorkspaceRuntimeGateway({
  skillDomain: 'knowledge',
  prompt: 'melanoma disease OpenTargets connector status',
  availableSkills: ['knowledge.uniprot_chembl_lookup'],
  workspacePath: workspace,
});

assert.equal(result.executionUnits.length, 1);
assert.equal(result.executionUnits[0].status, 'repair-needed');
assert.match(String(result.executionUnits[0].failureReason || result.message), /AgentServer|base URL|generation/i);
assert.equal(result.artifacts.length, 0);

console.log('[ok] knowledge unsupported smoke returns repair-needed without fabricated knowledge graph success');
