# SciForge - PROJECT.md

最后更新：2026-05-17

## 当前目标

SciForge 当前目标不是把任务板写满，而是持续用多进程、多 sub agents 从真实用户视角使用系统、发现问题、修复通用边界、优化默认体验。P1-P6 继续作为独立 user-proxy 进程运行：每个进程选择真实科研或 coding 任务，用 Codex in-app browser 自然使用 SciForge，按 hard requirements 严格验收。网页主回复没有真正解决用户问题时，必须判失败，记录最小证据，定位 root boundary，并推动通用修复。

产品方向：默认体验应是通用聊天工作台，而不是让普通用户理解场景、Scenario Builder、allowlist、run/audit/raw payload 或 execution unit。专业化应由 AgentServer/backend 通过 `capability_discovery.search/expand/plan/explain` 自主发现、展开和规划能力；执行仍必须通过 `invoke_capability` / Capability Gateway。UI 只通过函数式 Projection/UserAction API 展示、预览、订阅和干预数据，不直接解释 AgentServer 原文、handoff、stdout/stderr 或 workspace 内部结构。

当前重点：继续验证并打磨 `通用聊天入口 + capability_discovery + answer-first results + UI/执行层解耦`，让 SciForge 对真实用户任务更可靠：主回复解决问题、能力自动发现、失败诚实可恢复、调试信息默认折叠。

## 历史归档

- 2026-05-14/15 旧 CAP/PKG/GT/PSM/MEM/H022 与早期稳定性任务：[`docs/archive/PROJECT-history-2026-05-14-15.md`](docs/archive/PROJECT-history-2026-05-14-15.md)。
- 2026-05-16 Browser Multiturn Stability Sprint、PBT/P1/P2/P3/P4/ARC/MTG 长任务板与 issue 细节：[`docs/archive/PROJECT-history-2026-05-16-browser-sprint.md`](docs/archive/PROJECT-history-2026-05-16-browser-sprint.md)。
- 2026-05-17 UX simplification / capability discovery / P1-P6 strict-eval 长任务板、完整 Activity Log、run/session/evidence refs：[`docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md`](docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md)。

归档文件只作为 evidence/source lineage。当前 owner、状态、handoff、未关闭 blocker 和下一步行动以本文件为准。

## 必读边界

实现前先读：

- [`docs/SciForge-SingleAgent-Architecture.md`](docs/SciForge-SingleAgent-Architecture.md)
- [`docs/Architecture.md`](docs/Architecture.md)
- [`docs/AgentHarnessStandard.md`](docs/AgentHarnessStandard.md)
- [`docs/CapabilityDiscovery.md`](docs/CapabilityDiscovery.md)
- [`docs/UIExecutionDecoupling.md`](docs/UIExecutionDecoupling.md)

设计 contract 只写对应 docs：UI 解耦写 [`docs/UIExecutionDecoupling.md`](docs/UIExecutionDecoupling.md)，能力发现写 [`docs/CapabilityDiscovery.md`](docs/CapabilityDiscovery.md)，架构边界变化同步 [`docs/SciForge-SingleAgent-Architecture.md`](docs/SciForge-SingleAgent-Architecture.md) / [`docs/AgentHarnessStandard.md`](docs/AgentHarnessStandard.md)。`PROJECT.md` 只记录同步状态、owner、验收结论、run/session/artifact refs 和下一步。

## 不变原则

- 真实 browser 优先：每个活动进程必须用 Codex in-app browser 完成端到端多轮任务；terminal smoke 只能补充，不能替代用户可见证据。
- 任务成功优先：`TaskSuccess=true` 必须代表用户 hard requirements 被准确、完整、可核查地解决。
- 反假成功优先：`satisfied`、artifact refs、recover action、verification 未验证、summary 或计划，都不能单独算完成。
- 所有修复必须通用：修 policy / harness / capability / gateway / AgentServer / Projection / ArtifactDelivery / persistence / UI boundary，不写 prompt/provider/session/端口特例。
- Capability Discovery 是 agent 可调用原子能力：初始 context 只暴露 tiny API brief；完整 registry/schema/examples/providers 只能通过 progressive disclosure 获取；discovery recommendation/plan 永远是 `not-evidence`，不能当作任务完成证据。
- UI/执行层必须函数化：网页端通过 `ProjectionApi`、`UserActionApi`、`ProjectionSubscriptionApi` 等语义函数读写 presentation 状态和用户动作；raw ToolPayload、AgentServer direct text、handoff JSON、stdout/stderr、task attempt 只能进入 audit/debug channel。
- 主回复判定优先：结果面板、审计区、workspace refs 只是证据，不能替代用户可读答案。
- 同步优先：完成 milestone 后更新本文件、提交并 push；发现冲突时在对应任务写 blocker，不擅自回滚并行改动。

