import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLongformRegression, recordLongformEvidence } from '../../tools/longform-regression';

const outRoot = await mkdtemp(join(tmpdir(), 'sciforge-longform-evidence-'));
const [prepared] = await prepareLongformRegression({
  scenario: 'longform-literature-evidence-report',
  outRoot,
  runId: 'record-evidence-fixture',
});

await recordLongformEvidence({
  manifestPath: prepared.manifestPath,
  evidence: {
    kind: 'artifact',
    artifact: {
      id: 'final-report',
      type: 'research-report',
      path: '.sciforge/reports/final.md',
      round: 6,
      status: 'produced',
      summary: 'Report explains reference impact.',
    },
  },
});
await recordLongformEvidence({
  manifestPath: prepared.manifestPath,
  evidence: {
    kind: 'artifact',
    artifact: {
      id: 'final-report',
      type: 'research-report',
      path: '.sciforge/reports/final-v2.md',
      status: 'produced',
    },
  },
});
await recordLongformEvidence({
  manifestPath: prepared.manifestPath,
  evidence: {
    kind: 'execution-unit',
    executionUnit: {
      id: 'EU-final',
      tool: 'sciforge.longform',
      status: 'done',
      logRef: '.sciforge/logs/final.log',
      artifactRefs: ['final-report'],
    },
  },
});
await recordLongformEvidence({
  manifestPath: prepared.manifestPath,
  evidence: {
    kind: 'screenshot',
    screenshot: {
      id: 'browser-final',
      path: 'screenshots/browser-final.png',
      round: 6,
      caption: 'Browser final object chip evidence.',
    },
  },
});

const manifest = JSON.parse(await readFile(prepared.manifestPath, 'utf8')) as typeof prepared.manifest;
assert.equal(manifest.artifacts.length, 1);
assert.equal(manifest.artifacts[0].path, '.sciforge/reports/final-v2.md');
assert.equal(manifest.artifacts[0].round, 6);
assert.equal(manifest.executionUnits.length, 1);
assert.equal(manifest.executionUnits[0].logRef, '.sciforge/logs/final.log');
assert.equal(manifest.screenshots.length, 1);
assert.equal(manifest.screenshots[0].caption, 'Browser final object chip evidence.');

console.log('[ok] longform evidence recorder smoke passed');
