import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { GatewayRequest } from '../runtime-types.js';
import { directContextFastPathPayload, requestWithDirectContextReadableArtifactData } from './direct-context-fast-path.js';

function directDecision(
  intent: 'context-summary' | 'context-summary:risk' | 'context-summary:method' | 'context-summary:timeline' | 'run-diagnostic' | 'artifact-status' | 'capability-status' | 'fresh-execution' | 'unknown' = 'context-summary',
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 'sciforge.direct-context-decision.v1',
    decisionRef: `decision:test-${intent}`,
    decisionOwner: 'agentserver',
    intent,
    requiredTypedContext: intent === 'capability-status'
      ? ['capability-registry', 'provider-registry']
      : ['current-session-context'],
    usedRefs: ['artifact:research-report'],
    sufficiency: 'sufficient',
    allowDirectContext: true,
    ...overrides,
  };
}

function appliedDirectContextPolicy(decision = directDecision()) {
  return {
    applicationStatus: 'applied',
    policySource: 'python-conversation-policy',
    directContextDecision: decision,
    harnessContract: { directContextDecision: decision },
    executionModePlan: { executionMode: 'direct-context-answer' },
    responsePlan: { initialResponseMode: 'direct-context-answer' },
    latencyPolicy: { blockOnContextCompaction: false },
  };
}

function canonicalDirectDecision(
  intent: 'context-summary' | 'context-summary:risk' | 'context-summary:method' | 'context-summary:timeline' | 'run-diagnostic' | 'artifact-status' | 'capability-status' | 'fresh-execution' | 'unknown' = 'context-summary',
  overrides: Record<string, unknown> = {},
) {
  return {
    harnessContract: {
      directContextDecision: directDecision(intent, overrides),
    },
    directContextDecision: directDecision(intent, overrides),
  };
}

test('context follow-up protocol enables direct context answer even when AgentServer is configured', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'What tools and refs were used for the previous result?',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/report.md' },
    }],
    uiState: {
      directContextDecision: directDecision(),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary:risk'),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      agentHarness: {
        contract: {
          schemaVersion: 'sciforge.agent-harness-contract.v1',
          intentMode: 'audit',
          capabilityPolicy: { preferredCapabilityIds: ['runtime.direct-context-answer'] },
        },
      },
      recentExecutionRefs: [{
        id: 'unit-report',
        tool: 'capability.report.generate',
        outputRef: '.sciforge/task-results/report.json',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.artifacts[0]?.type, 'runtime-context-summary');
  assert.match(payload.message, /research-report|report/i);
});

test('direct context fast path yields to backend when prompt negates answer-only and requires writeback', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要只回答，必须实际写回/覆盖已有交付物文件。请更新并保存 research-package/project-brief.md、decision-log.md、risk-register.md、timeline-budget.md，并复核 Total 是 $80,000 / 100%。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'timeline-budget',
      type: 'markdown',
      path: 'research-package/timeline-budget.md',
      data: { markdown: '# Timeline\n\nTotal: $120,000 / 100%' },
    }],
    uiState: {
      directContextDecision: directDecision(),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary'),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
      currentReferences: [{
        id: 'selected-qc',
        kind: 'artifact',
        ref: 'artifact:timeline-budget',
        label: 'Timeline Budget',
        summary: 'stale selected reference',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('context follow-up summarizes risk claims from current context instead of dumping refs', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Continue from the current memo artifact only. Summarize the two risks in one short Chinese paragraph. No web or external provider.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'current-memo',
      type: 'research-report',
      data: {
        markdown: '风险 1：上下文窗口膨胀可能导致投影漂移。风险 2：多阶段状态恢复不一致可能导致重复 repair。',
      },
      metadata: { reportRef: '.sciforge/task-results/current-memo.md' },
    }],
    uiState: {
      directContextDecision: directDecision(),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary:risk'),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /上下文窗口膨胀/);
  assert.match(payload.message, /状态恢复不一致/);
  assert.doesNotMatch(payload.message, /^1\./m);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
});

test('answer-only continuation transform returns checklist from prior visible answer context', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Continue previous answer: compress the three points into one checklist and explicitly reuse previous conclusion. No new search, no code.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['paper-list', 'evidence-matrix', 'notebook-timeline'],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: {
        markdown: 'Primer design checks GC content and Tm so primers bind stably. It screens hairpins and primer-dimers to avoid self-amplification. It checks specificity, often with BLAST, so the assay amplifies only the intended target.',
      },
      metadata: { reportRef: '.sciforge/task-results/research-report.md' },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report'],
          transformMode: 'answer-only-checklist',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /Checklist from the previous visible answer/);
  assert.match(payload.message, /GC content and Tm/);
  assert.match(payload.message, /hairpins and primer-dimers/);
  assert.match(payload.message, /specificity/);
  const displayIntent = payload.displayIntent;
  assert.ok(displayIntent);
  assert.equal(displayIntent.taskOutcome, 'satisfied');
  assert.doesNotMatch(payload.message, /sciforge\.agentserver|generated workspace task/i);
});

test('bounded previous evidence-matrix follow-up uses direct-context hypotheses without AgentServer policy', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Based only on the previous evidence matrix, compress it into 3 testable hypotheses with supporting rows, minimal validation experiment, and failure mode. Do not perform a new search.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'evidence-matrix-provider-recovery',
      type: 'evidence-matrix',
      data: {
        rows: [
          {
            claim: 'Spatial Analysis of Intraductal Papillary Mucinous Neoplasms defines a Keratin 17-positive epithelial population.',
            method: 'spatial analysis in pancreatic precursor lesions',
            'main result': 'PMID:41638478',
            limitations: 'metadata-only provider result',
            'citation/ref': 'doi:10.1016/j.jcmgh.2026.101749',
          },
          {
            claim: 'Integrative multimodal transcriptomics identifies a cancer-associated fibroblast membrane signature.',
            method: 'multimodal transcriptomics / CAF analysis',
            'main result': 'PMID:41942785',
            limitations: 'requires full-text verification',
            'citation/ref': 'doi:10.1007/s00109-026-02669-7',
          },
          {
            claim: 'Spatially-resolved subtype progression reveals metabolic vulnerabilities in pancreatic ductal adenocarcinoma.',
            method: 'spatial subtype and metabolic-state analysis',
            'main result': 'PMID:41896850',
            limitations: 'platform transfer risk',
            'citation/ref': 'doi:10.1186/s12943-026-02628-3',
          },
        ],
      },
    }],
    uiState: {},
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /Answered directly from the existing evidence matrix/);
  assert.match(payload.message, /Hypothesis 1/);
  assert.match(payload.message, /Minimal validation experiment/i);
  assert.match(payload.message, /Main failure mode/i);
  assert.match(payload.message, /41638478|10\.1016/);
});

test('bounded protocol budget follow-up answers from current artifact without AgentServer policy', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '如果预算降到 72 libraries，应该如何修改这个 protocol？请基于当前 protocol artifact 回答，并继续标明是否 needs-work/blocker。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'artifact-protocol-review',
      type: 'research-report',
      title: 'Longitudinal Microbiome RCT Protocol',
      data: {
        markdown: [
          '# Longitudinal Microbiome RCT Protocol',
          '36 IBS patients, probiotic vs placebo.',
          'Stool metagenomics at baseline, week 4, and week 8; 108 sequencing libraries max.',
          'Symptom score change can also be described as week 0 to week 8 in clinical notes.',
          'Primary endpoint: IBS-SSS change from baseline to week 8.',
          'Sample size and power: 36 patients only; power drops and this is needs-work.',
          'Antibiotic exposure not fully excludable; blocker for causal inference.',
        ].join('\n'),
      },
    }],
    uiState: {},
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /不启动新的 workspace task/);
  assert.match(payload.message, /36 名患者/);
  assert.match(payload.message, /从 3 个时间点压缩为 2 个时间点/);
  assert.match(payload.message, /baseline\/基线 \+ week 8|baseline \+ week 8/);
  assert.match(payload.message, /删除\/取消的时间点：week 4/);
  assert.match(payload.message, /72 libraries/);
  assert.match(payload.message, /needs-work/);
  assert.match(payload.message, /blocker/);
  assert.doesNotMatch(payload.message, /week 0/);
  assert.doesNotMatch(payload.message, /AgentServer generation|workspace task was started/i);
});

test('bounded previous evidence-matrix follow-up hydrates artifacts from session bundle', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-direct-context-session-'));
  const bundle = join(workspace, '.sciforge', 'sessions', '2026-05-16_literature-evidence-review_session-literature-evidence-review-test');
  await mkdir(join(bundle, 'records'), { recursive: true });
  await mkdir(join(bundle, 'artifacts'), { recursive: true });
  await writeFile(join(bundle, 'records', 'session.json'), JSON.stringify({
    sessionId: 'session-literature-evidence-review-test',
    scenarioId: 'literature-evidence-review',
    artifacts: [],
  }, null, 2));
  await writeFile(join(bundle, 'artifacts', 'evidence-matrix-provider-recovery.json'), JSON.stringify({
    id: 'evidence-matrix-provider-recovery',
    type: 'evidence-matrix',
    data: {
      rows: [{
        claim: 'Spatial Analysis of Intraductal Papillary Mucinous Neoplasms defines a Keratin 17-positive epithelial population.',
        method: 'spatial analysis in pancreatic precursor lesions',
        'main result': 'PMID:41638478',
        limitations: 'metadata-only provider result',
        'citation/ref': 'doi:10.1016/j.jcmgh.2026.101749',
      }],
    },
  }, null, 2));

  const request: GatewayRequest = {
    skillDomain: 'literature',
    workspacePath: workspace,
    prompt: 'Based only on the previous evidence matrix artifact, compress it into 3 testable hypotheses with supporting rows, minimal validation experiment, and failure mode. Do not perform a new search.',
    artifacts: [],
    uiState: { sessionId: 'session-literature-evidence-review-test' },
  };

  const enriched = await requestWithDirectContextReadableArtifactData(request);
  const payload = directContextFastPathPayload(enriched);

  assert.equal(enriched.artifacts[0]?.id, 'evidence-matrix-provider-recovery');
  assert.ok(payload);
  assert.match(payload.message, /Hypothesis 1/);
  assert.match(payload.message, /41638478|10\.1016/);
});

test('harness transformMode drives answer-only compression without prompt regex', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Please make this terse from the already visible material.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['paper-list'],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: {
        markdown: 'The prior conclusion says assay specificity is the main constraint. Primer-dimer risk is secondary. Reuse the validated target region.',
      },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report'],
          transformMode: 'answer-only-compress',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Direct answer from the previous visible answer/);
  assert.match(payload.message, /assay specificity/);
  assert.equal(payload.executionUnits[0]?.status, 'done');
});

test('structured method summary intent selects method snippets without prompt domain regex', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Give me a short recap.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'method-note',
      type: 'research-report',
      data: {
        markdown: 'Method: retrieve seed papers, screen abstracts, then extract evidence tables. Risk: source coverage can drift if provider routes change.',
      },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary:method', { usedRefs: ['artifact:method-note'] }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /retrieve seed papers/);
  assert.doesNotMatch(payload.message, /source coverage can drift/);
});