## 当前 Milestone

状态：active
总控：Codex Orchestrator
工作分支：`main`

目标：P1-P6 并行启动下一轮开放式 strict user-proxy exploration。每个进程必须完成：

- 选择真实用户目标和 hard requirements。
- 用 in-app browser 从默认入口自然提交任务，不预先打开 Scenario Builder 或手工配置 allowlist。
- 判断主回复、artifact、workspace refs 是否真正满足 hard requirements。
- 失败时用 sub agents 并行做 browser 复现、代码勘察、root-cause 定位、通用修复和测试补齐。
- 更新本文件，必要时只保存升级 evidence，提交并 push。

## Milestone Gates

- [ ] **P1-P6 Browser Gate**：每个进程完成至少一个新真实任务的 browser strict-eval。
- [ ] **Universal Chat Gate**：默认入口不要求理解场景名/builder，至少覆盖 literature、data analysis、coding/self-improvement 三类任务。
- [ ] **Discovery Runtime Gate**：真实任务中验证 handoff 有 tiny `capability_discovery` brief，agent 能在能力不足时调用 `search/expand/plan/explain`，结果通过 `invoke_capability` 执行或诚实失败。
- [ ] **Progressive Disclosure Gate**：初始 prompt/handoff 不注入完整 registry/schema/examples/provider endpoint；discovery 不泄漏 endpoint/secret/workspace root。
- [ ] **Answer-First Gate**：不展开 debug 时，用户能在 10 秒内判断任务是否完成、缺什么、下一步点哪里。
- [ ] **UI/API Decoupling Gate**：用户动作和调试展开走 `UserActionApi`，artifact preview / selected object / retry / recover / import-verify-confirm 继续收敛到函数式 API。
- [ ] **General Fix Gate**：每个修复有 targeted tests 或 conformance fixture，并说明为什么不依赖单 prompt/provider/session。
- [ ] **Sync Gate**：每个 milestone 更新 `PROJECT.md`、提交并 push 到 `origin/main`。

## 并行进程矩阵

| 进程 | 严评主题 | UI | Writer | AgentServer | Workspace | State | Config |
|---|---|---:|---:|---:|---|---|---|
| P1 | 最新论文 / 全文科研调研 | 5173 | 5174 | 18080 | `workspace/parallel/p1` | `.sciforge/parallel/p1` | `.sciforge/parallel/p1/config.local.json` |
| P2 | 数据分析 / 可复现实验 | 5273 | 5274 | 18180 | `workspace/parallel/p2` | `.sciforge/parallel/p2` | `.sciforge/parallel/p2/config.local.json` |
| P3 | 论文复现 / 代码调试 | 5373 | 5374 | 18280 | `workspace/parallel/p3` | `.sciforge/parallel/p3` | `.sciforge/parallel/p3/config.local.json` |
| P4 | SciForge 自我改进 coding | 5473 | 5474 | 18380 | `workspace/parallel/p4` | `.sciforge/parallel/p4` | `.sciforge/parallel/p4/config.local.json` |
| P5 | 方法学评审 / 实验设计 | 5573 | 5574 | 18480 | `workspace/parallel/p5` | `.sciforge/parallel/p5` | `.sciforge/parallel/p5/config.local.json` |
| P6 | 长上下文记忆 / 交付物迭代 | 5673 | 5674 | 18580 | `workspace/parallel/p6` | `.sciforge/parallel/p6` | `.sciforge/parallel/p6/config.local.json` |

启动模板：

