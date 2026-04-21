import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runWorkspaceRuntimeGateway } from './workspace-runtime-gateway.js';

const workspace = '/tmp/bioagent-omics-runner-smoke';
await mkdir(join(workspace, 'data'), { recursive: true });
await writeFile(join(workspace, 'data', 'matrix.csv'), [
  'gene,c1,c2,t1,t2',
  'TP53,10,11,40,42',
  'MYC,80,82,20,18',
  'ACTB,50,51,50,49',
  '',
].join('\n'));
await writeFile(join(workspace, 'data', 'metadata.csv'), [
  'sample,condition',
  'c1,control',
  'c2,control',
  't1,treated',
  't2,treated',
  '',
].join('\n'));

const result = await runWorkspaceRuntimeGateway({
  skillDomain: 'omics',
  workspacePath: workspace,
  prompt: [
    'matrixRef=data/matrix.csv',
    'metadataRef=data/metadata.csv',
    'groupColumn=condition',
    'caseGroup=treated',
    'controlGroup=control',
    'runner=scanpy',
  ].join(' '),
});

assert.equal(result.artifacts[0]?.type, 'omics-differential-expression');
const metadata = (result.artifacts[0].metadata ?? {}) as Record<string, unknown>;
assert.equal(metadata.requestedRunner, 'scanpy.rank_genes_groups');
assert.ok(metadata.effectiveRunner === 'scanpy.rank_genes_groups' || metadata.effectiveRunner === 'omics.python-csv-differential');
assert.ok(metadata.runtimeAvailability);
assert.equal(result.executionUnits[0]?.skillId, 'omics.differential_expression');
console.log(`[ok] omics runner smoke requested=${metadata.requestedRunner} effective=${metadata.effectiveRunner}`);