test('visible analysis report follow-up reads bounded report body and answers the scientific question', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-direct-context-'));
  const reportRel = 'analysis_report.md';
  await writeFile(join(workspace, reportRel), [
    '# Simulated Experiment Analysis Report',
    '## Treatment Effect',
    '- control mean = 109.66; drugA mean = 122.06.',
    '- Cohen’s d = 1.029, indicating a large positive drugA effect.',
    '- Two-way ANOVA treatment p = 1.1474e-04; reject H0.',
    '## Batch and Timepoint',
    '- Batch was modeled as a fixed effect with means B1 = 115.7, B2 = 114.4, B3 = 117.46.',
    '- Timepoint means were 0h = 106.95, 24h = 112.84, 48h = 127.78.',
    '## Limitations',
    '- No interaction terms (treatment×batch, treatment×timepoint) included.',
    '- Mixed models may be more appropriate for batch as random.',
    '- Normality and homogeneity of variances are assumed.',
  ].join('\n'));
  const request: GatewayRequest = {
    skillDomain: 'omics',
    workspacePath: workspace,
    prompt: 'Based on the visible analysis report from Round 1, explain the main conclusion of the treatment effect. Identify batch/timepoint confounders and propose three robustness checks.',
    artifacts: [{
      id: 'analysis-report',
      type: 'research-report',
      metadata: { reportRef: reportRel },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', { usedRefs: ['artifact:analysis-report'] }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const enriched = await requestWithDirectContextReadableArtifactData(request);
  const payload = directContextFastPathPayload(enriched);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /Cohen/);
  assert.match(payload.message, /1\.1474e-04/);
  assert.match(payload.message, /Batch/);
  assert.match(payload.message, /interaction/i);
  assert.doesNotMatch(payload.message, /^Summary from the selected reference/m);
});

test('answer-only continuation transform ignores unreadable digest and path-only refs', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Compress the previous answer into a three-item checklist. Use only the previous answer; no search, no code.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/research-report.md' },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report',
      title: 'research report',
      summary: 'artifact:research-report',
    }],
    uiState: {
      currentReferenceDigests: [{
        sourceRef: 'artifact:research-report',
        digestText: 'Reference path was not readable inside the workspace.',
      }],
      claims: [{
        id: 'claim-visible-answer',
        type: 'answer',
        text: 'ConversationProjection is authoritative. It keeps visible results auditable. It prevents stale raw backend output from competing with the final answer.',
      }],
      recentExecutionRefs: [{
        id: 'agentserver-direct',
        outputRef: '.sciforge/task-results/agentserver-direct.json',
        stdoutRef: '.sciforge/logs/agentserver.stdout.log',
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report', 'claim:claim-visible-answer'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /ConversationProjection is authoritative/);
  assert.match(payload.message, /visible results auditable/);
  assert.match(payload.message, /prevents stale raw backend output/);
  assert.doesNotMatch(payload.message, /Reference path was not readable/);
  assert.doesNotMatch(payload.message, /\.sciforge/);
});

test('selected artifact summary uses structured artifact data instead of unreadable artifact ref digest', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'use selected artifact only no rerun no tools summarize what it says in five bullets',
    agentServerBaseUrl: 'http://agentserver.example.test',
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report-kras-g12d',
      title: 'research-report-kras-g12d',
      summary: 'artifact:research-report-kras-g12d',
    }],
    artifacts: [{
      id: 'research-report-kras-g12d',
      type: 'research-report',
      dataRef: '.sciforge/sessions/session-a/artifacts/research-report-kras-g12d.json',
      data: {
        summary: 'KRAS G12D evidence centers on allele-specific biology and downstream MAPK signaling.',
        keyFindings: [
          'Covalent and non-covalent inhibitor programs should be separated when comparing evidence.',
          'Preclinical context should not be presented as clinical efficacy.',
          'The selected report calls for paper-level retrieval before comprehensive claims.',
        ],
        conclusion: 'The selected artifact is a bounded evidence framing report, not a full systematic review.',
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report-kras-g12d',
        title: 'research-report-kras-g12d',
      }],
      currentReferenceDigests: [{
        sourceRef: 'artifact:research-report-kras-g12d',
        status: 'unresolved',
        digestText: 'Reference path was not readable inside the workspace.',
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report-kras-g12d'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Summary from the selected reference/);
  assert.match(payload.message, /KRAS G12D evidence centers/);
  assert.match(payload.message, /Preclinical context should not be presented as clinical efficacy/);
  assert.doesNotMatch(payload.message, /Reference path was not readable/);
});

test('selected artifact summary ignores unrelated current-run diagnostic claims', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'use selected artifact only no rerun no tools summarize what it says in five bullets',
    agentServerBaseUrl: 'http://agentserver.example.test',
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report-kras-g12d',
      title: 'research-report-kras-g12d',
      summary: 'paper-list',
      payload: {
        currentReference: {
          id: 'artifact:research-report-kras-g12d',
          ref: 'artifact:research-report-kras-g12d',
          title: 'research-report-kras-g12d',
        },
      },
    }],
    artifacts: [{
      id: 'research-report-kras-g12d',
      type: 'research-report',
      data: {
        summary: 'KRAS G12D report compares mutation prevalence, inhibitor evidence, and evidence limitations.',
        keyFindings: [
          'KRAS G12D is discussed across pancreatic, colorectal, and lung cancer contexts.',
          'MRTX1133 and related inhibitor programs are framed as emerging preclinical evidence.',
          'Combination therapy hypotheses need paper-level verification before strong clinical claims.',
        ],
        conclusion: 'The selected artifact is an evidence framing report with explicit limitations.',
      },
    }, {
      id: 'artifact-summary-bullets',
      type: 'runtime-context-summary',
      data: {
        markdown: 'Selected Artifact Summary\nThe selected artifact content was not available in the workspace.',
      },
    }],
    uiState: {
      claims: [{
        id: 'claim-unreadable',
        type: 'prediction',
        text: 'Reference path was not readable inside the workspace.',
      }, {
        id: 'claim-prior-summary',
        type: 'prediction',
        text: 'Selected Artifact Summary\nThe selected artifact content was not available in the workspace.',
      }],
      currentReferenceDigests: [{
        sourceRef: 'artifact:research-report-kras-g12d',
        status: 'unresolved',
        digestText: 'Reference path was not readable inside the workspace.',
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report-kras-g12d'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Summary from the selected reference/);
  assert.match(payload.message, /mutation prevalence/);
  assert.match(payload.message, /MRTX1133/);
  assert.doesNotMatch(payload.message, /Reference path was not readable/);
  assert.doesNotMatch(payload.message, /content was not available/);
});

test('selected workspace file summary can come from current ui references without top-level references', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use the selected patch report only. No rerun, no tools. Write a PR summary and risk checklist.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    references: [],
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: {
        markdown: 'Generated workspace task failed before producing the requested report.',
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p4/rcg-004-preflight-patch-report.md',
        title: 'rcg-004-preflight-patch-report.md',
        payload: {
          selectedText: [
            'Patch Summary: generatedTaskPayloadPreflightForTaskInput now preserves stable issue id, kind, and clipped evidence.',
            'Risk checklist: verify current-reference gate false positives and selected-file direct-context follow-up in browser.',
          ].join(' '),
        },
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['file:workspace/parallel/p4/rcg-004-preflight-patch-report.md'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Summary from the selected reference/);
  assert.match(payload.message, /preserves stable issue id, kind, and clipped evidence/);
  assert.match(payload.message, /selected-file direct-context follow-up/);
  assert.doesNotMatch(payload.message, /Generated workspace task failed/);
});

test('selected chart-only sufficiency follow-up stays direct-context and does not use sibling artifacts', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use only the selected chart artifact. Can this chart alone support the drugA@48h statistical significance and batch-confounding conclusion? If not, say exactly what is missing. Do not use the report, CSV, prior run text, or history.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['evidence-matrix', 'notebook-timeline'],
    references: [{
      kind: 'artifact',
      ref: 'artifact:boxplot_response',
      title: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
      payload: {
        currentReference: {
          id: 'chat-key-boxplot_response',
          kind: 'artifact',
          ref: 'artifact:boxplot_response',
          artifactType: 'image-png',
          title: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
          provenance: {
            path: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
          },
        },
      },
    }],
    artifacts: [{
      id: 'report',
      type: 'research-report',
      data: {
        markdown: 'UNSELECTED report says p-value=0.00001 and batch B3 confounding was controlled.',
      },
    }, {
      id: 'evidence_matrix',
      type: 'evidence-matrix',
      data: {
        rows: [{ claim: 'UNSELECTED evidence matrix with adjusted model p-value.' }],
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:boxplot_response',
        title: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
        payload: {
          objectReference: {
            id: 'chat-key-boxplot_response',
            kind: 'artifact',
            ref: 'artifact:boxplot_response',
            artifactType: 'image-png',
            title: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
            provenance: {
              path: '.sciforge/sessions/session-a/task-results/boxplot_response.png',
            },
          },
        },
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /Answered only from the selected chart reference/);
  assert.match(payload.message, /cannot by itself establish statistical significance/);
  assert.match(payload.message, /Missing for statistical significance/);
  assert.match(payload.message, /Missing for batch confounding/);
  assert.doesNotMatch(payload.message, /p-value=0\.00001|UNSELECTED|evidence matrix/i);
  const refs = payload.objectReferences?.map((reference) => reference.ref);
  assert.deepEqual(refs, ['artifact:boxplot_response']);
  const audit = JSON.parse(String(payload.executionUnits[0]?.params ?? '{}'));
  assert.ok(audit.directContextGate.usedContextRefs.includes('artifact:boxplot_response'));
  assert.doesNotMatch(audit.directContextGate.usedContextRefs.join('\n'), /UNSELECTED|evidence_matrix|evidence-matrix|report|csv/i);
});

test('selected QC/missingness follow-up uses table values instead of chart-only wording', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Using only the selected missingness-report artifact, decide whether missingness, outliers, and protocol deviations alone are enough to prove or overturn the treatment-effect conclusion. Do not use unselected reports, CSVs, or charts.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['research-report', 'notebook-timeline'],
    references: [{
      kind: 'artifact',
      ref: 'artifact:missingness-report',
      title: 'missingness_report.csv',
      payload: {
        currentReference: {
          id: 'chat-key-missingness-report',
          kind: 'artifact',
          ref: 'artifact:missingness-report',
          artifactType: 'csv',
          title: 'missingness_report.csv',
        },
      },
    }],
    artifacts: [{
      id: 'missingness-report',
      type: 'csv',
      data: {
        text: [
          'metric,count,percent',
          'Total patients,165,100.0',
          'Missing baseline severity,14,8.5',
          'Missing outcome week 8,11,6.7',
          'Outcome outliers,3,1.8',
          'Protocol deviations,24,14.5',
        ].join('\n'),
      },
    }, {
      id: 'analysis-report',
      type: 'research-report',
      data: {
        markdown: 'UNSELECTED report says treatment p-value=0.00001 and sensitivity is definitive.',
      },
    }, {
      id: 'heatmap-chart',
      type: 'image-png',
      dataRef: '.sciforge/task-results/missingness_heatmap.png',
      summary: 'UNSELECTED chart artifact.',
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:missingness-report',
        title: 'missingness_report.csv',
        payload: {
          objectReference: {
            id: 'chat-key-missingness-report',
            kind: 'artifact',
            ref: 'artifact:missingness-report',
            artifactType: 'csv',
            title: 'missingness_report.csv',
          },
        },
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /selected QC\/missingness reference/);
  assert.match(payload.message, /missing baseline severity: 14 \(8.5%\)/);
  assert.match(payload.message, /missing outcome week 8: 11 \(6.7%\)/);
  assert.match(payload.message, /outcome outliers: 3 \(1.8%\)/);
  assert.match(payload.message, /protocol deviations: 24 \(14.5%\)/);
  assert.doesNotMatch(payload.message, /selected chart|single chart|A single chart|p-value=0\.00001|sensitivity is definitive|UNSELECTED chart artifact/i);
  const audit = JSON.parse(String(payload.executionUnits[0]?.params ?? '{}'));
  assert.ok(audit.directContextGate.usedContextRefs.includes('artifact:missingness-report'));
  assert.doesNotMatch(audit.directContextGate.usedContextRefs.join('\n'), /analysis-report|heatmap|UNSELECTED|p-value/i);
});

test('selected QC/missingness follow-up hydrates csv table values from ui artifacts', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-direct-context-qc-'));
  const csvRel = 'task-results/missingness_report.csv';
  await mkdir(join(workspace, 'task-results'), { recursive: true });
  await writeFile(join(workspace, csvRel), [
    'metric,count,percent',
    'Total patients,165,100.0',
    'Missing baseline severity,14,8.5',
    'Missing outcome week 8,11,6.7',
    'Outcome outliers,3,1.8',
    'Protocol deviations,24,14.5',
  ].join('\n'));

  const request: GatewayRequest = {
    skillDomain: 'literature',
    workspacePath: workspace,
    prompt: 'Using only the selected missingness-report artifact, use the table values to decide whether missingness, outliers, and protocol deviations alone are enough to prove or overturn the treatment-effect conclusion. Do not use unselected reports, CSVs, or charts.',
    artifacts: [],
    references: [{
      kind: 'artifact',
      ref: 'artifact:missingness-report',
      title: 'missingness-report',
      payload: {
        currentReference: {
          id: 'chat-key-missingness-report',
          kind: 'artifact',
          ref: 'artifact:missingness-report',
          artifactType: 'csv',
          title: 'missingness-report',
        },
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:missingness-report',
        title: 'missingness-report',
        payload: {
          objectReference: {
            id: 'chat-key-missingness-report',
            kind: 'artifact',
            ref: 'artifact:missingness-report',
            artifactType: 'csv',
            title: 'missingness-report',
          },
        },
      }],
      artifacts: [{
        id: 'missingness-report',
        type: 'csv',
        dataRef: csvRel,
        data: {
          content: 'fields: content',
        },
      }, {
        id: 'missingness-heatmap',
        type: 'image-png',
        dataRef: 'task-results/missingness_heatmap.png',
        summary: 'UNSELECTED heatmap chart.',
      }],
    },
  };

  const hydrated = await requestWithDirectContextReadableArtifactData(request);
  const payload = directContextFastPathPayload(hydrated);

  assert.ok(payload);
  assert.match(payload.message, /missing baseline severity: 14 \(8.5%\)/);
  assert.match(payload.message, /missing outcome week 8: 11 \(6.7%\)/);
  assert.match(payload.message, /outcome outliers: 3 \(1.8%\)/);
  assert.match(payload.message, /protocol deviations: 24 \(14.5%\)/);
  assert.doesNotMatch(payload.message, /selected chart|UNSELECTED heatmap|does not expose enough grouped/i);
  const refs = payload.objectReferences?.map((reference) => reference.ref).join('\n') ?? '';
  assert.match(refs, /missingness_report\.csv/);
  assert.doesNotMatch(refs, /heatmap/i);
});

test('selected reproduction report credibility follow-up does not become a planning register', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    'Reproduction success: YES',
    '',
    '| parameter | true | fitted | percent error |',
    '| --- | ---: | ---: | ---: |',
    '| r | 0.5000 | 0.4767 | 4.67% |',
    '| K | 200.0 | 201.5 | 0.77% |',
    '',
    'RMSE: 4.3505',
    '',
    'This is a toy synthetic noisy logistic-growth reproduction with a fixed seed.',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Using only the selected reproduction report, tell me whether this toy reproduction is credible. List the exact metrics that support the verdict, the biggest remaining risk, and one next validation step. Do not use unrelated previous diagnostics.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    references: [],
    artifacts: [],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'generated-literature-8ef4985b7dc3-reproduction-report.md',
        payload: { selectedText: reportMarkdown },
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Answered directly from the selected report/);
  assert.match(payload.message, /Reproduction success: YES/);
  assert.match(payload.message, /r true 0\.5000, fitted 0\.4767, error 4\.67%/);
  assert.match(payload.message, /K true 200\.0, fitted 201\.5, error 0\.77%/);
  assert.match(payload.message, /RMSE 4\.3505/);
  assert.match(payload.message, /synthetic data|fixed seed|toy setup/);
  assert.match(payload.message, /multiple random seeds and noise levels/);
  assert.doesNotMatch(payload.message, /Planning register/);
  assert.doesNotMatch(payload.message, /## Budget/);
});

