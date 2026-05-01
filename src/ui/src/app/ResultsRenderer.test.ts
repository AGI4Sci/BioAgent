import assert from 'node:assert/strict';
import test from 'node:test';
import { coerceReportPayload } from './ResultsRenderer';
import type { RuntimeArtifact } from '../domain';

test('coerceReportPayload extracts report refs from backend ToolPayload text instead of rendering raw JSON', () => {
  const payloadText = [
    'Let me inspect the prior attempts before returning the result.',
    '',
    'Returning the existing result as a ToolPayload.',
    '',
    '```json',
    '{',
    '  "message": "成功检索 10 篇论文，生成详细 Markdown 阅读报告。",',
    '  "uiManifest": [{"componentId": "paper-card-list"}],',
    '  "artifacts": [{',
    '    "id": "research-report",',
    '    "type": "research-report",',
    '    "data": {',
    '      "markdownRef": ".bioagent/tasks/generated-literature/report/arxiv-agent-reading-report.md"',
    '    }',
    '  }]',
    '}',
    '```',
  ].join('\n');
  const artifact: RuntimeArtifact = {
    id: 'research-report',
    type: 'research-report',
    producerScenario: 'literature-evidence-review',
    schemaVersion: '1',
    data: { markdown: payloadText },
  };

  const report = coerceReportPayload({ markdown: payloadText }, artifact);

  assert.equal(report.reportRef, '.bioagent/tasks/generated-literature/report/arxiv-agent-reading-report.md');
  assert.match(report.markdown ?? '', /Markdown report/);
  assert.doesNotMatch(report.markdown ?? '', /"uiManifest"/);
});

test('coerceReportPayload keeps normal markdown report bodies unchanged', () => {
  const markdown = '# Real Report\n\nThis is the user-facing paper reading report.';
  const report = coerceReportPayload({ markdown });

  assert.equal(report.markdown, markdown);
  assert.equal(report.reportRef, undefined);
});
