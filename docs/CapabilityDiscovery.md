# Capability Discovery

最后更新：2026-05-17

状态：partial generated-task callable / blocked-on-AgentServer-tool-transport（2026-05-17）。当前代码已经提供 `capability_discovery.search/expand/plan/explain` 的 TypeScript contract 与 runtime service、核心 manifest、AgentServer tiny handoff brief、generated-task authoring guidance、generated-task helper 调用桥和 targeted tests。生成任务可通过 `invoke_capability(task_input, "capability_discovery.search|expand|plan|explain", input)` 做 bounded progressive disclosure，并且 discovery 输出仍标记为 `not-evidence`。剩余缺口是 AgentServer/backend 直接 tool-call transport、workspace ledger 中的持久 discovery audit refs，以及 UI `CapabilityPlanSummary`。

## 目标

Capability Discovery 是 SciForge 从“场景配置系统”走向“通用聊天工作台”的关键薄腰。它回答的问题不是“现在有哪些工具列表”，而是：

```text
为了真正解决当前用户目标，agent 还需要了解哪些能力？
这些能力是否可用、需要什么权限、如何组合、缺什么 provider 或证据？
```

它本身应作为一个原子 capability 暴露给 AgentServer/backend，而不是由 runtime 写死固定触发时机。Agent 在发现当前 compact capability brief 不足、任务需要专业组件、provider 失败、验证失败或 selected refs 暗示新能力时，主动调用 discovery API。

## 当前代码基础

已有基础：

- `CapabilityManifest` 和 core/package manifest registry。
- manifest 到 harness candidate 的投影。
- provider availability / preflight / public route projection。
- capability broker compact brief 和 lazy expansion 的雏形。
- generated task 中的 `invoke_capability(...)` authoring path。
- harness stages：`selectCapabilities`、`onBeforeCapabilityBroker`、`onAfterCapabilityBroker`、`onToolPolicy`、`onBudgetAllocate`。

已部分落地：

- 稳定的 `capability_discovery` contract/types：`packages/contracts/runtime/capability-discovery.ts`。
- 核心 `capability_discovery` manifest：`packages/contracts/runtime/capability-manifest.ts`。
- `CapabilityDiscoveryService`：`src/runtime/capability-discovery.ts`，基于 manifest registry 与 broker 实现 `search/expand/plan/explain`。
- 初始 AgentServer handoff / prompt tiny brief：`src/runtime/gateway/context-envelope.ts` 与 `src/runtime/gateway/agentserver-generation-prompts.ts`。
- generated-task authoring guidance：`packages/skills/runtime-policy.ts` 与 generated task input 中的 `capabilityDiscovery` tiny brief。
- generated-task helper bridge：`sciforge_task.invoke_capability(..., "capability_discovery.search|expand|plan|explain", ...)` 可从 bounded task routes 产出 search/expand/plan/explain 结果；该桥不执行用户任务，仍要求真实工作走 capability route。
- leakage guard：discovery 输出与 prompt compaction 不暴露 auth、endpoint、workspace roots、raw provider internals；expand 只返回 public provider shape。
- targeted tests 覆盖 search-only、expand-selected、plan missing provider/permission、no-secret/no-endpoint/no-workspace-root leakage、tiny handoff brief、generated-task authoring、generated Python helper invocation 和 discovery not-evidence。

阻塞缺口：

- Gateway / AgentServer tool-call transport 尚未把 backend 的 `capability_discovery.*` 调用事件化为真实 runtime call。
- `capability_discovery` core manifest 已存在，generated-task helper bridge 已落地；但还缺 AgentServer 直接 tool-call transport，不能只因 manifest 可见就判定所有 backend 路径已能调用 discovery。
- UI 还没有基于 discovery plan 的普通用户 `CapabilityPlanSummary` 和高级调试折叠。
- discovery audit refs 当前为 deterministic ref ids / audit ids，尚未写入 workspace ledger。
- 自进化扩展点已预留，但尚未从 execution traces、provider failures、verification feedback、repair outcomes 中训练复杂排序系统。

## 核心原则

- Discovery 不执行用户任务，只发现、解释、展开和规划能力。
- Discovery 不替代 backend 推理。它提供候选和约束，最终任务规划仍由 backend 完成。
- Discovery 不替代 `Gateway.execute`。真正执行必须走 `invoke_capability` / Capability Gateway。
- Discovery 必须 progressive disclosure，不能把完整 registry、schema、examples、provider endpoint 或 secret 注入初始 prompt。
- Runtime/harness 不硬编码所有触发时机，只提供 discovery API brief、预算、权限、安全和审计兜底。
- Discovery 的推荐不构成完成态证据。完成态仍由 artifact、WorkEvidence、verification 和 Projection 决定。

## Agent 行为模型

推荐链路：

```text
Initial handoff
  -> compact capability brief
  -> tiny capability_discovery API brief

Agent/backend
  -> tries to reason with current compact brief
  -> if insufficient / ambiguous / provider failed / verification failed
       call capability_discovery.search(...)
       optionally call capability_discovery.expand(...)
       optionally call capability_discovery.plan(...)
       use invoke_capability(...) or ask user for missing permission/input

Runtime/Gateway
  -> enforce budget, side effects, provider-first policy and no-secret rules
  -> write discovery audit refs
  -> project user-facing summary and debug details
```