test('selected reproduction report pass/fail audit answers latest metric audit intent', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    '| Parameter | True Value | Fitted Value | Error (%) |',
    '|-----------|------------|--------------|-----------|',
    '| r         | 0.5000    | 0.4767      | 4.67%    |',
    '| K         | 200.0    | 201.5      | 0.77%    |',
    '| RMSE      | —          | 4.3505      | —         |',
    '',
    '**Reproduction success: YES**',
    '',
    '- r error: 4.67% (threshold 15%) → PASS',
    '- K error: 0.77% (threshold 15%) → PASS',
    '- RMSE: 4.3505 (threshold 15) → PASS',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '只基于当前选中的 reproduction-report，逐项核对报告中的 PASS/FAIL：r、K、RMSE 的 true/fitted/error/threshold 是多少？有没有任何一个没达标？不要泛泛总结。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'old-direct-context-summary',
      type: 'runtime-context-summary',
      data: {
        markdown: 'UNSELECTED old answer says Credibility verdict: credible as a toy reproduction.',
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'reproduction-report',
        payload: { selectedText: reportMarkdown },
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.displayIntent?.taskOutcome, 'satisfied');
  assert.match(payload.message, /只基于当前选中的 reproduction-report/);
  assert.match(payload.message, /r: true=0\.5000; fitted=0\.4767; error=4\.67%; threshold=15%; verdict=PASS/);
  assert.match(payload.message, /K: true=200\.0; fitted=201\.5; error=0\.77%; threshold=15%; verdict=PASS/);
  assert.match(payload.message, /RMSE: true=未给出\/不适用; fitted=4\.3505; error=未给出\/不适用; threshold=15; verdict=PASS/);
  assert.match(payload.message, /未达标项：没有/);
  assert.doesNotMatch(payload.message, /Credibility verdict|Biggest remaining risk|UNSELECTED/i);
});

test('selected reproduction report literal fact follow-up does not reuse credibility summary', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    '## Notes',
    '- Random seed: 42',
    '- Optimizer: differential_evolution (polish=True) → fallback least_squares if needed Headings: Logistic Growth Parameter Estimation – Reproduction Report',
    '- Bounds: r in [0.01, 2.0], K in [50, 500]',
  ].join(' ');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '只基于当前选中的 reproduction-report，报告里的 Random seed 是几？Optimizer 是什么？请只回答这两项，不要给可信度总结。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'old-direct-context-summary',
      type: 'runtime-context-summary',
      data: {
        markdown: 'UNSELECTED old answer says Credibility verdict: credible as a toy reproduction.',
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'reproduction-report',
        payload: { selectedText: reportMarkdown },
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /Random seed: 42/);
  assert.match(payload.message, /Optimizer: differential_evolution/);
  const answerLines = payload.message.split(/\r?\n/).map((line) => line.trim());
  assert.ok(answerLines.includes('- Random seed: 42'));
  assert.doesNotMatch(answerLines.find((line) => /Optimizer/i.test(line)) ?? '', /Headings/i);
  assert.doesNotMatch(answerLines.find((line) => /Optimizer/i.test(line)) ?? '', /Bounds/i);
  assert.doesNotMatch(payload.message, /Credibility verdict|Biggest remaining risk|UNSELECTED/i);
});

test('selected reproduction report evidence-boundary prompt is not mistaken for parameter bounds', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    'Synthetic data generated from logistic ODE with additive Gaussian noise.',
    '',
    '## Notes',
    '- Random seed: 42',
    '- Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed',
    '- Bounds: r in [0.01, 2.0], K in [50, 500]',
    '- Synthetic noise std: 5.0',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '只基于当前选中的 reproduction-report，这份报告不能证明哪些外推或稳健性结论？列 3 条证据边界，不要给可信度总结。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'reproduction-report',
        payload: { selectedText: reportMarkdown },
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /证据边界审计|不能证明/);
  assert.match(payload.message, /随机种子稳健性|噪声水平|真实数据|复杂模型|独立验证集/);
  assert.doesNotMatch(payload.message, /- Bounds: 报告未给出|Bounds:/);
  assert.doesNotMatch(payload.message, /可信度总结|Credibility verdict/i);
});

test('selected reproduction report generic support conclusion prompt uses evidence boundary instead of full-text status', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    'Synthetic data generated from logistic ODE with additive Gaussian noise.',
    '',
    '## Verdict',
    '**Reproduction success: YES**',
    '',
    '## Notes',
    '- Random seed: 42',
    '- Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed',
    '- Synthetic noise std: 5.0',
  ].join('\n');
  const filename = 'generated-literature-8ef4985b7dc3-reproduction-report.md';
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: `只基于文件 ${filename}，这份报告能否支持“真实世界复杂生物模型也已复现成功”的结论？请分成：报告内能支持的证据、不能外推的边界、最终结论。`,
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'reproduction-report',
      type: 'research-report',
      title: filename,
      data: { markdown: reportMarkdown },
      metadata: { reportRef: `.sciforge/task-results/${filename}` },
    }],
    uiState: {
      currentReferenceDigests: [{
        sourceRef: `.sciforge/task-results/${filename}`,
        digestText: 'Markdown digest: Synthetic data; random seed 42; reproduction success yes.',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /证据边界审计|不能外推/);
  assert.match(payload.message, /更复杂模型|真实科研复现|真实数据/);
  assert.doesNotMatch(payload.message, /arXiv PDF|全文调研|provider\/web_search|候选元数据/);
});

test('selected reproduction report counterfactual threshold audit stays direct-context and recomputes pass/fail', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    '| Parameter | True Value | Fitted Value | Error (%) |',
    '|-----------|------------|--------------|-----------|',
    '| r         | 0.5000    | 0.4767      | 4.67%    |',
    '| K         | 200.0    | 201.5      | 0.77%    |',
    '| RMSE      | —          | 4.3505      | —         |',
    '',
    '**Reproduction success: YES**',
    '',
    '- r error: 4.67% (threshold 15%) → PASS',
    '- K error: 0.77% (threshold 15%) → PASS',
    '- RMSE: 4.3505 (threshold 15) → PASS',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '反事实验收：如果新门槛改成 r error <= 1%、K error <= 1%、RMSE <= 3，这个 toy reproduction 是否仍可判成功？请逐项给 pass/fail，不要因为原报告写了 success 就默认成功。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['notebook-timeline'],
    artifacts: [],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'reproduction-report',
        payload: { selectedText: reportMarkdown },
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.displayIntent?.taskOutcome, 'satisfied');
  assert.match(payload.message, /是否仍可判成功：不能/);
  assert.match(payload.message, /r: observed error=4\.67%; new threshold<=1%; verdict=FAIL/);
  assert.match(payload.message, /K: observed error=0\.77%; new threshold<=1%; verdict=PASS/);
  assert.match(payload.message, /RMSE: observed value=4\.3505; new threshold<=3; verdict=FAIL/);
  assert.match(payload.message, /未达标项：r、RMSE/);
  assert.doesNotMatch(payload.message, /Credibility verdict|Biggest remaining risk/i);
});

