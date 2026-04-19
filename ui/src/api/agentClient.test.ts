import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAgentResponse } from './agentClient';

describe('normalizeAgentResponse', () => {
  it('normalizes structured AgentServer JSON embedded in text', () => {
    const response = normalizeAgentResponse('literature', 'KRAS evidence?', {
      ok: true,
      data: {
        run: {
          id: 'run-structured-1',
          status: 'completed',
          output: {
            result: [
              '已完成。',
              '```json',
              JSON.stringify({
                message: 'KRAS G12C 耐药证据已归档。',
                confidence: 0.92,
                claimType: 'fact',
                evidenceLevel: 'cohort',
                claims: [{
                  id: 'claim-1',
                  text: 'EGFR/MET bypass is a supported resistance route.',
                  type: 'inference',
                  confidence: 0.89,
                  evidenceLevel: 'cohort',
                  supportingRefs: ['paper-1'],
                  opposingRefs: [],
                }],
                uiManifest: [{
                  componentId: 'paper-card-list',
                  title: 'Papers',
                  artifactRef: 'papers-1',
                  priority: 1,
                }],
                executionUnits: [{
                  id: 'EU-1',
                  tool: 'literature.search',
                  params: { query: 'KRAS G12C resistance' },
                  status: 'done',
                  hash: 'abc123',
                  artifacts: ['papers-1'],
                }],
                artifacts: [{
                  id: 'papers-1',
                  type: 'paper-list',
                  schemaVersion: '1',
                  data: { papers: [{ title: 'Paper A', year: 2024 }] },
                }],
              }),
              '```',
            ].join('\n'),
          },
        },
      },
    });

    assert.equal(response.message.content, 'KRAS G12C 耐药证据已归档。');
    assert.equal(response.message.confidence, 0.92);
    assert.equal(response.claims[0].id, 'claim-1');
    assert.equal(response.uiManifest[0].componentId, 'paper-card-list');
    assert.equal(response.uiManifest[0].artifactRef, 'papers-1');
    assert.equal(response.executionUnits[0].params, '{"query":"KRAS G12C resistance"}');
    assert.equal(response.executionUnits[0].status, 'done');
    assert.equal(response.artifacts[0].id, 'papers-1');
  });

  it('creates recordable fallback objects for plain text responses', () => {
    const response = normalizeAgentResponse('structure', 'Analyze PDB 7BZ5', {
      run: {
        id: 'plain-run-1',
        status: 'completed',
        output: {
          text: '7BZ5 结构分析完成，但后端没有返回结构化协议。',
        },
      },
    });

    assert.equal(response.message.content, '7BZ5 结构分析完成，但后端没有返回结构化协议。');
    assert.equal(response.claims.length, 1);
    assert.equal(response.executionUnits.length, 1);
    assert.equal(response.executionUnits[0].tool, 'structure.agent-server-run');
    assert.equal(response.executionUnits[0].status, 'done');
    assert.equal(response.uiManifest.length, 0);
  });
});