```bash
SCIFORGE_INSTANCE=p2 \
SCIFORGE_INSTANCE_ID=p2 \
SCIFORGE_UI_PORT=5273 \
SCIFORGE_WORKSPACE_PORT=5274 \
SCIFORGE_AGENT_SERVER_PORT=18180 \
SCIFORGE_WORKSPACE_PATH=workspace/parallel/p2 \
SCIFORGE_STATE_DIR=.sciforge/parallel/p2 \
SCIFORGE_LOG_DIR=.sciforge/parallel/p2/logs \
SCIFORGE_CONFIG_PATH=.sciforge/parallel/p2/config.local.json \
SCIFORGE_WORKSPACE_WRITER_URL=http://127.0.0.1:5274 \
SCIFORGE_AGENT_SERVER_URL=http://127.0.0.1:18180 \
npm run dev
```

## Active UX-System Board

### UX-SYSTEM-TASK-20260517-universal-chat-entry

状态：partial P4 shell fix landed / blocked-on-P1-P6-browser-validation
Owner：Orchestrator + P1-P6

已完成：P4 默认 shell 不再显示 `Scenario Runtime` / `Execution Unit` / `文献证据评估场景` / raw terms；文案改为 `聊天工作台`、`Ask SciForge`、`当前上下文`。

未闭环：P1-P6 还没有完成下一轮跨领域 browser 验收。下一步必须验证普通用户无需打开 builder，即可提交 literature/data/coding/methodology/long-context 任务并理解答案、能力选择和下一步。

### UX-SYSTEM-TASK-20260517-capability-discovery-api

状态：partial backend retry consumption + ledger replay refs + default UI summary card + debug folding / blocked-on-P1-P6-browser-validation
Owner：capability_discovery owner / Orchestrator

已完成：contract/types、核心 manifest、service、tiny handoff brief、prompt guidance、generated-task helper bridge、AgentServer stream-side tool-call -> tool-result bridge、session-bundle sanitized audit record、workspace ledger replay event、bounded retry result consumption、`ProjectionApi.getCapabilityPlanSummary`、默认 Results UI 能力计划卡、`UserActionApi.openDebugAudit` debug folding action boundary、targeted tests。

未闭环：真实 P1-P6 browser 任务还需验证 agent 是否实际自主调用 discovery、是否分层揭示、是否不泄漏 endpoint/secret/workspace root、是否最终通过 `invoke_capability` 执行或给出诚实失败。

### UX-SYSTEM-TASK-20260517-discovery-progressive-disclosure

状态：partial backend retry consumption + ledger replay refs + default UI summary card + debug folding / blocked-on-P1-P6-browser-validation
Owner：capability_discovery owner / Orchestrator

已完成：search 返回 compact candidates；expand 只展开指定 capability；plan 返回步骤、fallback、missing provider/permission、expected artifacts、user confirmations，并标 `completionEvidence=not-evidence`；explain 支持 user/debug/audit 粒度；输出和 prompt compaction 已做 endpoint/auth/workspace-root/secret 防泄漏。

未闭环：P1/P2/P4 等真实任务需验证初始 context 不膨胀、agent 能按需 discovery、UI 只展示用户可读摘要，debug refs 仍折叠。

### UX-SYSTEM-TASK-20260517-ui-execution-decoupling

状态：in_progress
Owner：UI-Execution Decoupling Owner

已完成：最小 `ProjectionApi` / `UserActionApi` / `ProjectionSubscriptionApi`；manual preview、selected object、retry、recover、approve/cancel、open debug audit 语义动作；WorkspaceObjectPreview 的 workspace preview hydration 已下沉到可替换 `ArtifactPreviewHydrationApi`；ResultsRenderer recover/debug/selection 入口已逐步走 UserActionApi；raw/debug 术语默认 scrub 有 targeted tests。

未闭环：还不是全 UI ProjectionApi-only；部分组件仍直接调用 projection helper、workspace preview client 和 audit helpers。import/verify-confirm transaction、artifact 已存在但 handoff 漂移的完整恢复路径、默认 projection raw scrub conformance 仍要继续。

### UX-SYSTEM-TASK-20260517-answer-first-results-panel

状态：todo
Owner：unassigned

目标：结果区默认按用户任务组织：任务是否解决、主答案/报告、关键证据、下一步/恢复按钮；run/audit/raw payload/execution unit 默认进 debug drawer。下一轮 P1-P6 每个进程至少记录一个完成/失败/partial 结果区用户视角评测。

### UX-SYSTEM-TASK-20260517-strict-user-proxy-process