## API Surface

### `search`

Purpose: lightweight candidate retrieval.

```ts
type CapabilitySearchQuery = {
  goal: string;
  currentContextRefs?: string[];
  selectedRefs?: string[];
  desiredArtifacts?: string[];
  constraints?: {
    latencyTier?: 'instant' | 'quick' | 'bounded' | 'deep' | 'background';
    allowedSideEffects?: string[];
    privacyProfile?: string;
    maxCandidates?: number;
  };
};

type CapabilitySearchResult = {
  contract: 'sciforge.capability-discovery.v1';
  discoveryRef: string;
  auditRef: string;
  candidates: Array<{
    capabilityId: string;
    title: string;
    brief: string;
    kind: string;
    confidence: number;
    availability: 'ready' | 'missing-provider' | 'unauthorized' | 'unavailable';
    why: string[];
    sideEffectClass: string;
    missing?: string[];
  }>;
  excluded: Array<{ capabilityId: string; reason: string }>;
  next?: Array<'expand' | 'plan' | 'ask-user' | 'invoke-capability'>;
};
```

### `expand`

Purpose: reveal details only for selected candidates.

```ts
type CapabilityExpandQuery = {
  capabilityIds: string[];
  include?: Array<'schemas' | 'examples' | 'providers' | 'validators' | 'repairHints' | 'failureModes'>;
  maxSchemaBytes?: number;
};
```

`expand` may return input/output schema summaries, examples, validator refs, public provider route shape and repair hints. It must not return auth, raw endpoint secrets or workspace roots.

`expand` output carries `contract`、`discoveryRef`、`auditRef`、`expanded` and `excluded` fields. Returned providers are public shape only: provider id/label/kind/source/transport/health/requiredConfig/permissions/fallback eligibility; no endpoint/auth/workspace root/command is returned.

### `plan`

Purpose: propose a capability composition without executing it.

```ts
type CapabilityPlanQuery = {
  goal: string;
  candidateIds: string[];
  contextRefs?: string[];
  budget?: {
    maxToolCalls?: number;
    maxWallMs?: number;
    maxProviders?: number;
  };
};
```

Plan output should include ordered steps, dependencies, fallback routes, missing permissions/providers, expected artifacts and user confirmations needed.

Plan output also includes `completionEvidence: 'not-evidence'` to prevent Projection or TaskOutcome from treating a recommendation as task completion.

### `explain`

Purpose: produce user/debug/audit explanation.

```ts
type CapabilityExplainQuery = {
  planId?: string;
  capabilityIds?: string[];
  audience: 'user' | 'debug' | 'audit';
};
```

User-facing explanation should be short: “将使用文献检索、PDF 阅读、引用核验和报告生成；需要联网和下载 PDF 权限。” Debug/audit explanation may include scores, excluded candidates and provider readiness.

## Initial Handoff Brief

Initial context should include only a tiny brief:

```json
{
  "capabilityDiscovery": {
    "status": "available",
    "api": ["search", "expand", "plan", "explain"],
    "progressiveDisclosure": true,
    "useWhen": [
      "current capability brief is insufficient",
      "task requires specialized tools, skills, views, verifiers, or providers",
      "provider, preflight, validation, or repair needs an alternate route",
      "selected refs imply capabilities not present in the compact brief"
    ],
    "safety": {
      "noSecrets": true,
      "noInternalEndpoints": true,
      "noWorkspaceRoots": true,
      "executionRequiresInvokeCapability": true
    }
  }
}
```

## Runtime Responsibilities

Runtime and harness should not decide every discovery trigger. They should:

- expose the API brief in handoff;
- constrain budgets and allowed side effects;
- enforce no-secret/no-endpoint leakage;
- record discovery query/result refs;
- prevent provider-first bypass during execution;
- surface a user-readable ability plan summary;
- fold detailed discovery audit into debug/advanced UI.

## UI Shape

UI / execution decoupling 的通用函数边界见 [`UIExecutionDecoupling.md`](UIExecutionDecoupling.md)。本节只描述 discovery plan 如何投影到这些函数返回的 canonical view model。

Default UI should show a small summary:

```text
SciForge 将使用：文献检索、PDF 阅读、引用核验、报告生成。
需要：联网、下载 PDF。
```

Advanced/debug UI can show:

- selected candidates;
- expanded manifests;
- provider readiness;
- excluded capabilities and reasons;
- discovery audit refs;
- plan dependencies and fallback routes.

## Implementation Tasks

1. [x] Add `capability_discovery` manifest and schemas.
2. [x] Add discovery service backed by existing registry, broker, provider preflight and harness candidate projection.
3. [ ] Add full Gateway invocation transport / AgentServer tool-call surface.
4. [x] Add AgentServer handoff brief.
5. [x] Add deterministic audit/ref ids for discovery calls; [ ] persist discovery refs to workspace ledger.
6. [x] Add generated-task/agent authoring instructions for calling discovery then `invoke_capability`.
7. [ ] Add UI summary and debug folding.
8. [x] Add conformance tests:
   - search-only returns compact candidates;
   - expand only expands selected ids;
   - plan reports missing provider/permission;
   - no-secret/no-endpoint leakage;
   - discovery recommendation is not task success;
   - execution still requires `invoke_capability`.
