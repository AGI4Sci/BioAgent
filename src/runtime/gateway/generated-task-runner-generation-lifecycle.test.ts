import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import type { AgentServerGenerationResponse, GatewayRequest, SkillAvailability, ToolPayload, WorkspaceRuntimeEvent } from '../runtime-types.js';
import {
  resolveGeneratedTaskGenerationRetryLifecycle,
  type GeneratedTaskGenerationLifecycleDeps,
} from './generated-task-runner-generation-lifecycle.js';

const readyWebProviderRequest: GatewayRequest = {
  skillDomain: 'literature',
  prompt: 'fresh literature run: search recent papers and summarize evidence.',
  selectedToolIds: ['web_search'],
  artifacts: [],
  uiState: {
    sessionId: 'fresh-literature-provider-first-retry',
    capabilityProviderAvailability: [{
      id: 'sciforge.web-worker.web_search',
      available: true,
      status: 'available',
    }],
  },
};

const skill = {
  id: 'literature-agentserver-generation',
  kind: 'package',
  available: true,
  reason: 'test',
  checkedAt: '2026-05-16T00:00:00.000Z',
  manifestPath: '/tmp/skill.json',
  manifest: {
    id: 'literature-agentserver-generation',
    kind: 'skill',
    label: 'Literature',
    description: 'test',
    entrypoint: { type: 'agentserver-generation' },
  },
} as unknown as SkillAvailability;

test('generation lifecycle routes provider-first payload preflight violations to recovery adapter', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-provider-first-preflight-recovery-'));
  const events: WorkspaceRuntimeEvent[] = [];

  const result = await resolveGeneratedTaskGenerationRetryLifecycle({
    baseUrl: 'http://127.0.0.1:18080',
    request: readyWebProviderRequest,
    skill,
    skills: [skill],
    workspace,
    generation: {
      ok: true,
      runId: 'initial-direct-network',
      response: directNetworkGeneration('.sciforge/tasks/direct-network.py'),
    },
    callbacks: {
      onEvent: (event) => events.push(event),
    },
    deps: depsWithRetry(async () => {
      throw new Error('provider-first recovery should not require an AgentServer strict retry');
    }),
  });

  assert.equal(result.kind, 'task-files');
  assert.equal(result.generation.runId, 'initial-direct-network');
  assert.match(result.generation.response.patchSummary ?? '', /provider-first contract violation/i);
  const source = result.generation.response.taskFiles[0]?.content ?? '';
  assert.match(source, /invoke_capability/);
  assert.match(source, /_search_query/);
  assert.match(source, /arxiv_ids = re\.findall/);
  assert.match(source, /do\\s\+not\|don/);
  assert.match(source, /provider metadata is not full-text verified evidence/);
  assert.match(source, /"status": "failed-with-reason"/);
  assert.doesNotMatch(source, /"status": "done", "tool": "invoke_capability"/);
  assert.doesNotMatch(source, /import\s+requests|import\s+urllib|requests\.|urllib\.request/);
  assert.equal(events.some((event) => /direct provider bypass/.test(event.message ?? '')), true);
});

test('generation lifecycle provider-first adapter is deterministic for repeated bypasses', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-provider-first-preflight-still-blocked-'));
  const events: WorkspaceRuntimeEvent[] = [];
  const result = await resolveGeneratedTaskGenerationRetryLifecycle({
    baseUrl: 'http://127.0.0.1:18080',
    request: readyWebProviderRequest,
    skill,
    skills: [skill],
    workspace,
    generation: {
      ok: true,
      runId: 'initial-direct-network',
      response: directNetworkGeneration('.sciforge/tasks/direct-network.py'),
    },
    deps: depsWithRetry(async () => ({
      ok: true,
      runId: 'retry-still-direct-network',
      response: directNetworkGeneration('.sciforge/tasks/direct-network-retry.py'),
    })),
    callbacks: {
      onEvent: (event) => events.push(event),
    },
  });

  assert.equal(result.kind, 'task-files');
  assert.equal(result.generation.runId, 'initial-direct-network');
  assert.match(result.generation.response.patchSummary ?? '', /provider-first contract violation/i);
  const source = result.generation.response.taskFiles[0]?.content ?? '';
  assert.match(source, /invoke_capability/);
  assert.match(source, /provider_result_is_empty/);
  assert.match(source, /full-text\/PDF retrieval, citation verification, and task-specific evidence grounding were not completed/i);
  assert.match(source, /"claimType": "failed-with-reason"/);
  assert.doesNotMatch(source, /import\s+requests|import\s+urllib|requests\.|urllib\.request/);
  assert.equal(events.some((event) => /deterministic provider-first recovery adapter/.test(event.message ?? '')), true);
});