test('explicit filename reproduction report question overrides stale selected runtime summary', () => {
  const reportMarkdown = [
    '# Logistic Growth ODE Parameter Estimation Reproduction Report',
    '',
    '| Parameter | True Value | Fitted Value | Error (%) |',
    '|-----------|------------|--------------|-----------|',
    '| r         | 0.5000    | 0.4767      | 4.67%    |',
    '| K         | 200.0    | 201.5      | 0.77%    |',
    '| RMSE      | —          | 4.3505      | —         |',
    '',
    '**Reproduction success: YES**',
    '',
    '- r error: 4.67% (threshold 15%) → PASS',
    '- K error: 0.77% (threshold 15%) → PASS',
    '- RMSE: 4.3505 (threshold 15) → PASS',
  ].join('\n');
  const filename = 'generated-literature-8ef4985b7dc3-reproduction-report.md';
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: `只基于文件 ${filename}：如果新门槛改成 r error <= 1%、K error <= 1%、RMSE <= 3，这个 toy reproduction 是否仍可判成功？请逐项给 pass/fail，不要给泛化可信度总结。`,
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['notebook-timeline'],
    artifacts: [{
      id: 'old-direct-context-summary',
      type: 'runtime-context-summary',
      data: {
        markdown: 'UNSELECTED old answer says Credibility verdict: credible as a toy reproduction. Missing expected artifacts: notebook-timeline.',
      },
    }, {
      id: 'generated-literature-8ef4985b7dc3-reproduction-report',
      type: 'research-report',
      title: filename,
      data: { markdown: reportMarkdown },
      metadata: {
        reportRef: `workspace/parallel/p3/${filename}`,
      },
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:old-direct-context-summary',
        title: 'old-direct-context-summary',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.displayIntent?.taskOutcome, 'satisfied');
  assert.match(payload.message, /是否仍可判成功：不能/);
  assert.match(payload.message, /r: observed error=4\.67%; new threshold<=1%; verdict=FAIL/);
  assert.match(payload.message, /K: observed error=0\.77%; new threshold<=1%; verdict=PASS/);
  assert.match(payload.message, /RMSE: observed value=4\.3505; new threshold<=3; verdict=FAIL/);
  assert.doesNotMatch(payload.message, /Credibility verdict|UNSELECTED|Missing expected artifacts/i);
  assert.deepEqual(payload.objectReferences?.map((reference) => reference.ref), [
    `workspace/parallel/p3/${filename}`,
  ]);
});

test('explicit filename report question expands digest hit to matching report artifact body', () => {
  const filename = 'generated-literature-8ef4985b7dc3-reproduction-report.md';
  const reportMarkdown = [
    '# Logistic Growth Parameter Estimation - Reproduction Report',
    '',
    '## Notes',
    '- Random seed: 42',
    '- Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed',
    '',
    '*Report generated by logistic_fit_demo.py*',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: `只基于文件 ${filename}，这份报告是否给出了完整 rerun command 和脚本路径？如果没有，不要补造，只列实际出现的命令、路径和缺口。`,
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'reproduction-report',
      type: 'research-report',
      title: 'reproduction-report',
      data: { markdown: reportMarkdown },
    }],
    uiState: {
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:old-direct-context-summary',
        title: 'old-direct-context-summary',
      }],
      currentReferenceDigests: [{
        sourceRef: `.sciforge/task-results/${filename}`,
        digestText: 'Markdown digest: Representative bullets: Random seed: 42; Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed Headings: Logistic Growth Parameter Estimation; Notes',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /完整 rerun command：未给出/);
  assert.match(payload.message, /脚本路径：logistic_fit_demo\.py（报告只给出脚本名，不是完整路径）/);
  assert.match(payload.message, /缺少可直接复制执行的完整命令/);
  assert.doesNotMatch(payload.message, /python logistic_fit_demo\.py|old-direct-context-summary|Headings/i);
  assert.ok(payload.objectReferences?.some((reference) => reference.ref === 'artifact:reproduction-report'));
});

test('explicit filename report follow-up hydrates session artifact when only stale runtime artifact is present', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-direct-context-filename-'));
  const filename = 'generated-literature-8ef4985b7dc3-reproduction-report.md';
  const bundle = join(workspace, '.sciforge', 'sessions', '2026-05-16_literature_session-explicit-file');
  const taskResults = join(bundle, 'task-results');
  const artifactDir = join(bundle, 'artifacts');
  await mkdir(taskResults, { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(taskResults, filename), [
    '# Logistic Growth Parameter Estimation - Reproduction Report',
    '',
    '## Notes',
    '- Random seed: 42',
    '- Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed',
    '',
    '*Report generated by logistic_fit_demo.py*',
  ].join('\n'));
  await writeFile(join(artifactDir, 'reproduction-report.json'), JSON.stringify({
    id: 'reproduction-report',
    type: 'research-report',
    title: 'reproduction-report',
    metadata: { reportRef: `.sciforge/sessions/2026-05-16_literature_session-explicit-file/task-results/${filename}` },
  }));
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: `只基于文件 ${filename}，这份报告是否给出了完整 rerun command 和脚本路径？如果没有，不要补造，只列实际出现的命令、路径和缺口。`,
    workspacePath: workspace,
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'old-direct-context-summary',
      type: 'runtime-context-summary',
      data: { markdown: 'UNSELECTED old answer says the report is credible.' },
    }],
    uiState: {
      sessionId: 'session-explicit-file',
      currentReferenceDigests: [{
        sourceRef: `.sciforge/sessions/2026-05-16_literature_session-explicit-file/task-results/${filename}`,
        digestText: 'Markdown digest: Representative bullets: Random seed: 42; Optimizer: differential_evolution (polish=True) -> fallback least_squares if needed Headings: Logistic Growth Parameter Estimation; Notes',
      }],
    },
  };

  const hydrated = await requestWithDirectContextReadableArtifactData(request);
  const payload = directContextFastPathPayload(hydrated);

  assert.ok(payload);
  assert.match(payload.message, /脚本路径：logistic_fit_demo\.py（报告只给出脚本名，不是完整路径）/);
  assert.doesNotMatch(payload.message, /UNSELECTED|Headings/i);
});

test('selected reproduction report rerun question does not invent missing command or full path', () => {
  const reportMarkdown = [
    '# Logistic Growth Parameter Estimation - Reproduction Report',
    '',
    'Reproduction success: YES',
    '',
    'Report generated by logistic_fit_demo.py',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '复跑性检查：这份 reproduction report 本身是否给出了完整 rerun command 和脚本路径？如果没有，不要补造；只列出报告中实际出现的路径、命令或缺口。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    uiState: {
      currentReferences: [{
        kind: 'file',
        ref: 'file:workspace/parallel/p3/generated-literature-8ef4985b7dc3-reproduction-report.md',
        title: 'reproduction-report',
        payload: { selectedText: reportMarkdown },
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /完整 rerun command：未给出/);
  assert.match(payload.message, /脚本路径：logistic_fit_demo\.py（报告只给出脚本名，不是完整路径）/);
  assert.match(payload.message, /缺少可直接复制执行的完整命令/);
  assert.doesNotMatch(payload.message, /python logistic_fit_demo\.py/);
});

test('selected metadata-only literature report answers full-text status from selected artifact only', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '只基于我刚刚选中的 research-report-provider-recovery 报告回答：这份报告实际读取了哪些 arXiv PDF/全文证据？哪些没有读取或未验证？它能否支持“全文调研已完成”的结论？请不要使用未选中的历史消息、其它 artifact 或外部新检索。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    references: [],
    artifacts: [{
      id: 'research-report-provider-recovery',
      type: 'research-report',
      data: {
        markdown: 'Recovered through the SciForge web_search provider route and produced an evidence matrix with 8 candidate evidence items. Treat rows as provider-grounded metadata until full-text verification.',
      },
    }, {
      id: 'latest-unselected-report',
      type: 'research-report',
      data: {
        markdown: 'UNSELECTED: arXiv:2501.00001 PDF was read and full-text verification completed.',
      },
    }],
    uiState: {
      claims: [{
        id: 'claim-unselected-fulltext',
        type: 'prediction',
        text: 'UNSELECTED claim says full-text research completed.',
      }],
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report-provider-recovery',
        title: 'research-report-provider-recovery',
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:research-report-provider-recovery'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /只基于当前选中的 research-report-provider-recovery/);
  assert.match(payload.message, /没有记录任何已经读取、下载或验证过的 arXiv PDF\/全文证据/);
  assert.match(payload.message, /不能支持“全文调研已完成”/);
  assert.match(payload.message, /provider-grounded metadata/);
  assert.doesNotMatch(payload.message, /上一轮可见答案/);
  assert.doesNotMatch(payload.message, /2501\.00001|UNSELECTED|full-text research completed/);
});

test('selected no-result literature report follow-up is not routed to stale QC missingness context', () => {
  const noResultReport = [
    '# 中文文献调研报告（无可确认结果）',
    '',
    '- Query: today arxiv agent computer use',
    '- 最新论文列表：为空。',
    '- PDF/全文状态：没有可对应到论文的 PDF/全文可读记录；arxiv-api could not satisfy explicit arXiv query: arXiv API returned HTTP 429。',
    '- 证据位置：只有 provider diagnostics；没有可引用的 arXiv abs/PDF 链接、页码、段落或论文内证据位置。',
    '- 关键结论：本轮未能确认今天 arXiv 上有满足 agent computer use 的可规范化论文记录。',
    '- 局限性：provider 限流和 bounded run 可能造成假阴性；需要重试 arXiv 和逐篇 PDF extraction。',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use the selected report only. Answer in Chinese: did this run confirm any today arxiv papers about agent computer use? List PDF/full-text status, evidence location limits, key conclusion, and remaining limitations.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: noResultReport },
    }, {
      id: 'stale-missingness-report',
      type: 'csv',
      data: {
        text: [
          'metric,count,percent',
          'Total patients,165,100.0',
          'Missing baseline severity,14,8.5',
          'Protocol deviations,24,14.5',
        ].join('\n'),
      },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report',
      title: 'research-report',
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report',
        title: 'research-report',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /没有。选中报告明确是无可确认结果\/最新论文列表为空/);
  assert.match(payload.message, /arXiv API returned HTTP 429/);
  assert.match(payload.message, /没有可引用的 arXiv abs\/PDF 链接、页码、段落或论文内证据位置/);
  assert.match(payload.message, /不能支持“已完成阅读全文调研”/);
  assert.doesNotMatch(payload.message, /QC\/missingness|treatment-effect|missing baseline severity|protocol deviations/i);
  assert.deepEqual(payload.objectReferences?.map((reference) => reference.ref), ['artifact:research-report']);
});

test('selected no-result literature report follow-up does not hard-code arXiv topic copy', () => {
  const noResultReport = [
    '# 中文文献调研报告（无可确认结果）',
    '',
    '- Query: PubMed mitochondrial calcium oscillation sensors',
    '- 最新论文列表：为空。',
    '- PDF/全文状态：没有可对应到论文的 PDF/全文可读记录；PubMed provider returned no records。',
    '- 证据位置：只有 provider diagnostics；没有可引用的 PubMed/PDF 链接、页码、段落或论文内证据位置。',
    '- 关键结论：本轮未能确认满足 mitochondrial calcium oscillation sensors 的可规范化论文记录。',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '只读选中的 report。请说明这次是否确认到 PubMed mitochondrial calcium oscillation sensors 论文、PDF/全文状态、证据位置和局限性。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: noResultReport },
    }],
    references: [{ kind: 'artifact', ref: 'artifact:research-report', title: 'research-report' }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
      currentReferences: [{ kind: 'artifact', ref: 'artifact:research-report', title: 'research-report' }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /请求条件下的相关论文：没有/);
  assert.match(payload.message, /PubMed provider returned no records/);
  assert.match(payload.message, /PubMed 论文\/PDF/);
  assert.doesNotMatch(payload.message, /今天 arXiv|today arXiv|agent computer use/i);
});

test('direct context fast path answers skill tool capability provider status queries from runtime registry', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '现在你有哪些 skill 和 web search provider 是被激活了？',
    agentServerBaseUrl: 'http://agentserver.example.test',
    selectedToolIds: ['web_search'],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/report.md' },
    }],
    uiState: {
      directContextDecision: directDecision('capability-status'),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('capability-status'),
        executionModePlan: {
          executionMode: 'direct-context-answer',
          signals: ['context-summary'],
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      recentExecutionRefs: [{
        id: 'unit-report',
        tool: 'capability.report.generate',
        outputRef: '.sciforge/task-results/report.json',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.claimType, 'capability-provider-status');
  assert.match(payload.message, /Tool\/provider status answered from SciForge runtime registries/);
  assert.match(payload.message, /web_search|provider/i);
});

test('context follow-up protocol yields when AgentServer generation is explicitly forced', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Where did the generated files go?',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/report.md' },
    }],
    uiState: {
      forceAgentServerGeneration: true,
      agentHarness: {
        contract: {
          schemaVersion: 'sciforge.agent-harness-contract.v1',
          intentMode: 'audit',
          capabilityPolicy: { preferredCapabilityIds: ['runtime.direct-context-answer'] },
        },
      },
      recentExecutionRefs: [{
        id: 'unit-report',
        tool: 'capability.report.generate',
        outputRef: '.sciforge/task-results/report.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('agent harness audit hints do not generate direct context strategy without DirectContextDecision', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'What did the previous result use?',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/report.md' },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      agentHarness: {
        contract: {
          schemaVersion: 'sciforge.agent-harness-contract.v1',
          intentMode: 'audit',
          capabilityPolicy: { preferredCapabilityIds: ['runtime.direct-context-answer'] },
        },
      },
      turnExecutionConstraints: {
        contextOnly: true,
        preferredCapabilityIds: ['runtime.direct-context-answer'],
      },
      recentExecutionRefs: [{
        id: 'unit-report',
        tool: 'capability.report.generate',
        outputRef: '.sciforge/task-results/report.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('direct context fast path reads only canonical harness contract decision', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use current refs only and summarize.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: 'Canonical current artifact has enough evidence.' },
    }],
    uiState: {
      directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-ui' }),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-policy' }),
        executionModePlan: {
          executionMode: 'direct-context-answer',
          directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-execution' }),
        },
        harnessContract: {
          directContextDecision: directDecision('context-summary', { decisionRef: 'decision:canonical' }),
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(String(payload.executionUnits[0]?.params ?? ''), /decision:canonical/);
  assert.doesNotMatch(String(payload.executionUnits[0]?.params ?? ''), /legacy-ui|legacy-policy|legacy-execution/);
});

