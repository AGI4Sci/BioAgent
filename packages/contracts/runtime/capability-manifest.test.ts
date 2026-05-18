import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORE_CAPABILITY_MANIFESTS,
  validateCapabilityManifestRegistry,
} from './capability-manifest';

test('core capability manifests include platform and local provider contracts', () => {
  assert.deepEqual(validateCapabilityManifestRegistry(CORE_CAPABILITY_MANIFESTS), []);
  const pdfExtract = CORE_CAPABILITY_MANIFESTS.find((manifest) => manifest.id === 'pdf_extract');
  const discovery = CORE_CAPABILITY_MANIFESTS.find((manifest) => manifest.id === 'capability_discovery');

  assert.equal(discovery?.kind, 'runtime-adapter');
  assert.deepEqual(discovery?.sideEffects, ['none']);
  assert.match(discovery?.brief ?? '', /without executing user work/);
  assert.equal(CORE_CAPABILITY_MANIFESTS.some((manifest) => manifest.id === 'web_search'), false);
  assert.equal(CORE_CAPABILITY_MANIFESTS.some((manifest) => manifest.id === 'web_fetch'), false);
  assert.equal(pdfExtract?.providers[0]?.source, 'local');
  assert.equal(pdfExtract?.providers[0]?.status, 'unknown');
});