test('generation lifecycle retries generic payload preflight violations before execution', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-payload-preflight-retry-'));
  const events: WorkspaceRuntimeEvent[] = [];
  const strictRetryReasons: string[] = [];

  const result = await resolveGeneratedTaskGenerationRetryLifecycle({
    baseUrl: 'http://127.0.0.1:18080',
    request: {
      skillDomain: 'knowledge',
      prompt: 'generate clinical CSV artifacts and a markdown report',
      artifacts: [],
      expectedArtifactTypes: ['csv', 'markdown'],
      uiState: { sessionId: 'payload-preflight-retry' },
    },
    skill,
    skills: [skill],
    workspace,
    generation: {
      ok: true,
      runId: 'initial-missing-claims',
      response: generation('.sciforge/tasks/missing-claims.py', [
        'import json, sys',
        '_, input_path, output_path = sys.argv',
        'payload = {"message": "ok", "confidence": 0.8, "claimType": "analysis", "evidenceLevel": "runtime", "reasoningTrace": input_path, "uiManifest": [], "executionUnits": [], "artifacts": []}',
        'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
      ].join('\n')),
    },
    callbacks: {
      onEvent: (event) => events.push(event),
    },
    deps: depsWithRetry(async (params) => {
      strictRetryReasons.push(params.strictTaskFilesReason ?? '');
      return {
        ok: true,
        runId: 'retry-with-claims',
        response: generation('.sciforge/tasks/with-claims.py', [
          'import json, sys',
          '_, input_path, output_path = sys.argv',
          'payload = {"message": "ok", "confidence": 0.8, "claimType": "analysis", "evidenceLevel": "runtime", "reasoningTrace": input_path, "claims": [], "uiManifest": [], "executionUnits": [], "artifacts": []}',
          'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
        ].join('\n')),
      };
    }),
  });

  assert.equal(result.kind, 'task-files');
  assert.equal(result.generation.runId, 'retry-with-claims');
  assert.match(strictRetryReasons[0] ?? '', /required ToolPayload envelope fields: claims/);
  assert.equal(events.some((event) => /payload preflight/i.test(event.message ?? '')), true);
  assert.equal(events.some((event) => /complete ToolPayload envelope/.test(event.detail ?? '')), true);
});

test('generation lifecycle retries payload preflight again when strict retry surfaces outputPath directory misuse', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-payload-preflight-second-retry-'));
  let retryCount = 0;
  const strictRetryReasons: string[] = [];

  const result = await resolveGeneratedTaskGenerationRetryLifecycle({
    baseUrl: 'http://127.0.0.1:18080',
    request: {
      skillDomain: 'knowledge',
      prompt: 'generate clinical CSV artifacts and a markdown report',
      artifacts: [],
      uiState: { sessionId: 'payload-preflight-second-retry' },
    },
    skill,
    skills: [skill],
    workspace,
    generation: {
      ok: true,
      runId: 'initial-missing-claims',
      response: generation('.sciforge/tasks/missing-claims.py', [
        'import json, sys',
        '_, input_path, output_path = sys.argv',
        'payload = {"message": "ok", "uiManifest": [], "executionUnits": [], "artifacts": []}',
        'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
      ].join('\n')),
    },
    deps: depsWithRetry(async (params) => {
      retryCount += 1;
      strictRetryReasons.push(params.strictTaskFilesReason ?? '');
      if (retryCount === 1) {
        return {
          ok: true,
          runId: 'retry-outputpath-as-dir',
          response: generation('.sciforge/tasks/outputpath-as-dir.py', [
            'import json, sys',
            'from pathlib import Path',
            '_, input_path, output_path = sys.argv',
            'output_dir = Path(output_path)',
            'output_dir.mkdir(parents=True, exist_ok=True)',
            'raw_csv = output_dir / "raw.csv"',
            'payload = {"message": "ok", "claims": [], "uiManifest": [], "executionUnits": [], "artifacts": [{"id": "raw", "type": "csv", "path": str(raw_csv)}]}',
            'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
          ].join('\n')),
        };
      }
      return {
        ok: true,
        runId: 'retry-outputpath-parent',
        response: generation('.sciforge/tasks/outputpath-parent.py', [
          'import json, sys',
          'from pathlib import Path',
          '_, input_path, output_path = sys.argv',
          'output_dir = Path(output_path).parent / "clinical-analysis-output"',
          'output_dir.mkdir(parents=True, exist_ok=True)',
          'raw_csv = output_dir / "raw.csv"',
          'payload = {"message": "ok", "claims": [], "uiManifest": [], "executionUnits": [], "artifacts": [{"id": "raw", "type": "csv", "path": str(raw_csv)}]}',
          'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
        ].join('\n')),
      };
    }),
  });

  assert.equal(result.kind, 'task-files');
  assert.equal(result.generation.runId, 'retry-outputpath-parent');
  assert.equal(retryCount, 2);
  assert.match(strictRetryReasons[0] ?? '', /claims/);
  assert.match(strictRetryReasons[1] ?? '', /outputPath.*directory/i);
});

