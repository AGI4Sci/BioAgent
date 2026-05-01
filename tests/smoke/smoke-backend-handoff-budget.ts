import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BACKEND_HANDOFF_BUDGET, normalizeBackendHandoff } from '../../src/runtime/workspace-task-input.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-handoff-budget-'));
const hugeText = 'STDOUT-LINE '.repeat(80_000);
const hugeJson = {
  rows: Array.from({ length: 12_000 }, (_, index) => ({
    id: index,
    gene: `GENE${index}`,
    score: index / 10,
    note: 'long-json-cell '.repeat(10),
  })),
};
const pngDataUrl = `data:image/png;base64,${Buffer.from('fake-png-binary'.repeat(40_000)).toString('base64')}`;
const priorAttempts = Array.from({ length: 40 }, (_, index) => ({
  id: `attempt-${index}`,
  attempt: index,
  status: 'failed-with-reason',
  stdoutRef: `.bioagent/logs/attempt-${index}.stdout.log`,
  stderrRef: `.bioagent/logs/attempt-${index}.stderr.log`,
  stdout: hugeText,
  stderr: `${hugeText} stderr ${index}`,
  failureReason: `failure ${index} ${hugeText}`,
  schemaErrors: Array.from({ length: 100 }, (_, errorIndex) => `schema ${errorIndex} ${hugeText.slice(0, 500)}`),
}));

const result = await normalizeBackendHandoff({
  agent: { id: 'bioagent-test', backend: 'test' },
  input: {
    text: `Generate a task from compact context\n${hugeText}`,
    metadata: { purpose: 'contract-test' },
    stdout: hugeText,
    stderr: `${hugeText} stderr-root`,
  },
  artifacts: [
    {
      id: 'large-json',
      type: 'research-report',
      dataRef: '.bioagent/artifacts/large-json.json',
      data: hugeJson,
    },
    {
      id: 'binary-image',
      type: 'image-preview',
      mimeType: 'image/png',
      dataRef: '.bioagent/artifacts/image.png',
      data: pngDataUrl,
    },
  ],
  priorAttempts,
}, {
  workspacePath: workspace,
  purpose: 'contract-test',
});

const serialized = JSON.stringify(result.payload);
assert.ok(result.normalizedBytes <= DEFAULT_BACKEND_HANDOFF_BUDGET.maxPayloadBytes, `handoff exceeded budget: ${result.normalizedBytes}`);
assert.ok(serialized.length <= DEFAULT_BACKEND_HANDOFF_BUDGET.maxPayloadBytes, `serialized handoff exceeded budget: ${serialized.length}`);
assert.ok(!serialized.includes(hugeText.slice(0, 50_000)), 'large stdout leaked inline');
assert.ok(!serialized.includes(pngDataUrl.slice(0, 50_000)), 'binary image leaked inline');

const payload = result.payload as Record<string, unknown>;
const manifest = payload._bioagentHandoffManifest as Record<string, unknown>;
assert.equal(manifest.rawRef, result.rawRef);
assert.equal(typeof manifest.rawSha1, 'string');
const input = payload.input as Record<string, unknown>;
assert.equal(typeof input.text, 'string', 'backend input.text must remain a string for AgentServer compatibility');
assert.ok(isRecord(input.textSummary), 'large backend input.text should carry a structured summary');

const rawPath = join(workspace, result.rawRef);
assert.ok((await stat(rawPath)).size > result.normalizedBytes, 'raw handoff ref should preserve full data');
const raw = await readFile(rawPath, 'utf8');
assert.ok(raw.includes(hugeText.slice(0, 50_000)), 'raw handoff ref should contain full stdout');
assert.ok(raw.includes(pngDataUrl.slice(0, 50_000)), 'raw handoff ref should contain full image data');

const artifacts = payload.artifacts as Array<Record<string, unknown>>;
assert.equal(artifacts[0].dataOmitted, true);
assert.equal(artifacts[0].dataRef, '.bioagent/artifacts/large-json.json');
assert.equal(artifacts[1].dataOmitted, true);
assert.equal(artifacts[1].dataRef, '.bioagent/artifacts/image.png');
assert.ok(isRecord(artifacts[1].dataSummary));
assert.equal((artifacts[1].dataSummary as Record<string, unknown>).reason, 'binary-artifact-data');

const attempts = payload.priorAttempts as Record<string, unknown>;
assert.equal(attempts.kind, 'prior-attempts');
assert.equal(attempts.itemCount, 40);
assert.ok((attempts.attempts as unknown[]).length <= DEFAULT_BACKEND_HANDOFF_BUDGET.maxPriorAttempts);

console.log('[ok] backend handoff budget keeps large artifacts, binary images, stdout, and prior attempts compact with raw refs');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