状态：todo
Owner：Orchestrator + P1-P6

目标：把 P1-P6 重新作为开放式真实用户进程，而不是固定剧本回归。每轮必须记录 hard requirements、TaskSuccess、AnswerQuality、root boundary、是否启动 sub agents、修复和验证结果。

## P1-P6 下一轮探索卡

每个进程自行选择真实任务，可沿用角色但不要复刻旧 prompts。每张卡完成后，把结论压缩写回本节或 discovered queue；长证据放 workspace/evidence，完整历史进 archive。

### P1 Literature / Full-Text Discovery

状态：ready-for-next-milestone
下一步建议：最新 arXiv/bioRxiv/PubMed 主题调研，要求全文/PDF、证据位置、中文报告 artifact、selected report follow-up。重点挑战 browser-rendered/full-text provider、discovery 是否自主选择能力、metadata 是否仍被诚实标为未完成。

### P2 Data Analysis / Reproducibility

状态：ready-for-next-milestone
下一步建议：用户上传或描述 messy CSV/TSV 分析任务，要求 QC、统计模型、图表、复跑命令、sensitivity/robustness 和 selected chart follow-up。重点挑战 generated code syntax/repair、result consistency、artifact grounding。

### P3 Paper Reproduction / Code Debug

状态：ready-for-next-milestone
下一步建议：真实代码调试/论文复现任务，要求先跑测试、定位 root cause、改代码、复跑测试、报告 remaining risks。重点挑战 `DISC-20260517-P3-005`：generated task syntax preflight 后是否能 bounded repair/regenerate，而不是把内部生成错误当终态主回复。

### P4 SciForge Self-Improvement Coding

状态：ready-for-next-milestone
下一步建议：让 SciForge 阅读本仓库某个 UI/runtime/gateway 边界并实施小补丁，要求 patch refs、测试命令、风险说明。重点挑战 coding delivery summary、workspace side-effect salvage、debug folding、PR-style answer-first summary。

### P5 Methodology / Experimental Design

状态：ready-for-next-milestone
下一步建议：带资源/伦理/样本限制的 protocol review 或实验设计迭代。重点挑战 `DISC-20260517-P5-004`：primary task syntax failure 后 supplemental artifacts 是否能形成 coherent repair-needed 或 promoted repaired attempt。

### P6 Long-Context / Deliverable Iteration

状态：ready-for-next-milestone
下一步建议：多轮 research package / mini grant / reproducibility audit，要求跨轮约束变更、selected artifact 追问、reload 后继续。重点挑战 ledger/context projection、旧约束污染、direct read-only vs durable writeback 边界。

## Discovered Task Queue

只保留未关闭或可能在下一轮再次成为 blocker 的任务。已完成 discovered tasks 和完整 evidence 已归档到 [`docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md`](docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md)。

### DISC-20260517-P3-005 Generated task syntax preflight needs bounded repair before terminal code-debug failure

状态：todo
发现者：P3
轻量证据：P3 dependency-aware MMD debug final recheck run `project-literature-evidence-review-mp9pzl5a-e56fsc`；handoff 已修正为 fresh（`expectedArtifactTypes=[]`、`selectedComponentIds=[]`、`priorAttemptCount=0`、`repairContinuation=false`），但主回复停在 `Generated Python entrypoint failed syntax preflight before execution`，没有交付 root cause、patch summary、pytest rerun、test result 或 remaining risks。
通用性说明：任何 code-debug / reproduction task 都可能生成语法错误 entrypoint；syntax preflight fail-fast 是正确边界，但应触发 bounded repair/regeneration 或 coherent repair-needed/completion-candidate。
疑似边界：AgentServer / generated-task execution / repair loop / Projection / ArtifactDelivery

Todo：
- [x] 最小复现
- [x] 定位 root boundary
- [ ] 通用修复
- [ ] targeted tests / 必要 browser 复验证据
- [x] 更新 Activity Log

### DISC-20260517-P5-004 Generated-task syntax failure can remain as failed projection despite supplemental artifacts