test('generation lifecycle returns repair payload when payload preflight retry is still invalid', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'sciforge-payload-preflight-still-invalid-'));

  const result = await resolveGeneratedTaskGenerationRetryLifecycle({
    baseUrl: 'http://127.0.0.1:18080',
    request: {
      skillDomain: 'knowledge',
      prompt: 'generate clinical CSV artifacts and a markdown report',
      artifacts: [],
      uiState: { sessionId: 'payload-preflight-still-invalid' },
    },
    skill,
    skills: [skill],
    workspace,
    generation: {
      ok: true,
      runId: 'initial-missing-claims',
      response: generation('.sciforge/tasks/missing-claims.py', [
        'import json, sys',
        '_, input_path, output_path = sys.argv',
        'payload = {"message": "ok", "uiManifest": [], "executionUnits": [], "artifacts": []}',
        'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
      ].join('\n')),
    },
    deps: depsWithRetry(async () => ({
      ok: true,
      runId: 'retry-still-missing-claims',
      response: generation('.sciforge/tasks/still-missing-claims.py', [
        'import json, sys',
        '_, input_path, output_path = sys.argv',
        'payload = {"message": "still missing", "uiManifest": [], "executionUnits": [], "artifacts": []}',
        'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
      ].join('\n')),
    })),
  });

  assert.equal(result.kind, 'payload');
  assert.match(result.payload.message, /strict retry still failed payload preflight/i);
  assert.match(result.payload.message, /claims/);
});

function depsWithRetry(
  requestAgentServerGeneration: GeneratedTaskGenerationLifecycleDeps['requestAgentServerGeneration'],
): GeneratedTaskGenerationLifecycleDeps {
  return {
    requestAgentServerGeneration,
    attemptPlanRefs: () => ({}),
    repairNeededPayload: (_request, _skill, reason) => repairPayload(reason),
    ensureDirectAnswerReportArtifact: (payload) => payload,
    mergeReusableContextArtifactsForDirectPayload: async (payload) => payload,
    validateAndNormalizePayload: async (payload) => payload,
    firstPayloadFailureReason: () => undefined,
    payloadHasFailureStatus: () => false,
  };
}

function repairPayload(reason: string): ToolPayload {
  return {
    message: reason,
    confidence: 0.2,
    claimType: 'runtime-diagnostic',
    evidenceLevel: 'runtime',
    reasoningTrace: reason,
    claims: [{ statement: reason, confidence: 0.2 }],
    uiManifest: [],
    executionUnits: [{
      id: 'provider-first-preflight-repair',
      status: 'repair-needed',
      tool: 'sciforge.generated-task-generation-lifecycle',
      failureReason: reason,
    }],
    artifacts: [],
  };
}

function directNetworkGeneration(path: string): AgentServerGenerationResponse {
  return generation(path, [
    'import json, sys, urllib.request',
    'input_path = sys.argv[1]',
    'output_path = sys.argv[2]',
    'urllib.request.urlopen("https://example.com", timeout=5)',
    'payload = {"message": "ok", "confidence": 0.5, "claimType": "fact", "evidenceLevel": "runtime", "reasoningTrace": input_path, "claims": [], "uiManifest": [], "executionUnits": [], "artifacts": []}',
    'open(output_path, "w", encoding="utf-8").write(json.dumps(payload))',
  ].join('\n'));
}

function generation(path: string, content: string): AgentServerGenerationResponse {
  return {
    taskFiles: [{ path, language: 'python', content }],
    entrypoint: { language: 'python', path },
    environmentRequirements: {},
    validationCommand: '',
    expectedArtifacts: [],
    patchSummary: 'test generation',
  };
}