test('legacy direct context decision paths do not authorize fast path without canonical harness contract', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use current refs only and summarize.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: 'Legacy artifact should not authorize this path.' },
    }],
    uiState: {
      directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-ui' }),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-policy' }),
        executionModePlan: {
          executionMode: 'direct-context-answer',
          directContextDecision: directDecision('context-summary', { decisionRef: 'decision:legacy-execution' }),
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('context follow-up protocol does not direct-answer fresh work requests', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Please rerun the search and download the latest papers',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{ id: 'research-report', type: 'research-report' }],
    uiState: {
      agentHarness: {
        contract: {
          schemaVersion: 'sciforge.agent-harness-contract.v1',
          intentMode: 'fresh',
          capabilityPolicy: { preferredCapabilityIds: [] },
        },
      },
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('explicit no-execution context summary uses direct fast path from applied conversation policy', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要重跑、不要执行、不要调用 AgentServer。只基于当前会话 refs/digest 列出 3 条接受标准。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['evidence-matrix'],
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior run failed after preserving refs.' },
    }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision(),
        executionModePlan: {
          executionMode: 'direct-context-answer',
          signals: ['context-summary', 'no-execution-directive'],
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      turnExecutionConstraints: {
        schemaVersion: 'sciforge.turn-execution-constraints.v1',
        policyId: 'sciforge.current-turn-execution-constraints.v1',
        source: 'runtime-contract.turn-constraints',
        contextOnly: true,
        agentServerForbidden: true,
        workspaceExecutionForbidden: true,
        externalIoForbidden: true,
        codeExecutionForbidden: true,
        preferredCapabilityIds: ['runtime.direct-context-answer'],
        executionModeHint: 'direct-context-answer',
        initialResponseModeHint: 'direct-context-answer',
        reasons: ['current-context-only directive'],
        evidence: {
          hasPriorContext: true,
          referenceCount: 1,
          artifactCount: 1,
          executionRefCount: 1,
          runCount: 0,
        },
      },
      currentReferenceDigests: [{
        sourceRef: 'workspace/output-toolpayload.json',
        digestRef: '.sciforge/digests/output-toolpayload.md',
        digestText: 'Digest: prior run preserved failed output refs but did not produce acceptance evidence.',
      }],
      recentExecutionRefs: [{
        id: 'unit-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
        stderrRef: '.sciforge/logs/failed.stderr.log',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.match(String(payload.executionUnits[0]?.params ?? ''), /directContextGate/);
  assert.match(JSON.stringify(payload.artifacts[0]?.metadata ?? {}), /directContextGate/);
  assert.match(payload.message, /Digest: prior run preserved failed output refs/);
  assert.match(payload.message, /failed\.json|failed\.stderr\.log/);
});

test('run-diagnostic direct context can answer from selected execution-unit refs only', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'No rerun, no tools. Use the selected ref only to summarize blocker and recover actions.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    references: [{ ref: 'execution-unit:EU-literature-failed', title: 'Failed execution unit' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('run-diagnostic', {
          requiredTypedContext: ['execution-units', 'failure-evidence'],
          usedRefs: ['execution-unit:EU-literature-failed'],
        }),
        executionModePlan: {
          executionMode: 'direct-context-answer',
          signals: ['run-diagnostic', 'no-execution-directive'],
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      currentReferences: [{ ref: 'execution-unit:EU-literature-failed', title: 'Failed execution unit', kind: 'execution-unit' }],
      recentExecutionRefs: [{
        id: 'EU-literature-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
        stderrRef: '.sciforge/logs/failed.stderr.log',
        failureReason: 'AgentServer generation stopped by convergence guard.',
        recoverActions: ['Retry with selected refs only.'],
        nextStep: 'Use currentReferenceDigests instead of broad history.',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.match(payload.message, /EU-literature-failed|failed\.json|failed\.stderr\.log/);
  assert.doesNotMatch(payload.message, /AgentServer generation request registered/);
});

test('selected-reference direct context can produce a bounded planning register without AgentServer', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Answer-only from the selected ref: budget, timeline, and risk register. Do not run tools.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    references: [{ ref: 'artifact:project-brief', title: 'Project brief' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:project-brief'],
          transformMode: 'answer-only-planning-register',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      currentReferenceDigests: [{
        sourceRef: 'artifact:project-brief',
        digestRef: '.sciforge/digests/project-brief.md',
        digestText: [
          '# Project Brief',
          '**Duration:** 12 months',
          '**Funding Request:** $250,000 direct costs',
          '## Deliverables',
          'D1 Curated dataset by month 6.',
          'D2 Adaptive marker ranking algorithm by month 8.',
          'D3 Validated marker panel by month 11.',
          'D4 Final report and repository by month 12.',
          '## Hard Constraints',
          'Budget cap: $250,000 total direct costs.',
          'Platform lock-in: Visium HD and Xenium for discovery; GeoMx DSP for validation.',
          'Timeline: 12 months fixed.',
          'Data sharing: raw sequencing data must be deposited in GEO.',
          '## Evidence Gaps',
          'RNA quality may fail in archival FFPE blocks.',
          'Validation cohort effect size may miss AUC acceptance criteria.',
        ].join('\n'),
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.match(payload.message, /## Budget/);
  assert.match(payload.message, /\$72,000-\$98,000/);
  assert.match(payload.message, /## Timeline/);
  assert.match(payload.message, /Month 12/);
  assert.match(payload.message, /## Risk Register/);
  assert.match(payload.message, /Platform lock-in/);
});

test('selected-reference planning register applies current-turn constraint overrides', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Answer-only from the existing selected ref: change the hard constraint from 12 months / $250k to 9 months / $180k and assume no Xenium access. Update budget, timeline, risk register, and invalidated assumptions. Do not run tools.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    references: [{ ref: 'artifact:project-brief', title: 'Project brief' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:project-brief'],
          transformMode: 'answer-only-planning-register',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
      currentReferenceDigests: [{
        sourceRef: 'artifact:project-brief',
        digestText: [
          '**Duration:** 12 months',
          '**Funding Request:** $250,000 direct costs',
          '## Deliverables',
          'D1 Visium HD and Xenium discovery dataset by month 6.',
          'D2 Adaptive marker ranking algorithm by month 8.',
          'D3 Validated marker panel by month 11.',
          '## Hard Constraints',
          'Budget cap: $250,000 total direct costs.',
          'Platform lock-in: Visium HD and Xenium for discovery; GeoMx DSP for validation.',
          'Timeline: 12 months fixed.',
        ].join('\n'),
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /Updated hard timeline: 9 months/);
  assert.match(payload.message, /Updated hard budget cap: \$180,000/);
  assert.match(payload.message, /no Xenium access/i);
  assert.match(payload.message, /Month 9/);
  assert.match(payload.message, /Original 12-month schedule is invalidated/);
  assert.match(payload.message, /Original \$250,000 funding assumption is invalidated/);
});

test('selected-reference artifact mutation with updated file paths routes to backend', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: [
      '基于我刚才选中的交付物继续，不要重新发散。',
      '现在关键约束改变：总预算从 120k USD 降到 80k USD，项目周期从 12 个月缩到 9 个月，仍然不能使用真实 patient data，团队人数不变。',
      '请更新所有受影响结论：brief 的 scope/success metrics、decision log、risk register 的 likelihood/impact/mitigation、timeline/budget。',
      '请明确列出哪些旧结论被替换，哪些保持不变，并给出更新后的 artifact/file 路径。',
    ].join(' '),
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'project-brief',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/project-brief.md' },
    }],
    references: [{ ref: 'artifact:project-brief', title: 'Project brief' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:project-brief'],
          transformMode: 'answer-only-planning-register',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
      currentReferenceDigests: [{
        sourceRef: 'artifact:project-brief',
        digestText: [
          '**Duration:** 12 months',
          '**Funding Request:** $120,000 direct costs',
          'Budget cap: $120,000 total direct costs.',
          'Timeline: 12 months fixed.',
        ].join('\n'),
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.equal(payload, undefined);
});

test('reload selected-reference risk follow-up keeps unresolved risks without explicit transform mode', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'After reload, give the final version with unresolved risks from the selected ref. Do not run tools.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    references: [{ ref: 'artifact:project-brief', title: 'Project brief' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:project-brief'],
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
      currentReferenceDigests: [{
        sourceRef: 'artifact:project-brief',
        digestText: [
          '# Project Brief',
          '**Duration:** 9 months',
          '**Funding Request:** $180,000 direct costs',
          '## Deliverables',
          'D1 Visium HD discovery dataset by month 3.',
          'D2 Adaptive marker ranking algorithm by month 6.',
          'D3 Validated marker panel and final report by month 9.',
          '## Hard Constraints',
          'Budget cap: $180,000 total direct costs.',
          'Platform lock-in: Visium HD for discovery; no Xenium access; GeoMx DSP for validation.',
          'Timeline: 9 months fixed.',
          '## Evidence Gaps',
          'RNA quality may fail in archival FFPE blocks.',
          'Validation cohort effect size may miss AUC acceptance criteria.',
          'Xenium access removed; platform-dependent aims must be redesigned.',
        ].join('\n'),
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.match(payload.message, /## Risk Register/);
  assert.match(payload.message, /R1:/);
  assert.match(payload.message, /R2:/);
  assert.match(payload.message, /R3:/);
  assert.match(payload.message, /RNA quality|Validation cohort|Xenium/i);
});

test('selected-reference direct context can draft a main document artifact without AgentServer', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Answer-only from the existing selected project brief: create the main grant proposal document artifact. Do not run tools.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    references: [{ ref: 'artifact:project-brief', title: 'Project brief' }],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('context-summary', {
          usedRefs: ['artifact:project-brief'],
          transformMode: 'answer-only-document',
        }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
      },
      currentReferenceDigests: [{
        sourceRef: 'artifact:project-brief',
        digestText: [
          '# Project Brief: Adaptive Spatial Transcriptomics Markers for Early Pancreatic Cancer Detection',
          '**Duration:** 12 months',
          '**Funding Request:** $250,000 direct costs',
          'Specific Aim 1: identify spatially resolved transcriptomic signatures in PanIN lesions.',
          'Specific Aim 2: develop an adaptive marker selection algorithm.',
          'D1 Curated dataset by month 6.',
          'D2 Adaptive marker ranking algorithm by month 8.',
          'Budget cap: $250,000 total direct costs.',
          'Timeline: 12 months fixed.',
          'Evidence gap: RNA quality may fail in archival FFPE blocks.',
          'Acceptance criteria: final report and repository by month 12.',
        ].join('\n'),
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.equal(payload.artifacts[0]?.type, 'research-report');
  assert.match(payload.message, /# Proposal: Adaptive Spatial Transcriptomics/);
  assert.match(payload.message, /## Specific Aims/);
  assert.match(payload.message, /## Evidence Gaps and Risks/);
  assert.doesNotMatch(payload.message, /AgentServer generation request registered/);
});

test('applied context-only constraints do not synthesize direct context without DirectContextDecision', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'No rerun, no tools. Summarize blocker and recover actions from current refs.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        executionModePlan: {
          executionMode: 'direct-context-answer',
          signals: ['run-diagnostic', 'no-execution-directive'],
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      turnExecutionConstraints: {
        schemaVersion: 'sciforge.turn-execution-constraints.v1',
        policyId: 'sciforge.current-turn-execution-constraints.v1',
        source: 'runtime-contract.turn-constraints',
        contextOnly: true,
        workspaceExecutionForbidden: true,
        externalIoForbidden: true,
        codeExecutionForbidden: true,
        preferredCapabilityIds: ['runtime.direct-context-answer'],
        executionModeHint: 'direct-context-answer',
        initialResponseModeHint: 'direct-context-answer',
        reasons: ['current turn requested context-only or no-execution handling'],
        evidence: {
          hasPriorContext: true,
          referenceCount: 0,
          artifactCount: 1,
          executionRefCount: 1,
          runCount: 0,
        },
      },
      recentExecutionRefs: [{
        id: 'EU-literature-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
        failureReason: 'Prior run exceeded a bounded generation guard.',
        recoverActions: ['Continue with selected refs only.'],
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.equal(payload, undefined);
});

test('applied direct context policy does not answer from historical execution refs alone', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use current refs only and do not dispatch AgentServer.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [],
    uiState: {
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        executionModePlan: {
          executionMode: 'direct-context-answer',
          signals: ['context-summary', 'no-execution-directive'],
        },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      recentExecutionRefs: [{
        id: 'unit-old-failure',
        status: 'failed-with-reason',
        outputRef: '.sciforge/old/task-results/failed.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('local execution diagnostics do not authorize direct fast path without applied policy', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要重跑、不要执行、不要调用 AgentServer。只基于当前会话 refs/digest 列出 3 条接受标准。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior run failed after preserving refs.' },
    }],
    uiState: {
      executionModeDiagnostics: {
        executionMode: 'direct-context-answer',
        signals: ['context-summary', 'no-execution-directive'],
      },
      recentExecutionRefs: [{
        id: 'unit-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('prompt-only no-execution text does not authorize direct fast path without structured execution decision', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要重跑、不要执行、不要调用 AgentServer。只基于当前会话 refs/digest 列出 3 条接受标准。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior run failed after preserving refs.' },
    }],
    uiState: {
      recentExecutionRefs: [{
        id: 'unit-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('structured turn constraints alone do not authorize direct context when policy times out', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要重跑、不要执行、不要调用 AgentServer。只基于当前会话 refs/digest 列出 3 条接受标准。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      metadata: { outputRef: '.sciforge/task-results/failed.json' },
    }],
    uiState: {
      turnExecutionConstraints: {
        schemaVersion: 'sciforge.turn-execution-constraints.v1',
        policyId: 'sciforge.current-turn-execution-constraints.v1',
        source: 'runtime-contract.turn-constraints',
        contextOnly: true,
        agentServerForbidden: true,
        workspaceExecutionForbidden: true,
        externalIoForbidden: true,
        codeExecutionForbidden: true,
        preferredCapabilityIds: ['runtime.direct-context-answer'],
        executionModeHint: 'direct-context-answer',
        initialResponseModeHint: 'direct-context-answer',
        reasons: ['current-context-only directive'],
        evidence: {
          hasPriorContext: true,
          referenceCount: 0,
          artifactCount: 1,
          executionRefCount: 1,
          runCount: 0,
        },
      },
      recentExecutionRefs: [{
        id: 'unit-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('explicit no-read old context does not direct-answer fresh lookup requests', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '不要读取旧日志，但请搜索最新来源并总结。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      metadata: { reportRef: '.sciforge/task-results/report.md' },
    }],
    uiState: {
      recentExecutionRefs: [{
        id: 'unit-report',
        tool: 'capability.report.generate',
        outputRef: '.sciforge/task-results/report.json',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('context follow-up protocol returns needs-work when expected artifacts are missing', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '基于上一轮结果继续重排并导出审计',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['paper-list', 'research-report'],
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior run failed before writing paper-list/report.' },
    }],
    uiState: {
      directContextDecision: directDecision(),
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision(),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
      agentHarness: {
        contract: {
          schemaVersion: 'sciforge.agent-harness-contract.v1',
          intentMode: 'audit',
          capabilityPolicy: { preferredCapabilityIds: ['runtime.direct-context-answer'] },
        },
      },
      recentExecutionRefs: [{
        id: 'unit-failed',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/failed.json',
        stderrRef: '.sciforge/logs/failed.stderr.log',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.status, 'repair-needed');
  assert.equal(payload.artifacts[0]?.type, 'runtime-diagnostic');
  assert.match(payload.message, /缺失产物：paper-list, research-report/);
  assert.match(String(payload.executionUnits[0]?.failureReason ?? ''), /cannot satisfy follow-up/);
});

test('provider status follow-up reuses current context without AgentServer generation', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Round 2 continue from Round 1. Reuse the Example Domain result and fetch https://example.com again only if needed. Say whether tool providers are still available.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    selectedToolIds: ['web_fetch'],
    artifacts: [{
      id: 'fetch-example-com',
      type: 'runtime-context-summary',
      data: { markdown: 'Round 1 fetched https://example.com. Title: Example Domain.' },
    }],
    uiState: {
      directContextDecision: directDecision('capability-status', { usedRefs: ['artifact:fetch-example-com'] }),
      currentReferences: [{
        id: 'ref-fetch',
        kind: 'artifact',
        ref: 'artifact:fetch-example-com',
        title: 'Example Domain fetch result',
        summary: 'Title: Example Domain',
      }],
      capabilityProviderAvailability: [{
        id: 'sciforge.web-worker.web_fetch',
        providerId: 'sciforge.web-worker.web_fetch',
        workerId: 'sciforge.web-worker',
        capabilityId: 'web_fetch',
        available: true,
        status: 'available',
        health: 'online',
      }],
      conversationPolicy: {
        applicationStatus: 'applied',
        policySource: 'python-conversation-policy',
        ...canonicalDirectDecision('capability-status', { usedRefs: ['artifact:fetch-example-com'] }),
        executionModePlan: { executionMode: 'direct-context-answer' },
        responsePlan: { initialResponseMode: 'direct-context-answer' },
        latencyPolicy: { blockOnContextCompaction: false },
      },
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.claimType, 'capability-provider-status');
  assert.equal(payload.executionUnits[0]?.status, 'done');
  assert.match(payload.message, /sciforge\.web-worker\.web_fetch/);
  assert.match(payload.message, /Example Domain/);
  assert.doesNotMatch(payload.message, /worker=/);
  assert.doesNotMatch(JSON.stringify(payload), /(?:\\")?(workerId|runtimeLocation|endpoint|baseUrl|invokeUrl|invokePath)(?:\\")?\s*:/);
});

test('provider wording does not steal fresh retrieval requests from AgentServer dispatch', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '启用 AgentServer server-side web_search 后，用同一个窄日期 query 再检索；如果为空请说明 empty result 并给恢复建议。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'runtime-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior provider route was missing.' },
    }],
    uiState: {
      capabilityProviderAvailability: [{
        id: 'sciforge.web-worker.web_search',
        providerId: 'sciforge.web-worker.web_search',
        capabilityId: 'web_search',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('provider availability fallback wording does not steal English fresh search requests', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'search recent papers about agent workflow reliability and return a Chinese evidence summary. if web_search provider is unavailable, explain missing provider route and recoverable next step. do not fabricate results.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'prior-note',
      type: 'runtime-context-summary',
      data: { markdown: 'Prior demo context exists but does not answer the fresh retrieval request.' },
    }],
    uiState: {
      capabilityProviderAvailability: [{
        id: 'sciforge.web-worker.web_search',
        providerId: 'sciforge.web-worker.web_search',
        capabilityId: 'web_search',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('provider status fast path yields for bounded repair prompt that asks for adapter task or failed-with-reason payload', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'continue from the last bounded stop. do not start long generation. produce one minimal single stage result only. if web search or web fetch provider routes are usable then create a minimal adapter task that uses those provider routes. if this cannot be determined in this turn then return a valid failed with reason tool payload with failure reason recover actions next step and refs. do not ask agentserver for another long loop.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'bounded-stop-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Prior run stopped at bounded repair guard with reusable refs.' },
    }],
    uiState: {
      recentExecutionRefs: [{
        id: 'bounded-stop-unit',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/bounded-stop.json',
        stderrRef: '.sciforge/logs/bounded-stop.stderr.log',
      }],
      capabilityProviderAvailability: [{
        id: 'sciforge.web-worker.web_search',
        providerId: 'sciforge.web-worker.web_search',
        capabilityId: 'web_search',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }, {
        id: 'sciforge.web-worker.web_fetch',
        providerId: 'sciforge.web-worker.web_fetch',
        capabilityId: 'web_fetch',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});

test('referenced literature report follow-up summarizes flow matching conclusions from session artifact without AgentServer', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'sciforge-direct-context-literature-root-'));
  const workspaceRel = 'workspace/parallel/integration';
  const workspace = join(projectRoot, workspaceRel);
  const bundle = join(workspace, '.sciforge', 'sessions', '2026-05-17_literature_session-literature-report-followup');
  const artifactDir = join(bundle, 'artifacts');
  const taskResults = join(bundle, 'task-results', 'literature-metadata-recovery');
  await mkdir(artifactDir, { recursive: true });
  await mkdir(taskResults, { recursive: true });
  const reportRel = join(taskResults, 'research-report.md');
  const reportMarkdown = [
    '# 中文文献调研报告（provider recovery）',
    '',
    '## 候选论文与全文/PDF状态',
    '',
    '| title | year | venue | url | fullTextStatus | summary | limitations |',
    '|---|---|---|---|---|---|---|',
    '| FLUX: Geometry-Aware Longitudinal Flow Matching with Mixture of Experts | 2026-05-09T03:36:00Z |  | https://arxiv.org/abs/2605.08648v1 | PDF/full-text candidate link found via browser_fetch: https://arxiv.org/pdf/2605.08648v1 | Many biological systems evolve through continuous local dynamics while switching between latent regimes; unpaired longitudinal snapshots need geometry-aware flow matching. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
    '| PRiMeFlow: Capturing Complex Expression Heterogeneity in Perturbation Response Modelling | 2026-04-15T15:33:07Z |  | https://arxiv.org/abs/2604.13986v2 | PDF/full-text likely reachable from provider URL; not downloaded in this bounded run. | Predicting the effects of perturbations in-silico on cell state can identify drivers of cell behavior at scale; PRiMeFlow directly models genetic and small molecule perturbations in gene expression space. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
    '| Flow Matching for Count Data | 2026-05-08T13:53:37Z |  | https://arxiv.org/abs/2605.07746v1 | PDF/full-text candidate link found via browser_fetch: https://arxiv.org/pdf/2605.07746v1 | High-dimensional count data arise in single-cell RNA sequencing and neural spike trains; flow matching for count data extends generative modeling to discrete expression observations. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
  ].join('\n');
  await writeFile(reportRel, reportMarkdown);
  await writeFile(join(artifactDir, 'research-report.json'), JSON.stringify({
    id: 'research-report',
    type: 'research-report',
    path: reportRel,
    dataRef: reportRel,
    data: { markdown: reportMarkdown },
  }, null, 2));
  const previousEnv = process.env.SCIFORGE_WORKSPACE_PATH;
  process.env.SCIFORGE_WORKSPACE_PATH = workspaceRel;
  try {
    const request: GatewayRequest = {
      skillDomain: 'literature',
      workspacePath: projectRoot,
      prompt: '请基于我刚刚引用的 report artifact，用中文用三条 bullet 总结最相关的 flow matching / perturbation prediction 结论，并指出 PDF/full-text 状态。',
      artifacts: [],
      references: [],
      uiState: { sessionId: 'session-literature-report-followup' },
    };

    const enriched = await requestWithDirectContextReadableArtifactData(request);
    const payload = directContextFastPathPayload(enriched);

    assert.equal(enriched.artifacts[0]?.id, 'research-report');
    assert.ok(payload);
    assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
    assert.match(payload.message, /基于当前 report artifact 直接回答/);
    assert.match(payload.message, /FLUX/);
    assert.match(payload.message, /PRiMeFlow/);
    assert.match(payload.message, /Flow Matching for Count Data/);
    assert.match(payload.message, /PDF\/full-text 状态/);
    assert.doesNotMatch(payload.message, /AgentServer|workspace task was started/i);
  } finally {
    if (previousEnv === undefined) delete process.env.SCIFORGE_WORKSPACE_PATH;
    else process.env.SCIFORGE_WORKSPACE_PATH = previousEnv;
  }
});

test('selected literature report read-first follow-up is answered from report rows, not chart sufficiency template', () => {
  const reportMarkdown = [
    '# 中文文献调研报告（provider recovery）',
    '',
    'The report mentions chart review as a future visualization task, but the selected artifact is a markdown research report.',
    '',
    '## 候选论文与全文/PDF状态',
    '',
    '| title | year | venue | url | fullTextStatus | summary | limitations |',
    '|---|---|---|---|---|---|---|',
    '| FLUX: Geometry-Aware Longitudinal Flow Matching with Mixture of Experts | 2026-05-09T03:36:00Z | arXiv | https://arxiv.org/abs/2605.08648v1 | PDF/full-text candidate link found via browser_fetch: https://arxiv.org/pdf/2605.08648v1 | Many biological systems evolve through continuous local dynamics while switching between latent regimes; unpaired longitudinal snapshots need geometry-aware flow matching. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
    '| PRiMeFlow: Capturing Complex Expression Heterogeneity in Perturbation Response Modelling | 2026-04-15T15:33:07Z | arXiv | https://arxiv.org/abs/2604.13986v2 | PDF/full-text likely reachable from provider URL; not downloaded in this bounded run. | Predicting the effects of perturbations in-silico on cell state can identify drivers of cell behavior at scale; PRiMeFlow directly models genetic and small molecule perturbations in gene expression space. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
    '| Flow Matching for Count Data | 2026-05-08T13:53:37Z | arXiv | https://arxiv.org/abs/2605.07746v1 | PDF/full-text candidate link found via browser_fetch: https://arxiv.org/pdf/2605.07746v1 | High-dimensional count data arise in single-cell RNA sequencing and neural spike trains; flow matching for count data extends generative modeling to discrete expression observations. | Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims. |',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'Use the selected research-report only; do not run a new search. Answer in Chinese: pick the 3 highest-priority papers to read first, with reason, evidence location, PDF/full-text status, and one limitation. Keep refs usable for another follow-up.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    expectedArtifactTypes: ['paper-list', 'evidence-matrix', 'research-report'],
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: reportMarkdown },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report',
      title: 'research-report',
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report',
        title: 'research-report',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /优先阅读 1/);
  assert.match(payload.message, /FLUX/);
  assert.match(payload.message, /PRiMeFlow/);
  assert.match(payload.message, /Flow Matching for Count Data/);
  assert.match(payload.message, /证据位置：选中 report 的候选论文表/);
  assert.match(payload.message, /PDF\/full-text 状态/);
  assert.match(payload.message, /局限性/);
  assert.doesNotMatch(payload.message, /selected chart|single chart|A single chart|cannot by itself establish statistical significance/i);
  assert.deepEqual(payload.objectReferences?.map((reference) => reference.ref), ['artifact:research-report']);
});

test('selected literature report read-first follow-up can recover paper rows from json-like report context', () => {
  const reportText = JSON.stringify({
    papers: [{
      title: 'Provider search',
      summary: 'Called web_search; normalized 8 candidate records.',
    }, {
      title: 'PRiMeFlow: Capturing Complex Expression Heterogeneity in Perturbation Response Modelling',
      published: '2026-04-15T15:33:07Z',
      url: 'https://arxiv.org/abs/2604.13986v2',
      fullTextStatus: 'PDF/full-text likely reachable from provider URL; not downloaded in this bounded run.',
      summary: 'PRiMeFlow directly models genetic and small molecule perturbations in gene expression space using flow matching.',
      limitations: 'Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims.',
    }, {
      title: 'Flow Matching for Count Data',
      published: '2026-05-08T13:53:37Z',
      url: 'https://arxiv.org/abs/2605.07746v1',
      fullTextStatus: 'PDF/full-text candidate link found via browser_fetch: https://arxiv.org/pdf/2605.07746v1',
      summary: 'Flow matching for count data extends generative modeling to discrete single-cell expression observations.',
      limitations: 'Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims.',
    }, {
      title: 'MIOFlow 2.0: A unified framework for inferring cellular stochastic dynamics',
      published: '2026-03-23T20:49:45Z',
      url: 'https://arxiv.org/abs/2603.22564v2',
      fullTextStatus: 'PDF/full-text likely reachable from provider URL; not downloaded in this bounded run.',
      summary: 'MIOFlow 2.0 infers continuous cellular trajectories from single-cell and spatial transcriptomics snapshots.',
      limitations: 'Provider-grounded metadata package; citation/full-text verification should be run before strong scientific claims.',
    }],
  });
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: 'use research report only. no new search. answer in chinese. pick 3 priority papers to read first with reason, evidence location, pdf status, full text status, and one limitation.',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: reportText },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report',
      title: 'research-report',
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report',
        title: 'research-report',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /优先阅读 1/);
  assert.match(payload.message, /PRiMeFlow/);
  assert.match(payload.message, /Flow Matching for Count Data/);
  assert.match(payload.message, /证据位置/);
  assert.doesNotMatch(payload.message, /Provider search|Called web_search/);
  assert.doesNotMatch(payload.message, /Completion verdict|selected chart|single chart/i);
});

test('selected literature report read-first follow-up prioritizes extracted PDF rows with evidence pages', () => {
  const reportMarkdown = [
    '# 中文文献调研报告',
    '## 候选论文与全文/PDF状态',
    '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
    '|---|---|---|---|---|---|---|---|',
    '| ShopGym: An Integrated Framework for Realistic Simulation and Scalable Benchmarking of E-Commerce Web Agents | 2026-05-15 |  | https://arxiv.org/abs/2605.16116 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16116 | https://arxiv.org/pdf/2605.16116#page=1 | Developing and evaluating e-commerce web agents requires environments that preserve meaningful task structure while enabling controllable, reproducible, and scalable scientific comparison. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| ScreenSearch: Uncertainty-Aware OS Exploration | 2026-05-15 |  | https://arxiv.org/abs/2605.16024 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16024 | https://arxiv.org/pdf/2605.16024#page=1 | Desktop GUI agents operate under partial observability; ScreenSearch frames the task as computer/OS state exploration before committing. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| PAGER: Bridging the Semantic-Execution Gap in Point-Precise Geometric GUI Control | 2026-05-15 |  | https://arxiv.org/abs/2605.15963 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.15963 | https://arxiv.org/pdf/2605.15963#page=1 | Large vision-language models have advanced GUI agents, but precise geometric construction requires point-accurate execution. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| SaaS-Bench: Can Computer-Use Agents Leverage Real-World SaaS to Solve Professional Workflows? | 2026-05-15 |  | https://arxiv.org/abs/2605.15777 | PDF/full-text candidate URL inferred from source: https://arxiv.org/pdf/2605.15777 | https://arxiv.org/abs/2605.15777 | arXiv:2605.15777 / published:2026-05-15 / pdf:https://arxiv.org/pdf/2605.15777 | Provider-grounded recovery package; citation/full-text verification should be run before strong scientific claims. |',
  ].join(' ');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '基于刚才选中的research-report，不要启动新搜索。请选出最值得继续阅读全文的3篇，中文说明每篇为什么优先、PDF/全文状态、证据页码或URL、关键结论和局限性。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: reportMarkdown },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:research-report',
      title: 'research-report',
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:research-report',
        title: 'research-report',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /优先阅读 1：ShopGym/);
  assert.match(payload.message, /优先阅读 2：ScreenSearch/);
  assert.match(payload.message, /优先阅读 3：PAGER/);
  assert.match(payload.message, /evidence=https:\/\/arxiv\.org\/pdf\/2605\.16024#page=1/);
  assert.match(payload.message, /Desktop GUI agents operate under partial observability/);
  assert.doesNotMatch(payload.message, /理由：https:\/\/arxiv\.org\/abs/);
  assert.doesNotMatch(payload.message, /Known By Their Actions/);
});

test('selected literature report no-new-search follow-up overrides stale fresh-execution decision', () => {
  const reportMarkdown = [
    '# 中文文献调研报告',
    '## 候选论文与全文/PDF状态',
    '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
    '|---|---|---|---|---|---|---|---|',
    '| ShopGym: An Integrated Framework for Realistic Simulation and Scalable Benchmarking of E-Commerce Web Agents | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16116 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16116 | https://arxiv.org/pdf/2605.16116#page=1 | Developing and evaluating e-commerce web agents requires realistic, reproducible environments for controlled scientific comparison. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| ScreenSearch: Uncertainty-Aware OS Exploration | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16024 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16024 | https://arxiv.org/pdf/2605.16024#page=1 | 2605.16024 | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| PAGER: Bridging the Semantic-Execution Gap in Point-Precise Geometric GUI Control | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.15963 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.15963 | https://arxiv.org/pdf/2605.15963#page=1 | 2605.15963 | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '请再次基于刚才选中的research-report，不启动新搜索。选出最值得继续阅读全文的3篇，并用中文说明每篇为什么优先、PDF/全文状态、证据页码或URL、关键结论和局限性。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'research-report',
      type: 'research-report',
      data: { markdown: reportMarkdown },
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('fresh-execution', {
        usedRefs: ['runtime://fresh-dispatch'],
      })),
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
  assert.match(payload.message, /不启动新的 workspace task，也不重新检索/);
  assert.match(payload.message, /优先阅读 1：ShopGym/);
  assert.match(payload.message, /优先阅读 2：ScreenSearch/);
  assert.match(payload.message, /优先阅读 3：PAGER/);
  assert.match(payload.message, /完成 bounded PDF 抽取并保留证据位置/);
  assert.doesNotMatch(payload.message, /理由：2605\.16024/);
});

test('prompt-named literature report wins over stale selected report context', () => {
  const goodReport = [
    '# 中文文献调研报告',
    '## 候选论文与全文/PDF状态',
    '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
    '|---|---|---|---|---|---|---|---|',
    '| ShopGym: An Integrated Framework for Realistic Simulation and Scalable Benchmarking of E-Commerce Web Agents | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16116 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16116 | https://arxiv.org/pdf/2605.16116#page=1 | Developing and evaluating e-commerce web agents requires realistic, reproducible environments for controlled scientific comparison. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| ScreenSearch: Uncertainty-Aware OS Exploration | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16024 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16024 | https://arxiv.org/pdf/2605.16024#page=1 | Desktop GUI agents operate under partial observability and should explore uncertain OS state before committing actions. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    '| PAGER: Bridging the Semantic-Execution Gap in Point-Precise Geometric GUI Control | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.15963 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.15963 | https://arxiv.org/pdf/2605.15963#page=1 | Point-precise geometric GUI control needs execution grounded in exact spatial operations, not only semantic labels. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
  ].join('\n');
  const staleReport = [
    '# 中文文献调研报告（bad stale search）',
    '检索 provider：duckduckgo-html；provider query：bad stale query',
    '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
    '|---|---|---|---|---|---|---|---|',
    '| Baidu - 百度一下，你就知道 | 2026 | web | //duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.baidu.com%2F | Full-text/PDF unavailable in this run because provider fetch failed; source URL retained for retry. | //duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.baidu.com%2F | 百度是全球领先的中文搜索引擎。 | Provider-grounded recovery package; citation/full-text verification should be run before strong scientific claims. |',
  ].join('\n');
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '基于 task-results/agentserver-generation-retry-literature-recovery-literature-b4b24737361b-research-report.md，不启动新搜索。选出最值得继续阅读全文的3篇，并用中文说明每篇为什么优先、PDF/全文状态、证据页码或URL、关键结论和局限性。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'stale-report',
      type: 'research-report',
      dataRef: 'task-results/stale-duckduckgo-research-report.md',
      data: { markdown: staleReport },
    }, {
      id: 'research-report',
      type: 'research-report',
      dataRef: 'task-results/agentserver-generation-retry-literature-recovery-literature-b4b24737361b-research-report.md',
      data: { markdown: goodReport },
    }],
    references: [{
      kind: 'artifact',
      ref: 'artifact:stale-report',
      title: 'stale-duckduckgo-research-report.md',
    }],
    uiState: {
      conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:stale-report'] })),
      currentReferences: [{
        kind: 'artifact',
        ref: 'artifact:stale-report',
        title: 'stale-duckduckgo-research-report.md',
      }],
    },
  };

  const payload = directContextFastPathPayload(request);

  assert.ok(payload);
  assert.match(payload.message, /优先阅读 1：ShopGym/);
  assert.match(payload.message, /优先阅读 2：ScreenSearch/);
  assert.match(payload.message, /优先阅读 3：PAGER/);
  assert.doesNotMatch(payload.message, /Baidu|duckduckgo-html|百度一下/);
});

test('contextProjection selected report with no-new-search hydrates session artifact and stays direct-context', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-context-projection-followup-'));
  try {
    const sessionDir = join(workspace, '.sciforge', 'sessions', '2026-05-18_literature-evidence-review_session-literature-evidence-review-session-context-proj');
    const reportRef = '.sciforge/sessions/2026-05-18_literature-evidence-review_session-literature-evidence-review-session-context-proj/task-results/research-report.md';
    const report = [
      '# 中文文献调研报告',
      '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
      '|---|---|---|---|---|---|---|---|',
      '| ShopGym: An Integrated Framework for Realistic Simulation and Scalable Benchmarking of E-Commerce Web Agents | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16116 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16116 | https://arxiv.org/pdf/2605.16116#page=1 | Developing and evaluating e-commerce web agents requires realistic, reproducible environments for controlled scientific comparison. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
      '| ScreenSearch: Uncertainty-Aware OS Exploration | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16024 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16024 | https://arxiv.org/pdf/2605.16024#page=1 | Desktop GUI agents operate under partial observability and should explore uncertain OS state before committing actions. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
      '| PAGER: Bridging the Semantic-Execution Gap in Point-Precise Geometric GUI Control | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.15963 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.15963 | https://arxiv.org/pdf/2605.15963#page=1 | Point-precise geometric GUI control needs execution grounded in exact spatial operations, not only semantic labels. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    ].join('\n');
    await mkdir(join(sessionDir, 'artifacts'), { recursive: true });
    await mkdir(join(sessionDir, 'task-results'), { recursive: true });
    await writeFile(join(workspace, reportRef), report, 'utf8');
    await writeFile(join(sessionDir, 'artifacts', 'research-report.json'), JSON.stringify({
      id: 'research-report',
      type: 'research-report',
      title: 'research-report',
      dataRef: reportRef,
      path: reportRef,
    }), 'utf8');
    const request: GatewayRequest = {
      skillDomain: 'literature',
      prompt: '基于刚才选中的research-report，不启动新搜索。请选出最值得继续阅读全文的3篇，中文说明每篇为什么优先、PDF/全文状态、证据页码或URL、关键结论和局限性。',
      workspacePath: workspace,
      agentServerBaseUrl: 'http://agentserver.example.test',
      artifacts: [],
      uiState: {
        sessionId: 'session-context-proj',
        contextProjection: {
          selectedContextRefs: ['artifact:research-report'],
          contextRefs: [{ ref: reportRef, kind: 'artifact' }],
        },
      },
    };

    const hydrated = await requestWithDirectContextReadableArtifactData(request);
    const payload = directContextFastPathPayload(hydrated);

    assert.ok(payload);
    assert.equal(payload.executionUnits[0]?.tool, 'sciforge.direct-context-fast-path');
    assert.match(payload.message, /不启动新的 workspace task，也不重新检索/);
    assert.match(payload.message, /优先阅读 1：ShopGym/);
    assert.match(payload.message, /优先阅读 2：ScreenSearch/);
    assert.match(payload.message, /优先阅读 3：PAGER/);
    assert.doesNotMatch(payload.message, /duckduckgo|Baidu|百度一下/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('selected reference provenance path beats colliding generic artifact id in bounded report follow-up', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-selected-report-provenance-'));
  try {
    const goodRef = 'task-results/good-research-report.md';
    const staleRef = 'task-results/stale-research-report.md';
    const goodReport = [
      '# 中文文献调研报告',
      '| title | year | venue | url | fullTextStatus | evidenceLocation | summary | limitations |',
      '|---|---|---|---|---|---|---|---|',
      '| ShopGym: An Integrated Framework for Realistic Simulation and Scalable Benchmarking of E-Commerce Web Agents | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16116 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16116 | https://arxiv.org/pdf/2605.16116#page=1 | Developing and evaluating e-commerce web agents requires realistic, reproducible environments for controlled scientific comparison. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
      '| ScreenSearch: Uncertainty-Aware OS Exploration | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.16024 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.16024 | https://arxiv.org/pdf/2605.16024#page=1 | Desktop GUI agents operate under partial observability and should explore uncertain OS state before committing actions. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
      '| PAGER: Bridging the Semantic-Execution Gap in Point-Precise Geometric GUI Control | 2026-05-15 | arXiv | https://arxiv.org/abs/2605.15963 | PDF extracted via pdf_extract (pdftotext), page range 1-8, chars=14000; source https://arxiv.org/pdf/2605.15963 | https://arxiv.org/pdf/2605.15963#page=1 | Point-precise geometric GUI control needs execution grounded in exact spatial operations, not only semantic labels. | PDF text was bounded to the configured page/character budget; citation claims should stay within recorded evidence locations. |',
    ].join('\n');
    await mkdir(join(workspace, 'task-results'), { recursive: true });
    await writeFile(join(workspace, goodRef), goodReport, 'utf8');
    await writeFile(join(workspace, staleRef), '# stale report\n\nNo PDF/full-text URL confirmed by provider metadata; Provider-grounded recovery package.', 'utf8');
    const request: GatewayRequest = {
      skillDomain: 'literature',
      prompt: '基于刚才选中的research-report，不启动新搜索。请选出最值得继续阅读全文的3篇，中文说明每篇为什么优先、PDF/全文状态、证据页码或URL、关键结论和局限性。',
      workspacePath: workspace,
      agentServerBaseUrl: 'http://agentserver.example.test',
      artifacts: [{
        id: 'research-report',
        type: 'research-report',
        dataRef: staleRef,
        data: { markdown: 'No PDF/full-text URL confirmed by provider metadata; Provider-grounded recovery package.' },
      }],
      references: [{
        id: 'ref-selected-report',
        kind: 'task-result',
        title: 'research-report',
        ref: 'artifact:research-report',
        payload: {
          currentReference: {
            id: 'obj-selected-report',
            kind: 'artifact',
            title: 'research-report',
            ref: 'artifact:research-report',
            artifactType: 'research-report',
            provenance: { dataRef: goodRef },
          },
          objectReference: {
            id: 'obj-selected-report',
            kind: 'artifact',
            title: 'research-report',
            ref: 'artifact:research-report',
            artifactType: 'research-report',
            provenance: { dataRef: goodRef },
          },
        },
      }],
      uiState: {
        conversationPolicy: appliedDirectContextPolicy(directDecision('context-summary', { usedRefs: ['artifact:research-report'] })),
        currentReferences: [],
      },
    };

    const hydrated = await requestWithDirectContextReadableArtifactData(request);
    const payload = directContextFastPathPayload(hydrated);

    assert.ok(payload);
    assert.match(payload.message, /不启动新的 workspace task，也不重新检索/);
    assert.match(payload.message, /优先阅读 1：ShopGym/);
    assert.match(payload.message, /优先阅读 2：ScreenSearch/);
    assert.match(payload.message, /优先阅读 3：PAGER/);
    assert.doesNotMatch(payload.message, /没有记录任何已经读取|No PDF\/full-text URL confirmed/);
    assert.doesNotMatch(JSON.stringify(payload.objectReferences ?? []), /stale-research-report/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('scoped no-rerun repair prompt still yields to backend when it asks to generate a minimal task', () => {
  const request: GatewayRequest = {
    skillDomain: 'literature',
    prompt: '请复用这次失败诊断继续，不要重跑无关步骤；修正生成任务，必须使用 SciForge 已解析的 web_search/web_fetch provider route 或输出合法失败 payload，然后继续完成中文证据摘要。',
    agentServerBaseUrl: 'http://agentserver.example.test',
    artifacts: [{
      id: 'provider-first-diagnostic',
      type: 'runtime-diagnostic',
      data: { markdown: 'Generated task used direct external network APIs despite ready provider routes.' },
    }],
    uiState: {
      recentExecutionRefs: [{
        id: 'provider-first-unit',
        status: 'repair-needed',
        outputRef: '.sciforge/task-results/provider-first.json',
      }],
      capabilityProviderAvailability: [{
        id: 'sciforge.web-worker.web_search',
        providerId: 'sciforge.web-worker.web_search',
        capabilityId: 'web_search',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }, {
        id: 'sciforge.web-worker.web_fetch',
        providerId: 'sciforge.web-worker.web_fetch',
        capabilityId: 'web_fetch',
        workerId: 'sciforge.web-worker',
        available: true,
        status: 'available',
      }],
    },
  };

  assert.equal(directContextFastPathPayload(request), undefined);
});
