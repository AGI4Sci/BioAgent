import assert from 'node:assert/strict';

import { normalizeAgentResponse } from '../../src/ui/src/api/agentClient.js';

const response = normalizeAgentResponse('omics-differential-exploration', 'UMAP 按 cell cycle 着色并 side-by-side batch 对比', {
  run: {
    id: 'view-composition-smoke',
    status: 'completed',
    output: {
      text: [
        'view composition smoke',
        '```json',
        JSON.stringify({
          message: 'View composition only; no new scientific task.',
          uiManifest: [{
            componentId: 'umap-viewer',
            artifactRef: 'omics-differential-expression',
            encoding: { colorBy: 'cellCycle', splitBy: 'batch', syncViewport: true },
            layout: { mode: 'side-by-side', columns: 2 },
            compare: { artifactRefs: ['batch-a', 'batch-b'], mode: 'side-by-side' },
          }],
          executionUnits: [],
          artifacts: [],
          claims: [],
        }),
        '```',
      ].join('\n'),
    },
  },
});

assert.equal(response.artifacts.length, 0);
assert.equal(response.uiManifest[0].encoding?.colorBy, 'cellCycle');
assert.equal(response.uiManifest[0].layout?.mode, 'side-by-side');
assert.equal(response.uiManifest[0].compare?.mode, 'side-by-side');
console.log('[ok] view composition smoke preserves UMAP colorBy and side-by-side compare without scientific task artifacts');