状态：todo
发现者：P5
轻量证据：P5 microbiome session `workspace/parallel/p5/.sciforge/sessions/2026-05-16_literature-evidence-review_session-workspace-biomedical-knowledge-graph-_kras-g12d_-_-mp8tjp68-mp8y1pdp-7ymg7a`；primary task `generated-literature-99177170665d` failed with Python syntax error；supplemental task `generated-literature-1b4e7268e935` wrote useful `research-report.md` / `evidence-matrix.md` / `notebook-timeline.md`，但 user-visible Projection stayed foregrounded on primary syntax failure.
通用性说明：任何 generated task can fail before writing intended ToolPayload while supplement/recovery creates useful artifacts; Projection should promote repaired attempt or expose one coherent repair-needed state, not mix failed primary and useful artifacts ambiguously.
疑似边界：generated-task execution / supplement lifecycle / Projection / ArtifactDelivery

Todo：
- [x] 最小复现
- [ ] 定位 root boundary
- [ ] 通用修复
- [ ] targeted tests / 必要 browser 复验证据
- [ ] 更新 Activity Log

### New Discovered Task Template

```markdown
### DISC-YYYYMMDD-NNN 简短标题

状态：todo / in_progress / blocked / done
发现者：P?
轻量证据：URL 或 workspace 路径、关键 run/session/artifact、用户可见现象、为什么失败
升级证据：仅在失败、修复前后对比、UI/workspace 不一致、milestone 验收时保存
通用性说明：为什么这不是单个 prompt/provider/session/端口偶发问题
疑似边界：policy / harness / capability / gateway / AgentServer / Projection / ArtifactDelivery / UI restore / persistence / docs

Todo：
- [ ] 最小复现
- [ ] 定位 root boundary
- [ ] 通用修复
- [ ] targeted tests / 必要 browser 复验证据
- [ ] 更新 Activity Log
```

## 工作记录与证据策略

- `PROJECT.md` 只保留当前同步面板，不粘贴大段 DOM/log/code。
- 证据文件只在失败、修复前后对比、UI/workspace 不一致、milestone 验收时保存。
- 每条 Activity Log 最多一行，写清 owner、结论、关键 refs、验证命令和剩余 blocker。
- 修改 `PROJECT.md` 前先读最新文件、`git status`、相关 diff，避免覆盖并行进程刚写入的 owner/status。

## 验证命令

常用 targeted suites：

```bash
node --import tsx --test src/runtime/gateway/agentserver-generation-dispatch.test.ts src/runtime/gateway/agentserver-stream.test.ts src/runtime/capability-discovery.test.ts
node --import tsx --test src/ui/src/app/ResultsRenderer.test.ts src/ui/src/app/projectionApi.test.ts src/ui/src/app/uiActionBoundary.test.ts src/ui/src/app/results/WorkspaceObjectPreview.test.ts
node --import tsx --test src/runtime/gateway/generated-task-runner-execution-lifecycle.test.ts src/runtime/gateway/generated-task-runner-generation-lifecycle.test.ts
npm run typecheck
git diff --check
```

Milestone 完成门：

```bash
npm run verify:single-agent-final
```

Browser 验证必须使用 Codex in-app browser，不用普通 terminal smoke 替代。

## Activity Log

- 2026-05-17 - Orchestrator - 收尾整理根同步面板：将 2026-05-17 已完成 P1-P6 strict-eval、closed discovered tasks 和长 Activity Log 归档到 [`docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md`](docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md)；根 `PROJECT.md` 只保留当前 UX 主线、P1-P6 下一轮探索卡、未关闭 discovered tasks、验证/同步规则和 handoff。下一步继续多进程、多 sub agents 探索真实使用场景。

## Current Handoff

下一轮接手优先级：

1. 启动 P1-P6 下一轮真实 browser exploration，不复刻旧 prompts；每个进程选择一个新真实任务并写 hard requirements。
2. 优先验证 Universal Chat / Capability Discovery / Progressive Disclosure / Answer-First Results 在真实任务里是否成立。
3. 对失败启动 sub agents：browser 复现、代码边界勘察、通用修复、测试补齐、证据整理可并行，但写集合必须 disjoint。
4. 继续推进 `DISC-20260517-P3-005` 和 `DISC-20260517-P5-004`；它们不应抢占 UX 主线，除非在新真实任务中再次成为 blocker。
5. 每个 milestone 更新本文件、提交并 push；完成项细节进入 archive，不让根面板再次膨胀。
