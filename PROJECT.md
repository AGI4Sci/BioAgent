# SciForge Project Protocol

最后更新：2026-05-18

## North Star

SciForge 的目标是成为能处理复杂科研、工程和产品任务的自进化 Agent 工作台。当前研发方式是让多个 Codex 自动化进程代替真实用户持续使用 SciForge：提出复杂任务、观察网页主回复和 artifact、发现失败边界、修复设计文档和代码，再用测试与 browser 证据验证。

“成功完成任何复杂任务”不能靠单个 prompt 许愿实现。SciForge 必须逐步具备以下性质：

- 默认入口是普通用户能理解的通用聊天工作台，而不是 Scenario Builder、allowlist、execution unit 或 raw payload 调试台。
- Agent 能自主发现、展开、规划并调用能力；能力不足时诚实说明缺口和恢复路径。
- 主回复先解决用户问题；artifact、workspace refs、audit/debug 只是证据和追踪材料。
- 复杂任务可以分解、执行、验证、恢复、复跑和跨轮继续。
- 修复必须通用，落在 policy、harness、capability、gateway、AgentServer、Projection、ArtifactDelivery、persistence 或 UI boundary，不写单 prompt、单 provider、单 session、单端口特例。
- 每轮自动化都要产生可复盘的证据：用户目标、hard requirements、可见结果、失败边界、修复、测试和剩余风险。

## Operating Mode

本文件是多 Codex 自动化的共享协议和同步面板。它不保存大段 DOM、日志或源码，不替代架构文档。所有进程必须先读本文件，再选择任务。

自动化进程分为三类：

- **User-Proxy Worker**：像真实用户一样使用 SciForge，提交开放式复杂任务，判断是否真的完成。
- **Repair Worker**：根据 user-proxy 发现的问题定位 root boundary，修改文档或代码，补测试。
- **Integration Worker**：合并并行进展，处理冲突，跑验证，保持主线可运行。

每个 worker 的核心循环：

1. 读 `PROJECT.md`、`git status`、相关 docs/tests。
2. 选择一个真实任务或一个已发现 blocker。
3. 用 Codex in-app browser 从默认入口自然使用 SciForge；不要用内部知识绕过 UI 体验。
4. 记录 hard requirements 和用户可见结果。
5. 若失败，定位通用 root boundary；必要时并行启动 sub agents 做勘察、修复或测试。
6. 修改代码或设计文档。
7. 跑最小相关测试；高风险改动再跑更大 gate。
8. 更新本文件的状态、证据 refs、验证命令和剩余 blocker。
9. 小步提交、push，由 integration worker 合并。

## Parallelization Protocol

### Work Isolation

高并行优先使用独立 branch 或独立 worktree，不要多个进程长期写同一个工作目录。

建议分支命名：

```text
codex/<machine-or-process>/<short-task>
integration/sciforge-auto
main
```

建议工作目录：

```text
../SciForge-p1
../SciForge-p2
../SciForge-repair-capability
../SciForge-integration
```

每个 worker 只修改自己任务需要的最小文件集。涉及共享 contract、核心 gateway、Projection 或 UI shell 时，必须在本文件对应任务写明影响面和验证命令。

### Heartbeat

自动化心跳建议：

- User-Proxy Worker：每 20-30 分钟记录一次状态，长任务至少保存当前 run/session/artifact refs。
- Repair Worker：每 30-45 分钟记录 root-cause、已改文件、测试状态。
- Integration Worker：每 60 分钟拉取 worker branches，按风险逐个合并并跑 gate。

心跳内容必须短，但要可接手：

```markdown
- 2026-05-18 HH:mm P2：messy CSV 分析任务 strict-eval failed；主回复缺少复跑命令；refs: ...；疑似边界: ArtifactDelivery/ResultsRenderer；next: 修 answer-first summary + targeted test。
```

### Sub Agent Rules

同一进程内可以使用多个 sub agents，但必须给清晰边界：

- explorer：只回答具体代码问题，例如“ProjectionApi 在哪里组装主回复？”
- worker：负责明确文件或模块，例如“只改 `src/ui/src/app/results/**` 和相关 tests”。
- 主进程负责整合、验证和更新 `PROJECT.md`。

不要让多个 worker 同时自由修改同一文件集。

## Invariant Principles

这些原则继承自旧版 `PROJECT.md`，优先级高于任何单轮任务、单个 worker 偏好或临时 prompt。

- **真实 browser 优先**：每个活动进程必须用 Codex in-app browser 完成端到端多轮任务；terminal smoke 只能补充，不能替代用户可见证据。
- **任务成功优先**：`TaskSuccess=true` 必须代表用户 hard requirements 被准确、完整、可核查地解决。
- **反假成功优先**：`satisfied`、artifact refs、recover action、verification 未验证、summary 或计划，都不能单独算完成。
- **所有修复必须通用**：修 policy / harness / capability / gateway / AgentServer / Projection / ArtifactDelivery / persistence / UI boundary，不写 prompt/provider/session/端口特例。
- **Capability Discovery 是 agent 可调用原子能力**：初始 context 只暴露 tiny API brief；完整 registry/schema/examples/providers 只能通过 progressive disclosure 获取；discovery recommendation/plan 永远是 `not-evidence`，不能当作任务完成证据。
- **UI/执行层必须函数化**：网页端通过 `ProjectionApi`、`UserActionApi`、`ProjectionSubscriptionApi` 等语义函数读写 presentation 状态和用户动作；raw ToolPayload、AgentServer direct text、handoff JSON、stdout/stderr、task attempt 只能进入 audit/debug channel。
- **主回复判定优先**：结果面板、审计区、workspace refs 只是证据，不能替代用户可读答案。
- **同步优先**：完成 milestone 后更新本文件、提交并 push；发现冲突时在对应任务写 blocker，不擅自回滚并行改动。

## Product Principles

- **默认通用聊天入口**：普通用户不应被迫理解 Scenario Builder、allowlist、execution unit、raw payload 或 run/audit 结构。
- **Answer-first**：默认结果区先给主答案、完成度、关键证据和下一步；run/audit/raw payload/execution unit 默认折叠。
- **Capability-driven**：能力发现、展开、规划、解释走 `capability_discovery.search/expand/plan/explain`；能力执行走 `invoke_capability` / Capability Gateway。
- **诚实失败**：能力不足、provider 不可用、数据不可得、生成代码失败或验证失败时，必须说明缺口、已完成部分、可恢复动作和下一步。
- **文档与代码同步**：设计 contract 写对应 docs；`PROJECT.md` 只记录当前目标、owner、状态、证据和下一步。

## Required Reading

实现前按需读取：

- [`docs/SciForge-SingleAgent-Architecture.md`](docs/SciForge-SingleAgent-Architecture.md)
- [`docs/Architecture.md`](docs/Architecture.md)
- [`docs/AgentHarnessStandard.md`](docs/AgentHarnessStandard.md)
- [`docs/CapabilityDiscovery.md`](docs/CapabilityDiscovery.md)
- [`docs/UIExecutionDecoupling.md`](docs/UIExecutionDecoupling.md)

设计 contract 落点：

- UI 解耦：[`docs/UIExecutionDecoupling.md`](docs/UIExecutionDecoupling.md)
- 能力发现：[`docs/CapabilityDiscovery.md`](docs/CapabilityDiscovery.md)
- Agent/harness 架构：[`docs/SciForge-SingleAgent-Architecture.md`](docs/SciForge-SingleAgent-Architecture.md)、[`docs/AgentHarnessStandard.md`](docs/AgentHarnessStandard.md)

## Milestone: Autonomous User-Proxy Gauntlet

状态：active
总控：Codex Orchestrator
集成分支：`main` 或 `integration/sciforge-auto`

目标：P1-P6 并行进行开放式 strict user-proxy exploration，并把失败转化为通用修复。

### Gates

- [ ] **P1-P6 Browser Gate**：每个进程完成至少一个新真实任务的 browser strict-eval。
- [ ] **Universal Chat Gate**：默认入口不要求理解场景名/builder，至少覆盖 literature、data analysis、coding/self-improvement 三类任务。
- [ ] **Discovery Runtime Gate**：真实任务中验证 handoff 有 tiny `capability_discovery` brief，agent 能在能力不足时调用 `search/expand/plan/explain`，结果通过 `invoke_capability` 执行或诚实失败。
- [ ] **Progressive Disclosure Gate**：初始 prompt/handoff 不注入完整 registry/schema/examples/provider endpoint；discovery 不泄漏 endpoint/secret/workspace root。
- [ ] **Answer-First Gate**：不展开 debug 时，用户能在 10 秒内判断任务是否完成、缺什么、下一步点哪里。
- [ ] **UI/API Decoupling Gate**：用户动作和调试展开走 `UserActionApi`，artifact preview / selected object / retry / recover / import-verify-confirm 继续收敛到函数式 API。
- [ ] **General Fix Gate**：每个修复有 targeted tests 或 conformance fixture，并说明为什么不依赖单 prompt/provider/session。
- [ ] **Sync Gate**：每个 milestone 更新 `PROJECT.md`、提交并 push。

## Worker Matrix

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

## Strict Evaluation Template

每个 user-proxy 任务必须记录以下内容：

```markdown
### EVAL-YYYYMMDD-P?-NNN 标题

状态：pass / partial / fail / blocked
用户目标：
Hard requirements：
- ...
Browser entry：
- URL:
- run/session/artifact refs:
用户可见结论：
- 主回复是否直接解决问题：
- artifact 是否可打开、可理解、可复用：
- 缺失或误导：
TaskSuccess：
AnswerQuality：
Root boundary：
修复动作：
验证：
剩余风险：
```

判定标准：

- **pass**：hard requirements 全部满足，主回复可独立理解，关键证据可核查。
- **partial**：产出了有用结果，但缺少复跑、证据、artifact 可用性、恢复路径或关键要求。
- **fail**：主回复没有解决用户问题，或把内部错误包装成成功。
- **blocked**：外部服务、凭据、数据权限或环境缺口阻塞；必须给出诚实替代方案。

## Active UX-System Board

### UX-SYSTEM-TASK-20260517-universal-chat-entry

状态：partial / blocked-on-P1-P6-browser-validation
Owner：Orchestrator + P1-P6

已完成：P4 默认 shell 不再显示 `Scenario Runtime` / `Execution Unit` / `文献证据评估场景` / raw terms；文案改为 `聊天工作台`、`Ask SciForge`、`当前上下文`。

下一步：验证普通用户无需打开 builder，即可提交 literature/data/coding/methodology/long-context 任务并理解答案、能力选择和下一步。

### UX-SYSTEM-TASK-20260517-capability-discovery-api

状态：partial / blocked-on-P1-P6-browser-validation
Owner：capability_discovery owner / Orchestrator

已完成：contract/types、核心 manifest、service、tiny handoff brief、prompt guidance、generated-task helper bridge、AgentServer stream-side tool-call -> tool-result bridge、session-bundle sanitized audit record、workspace ledger replay event、bounded retry result consumption、`ProjectionApi.getCapabilityPlanSummary`、默认 Results UI 能力计划卡、`UserActionApi.openDebugAudit` debug folding action boundary、targeted tests。

下一步：真实 P1-P6 browser 任务验证 agent 是否实际自主调用 discovery、是否分层揭示、是否不泄漏 endpoint/secret/workspace root、是否最终通过 `invoke_capability` 执行或给出诚实失败。

### UX-SYSTEM-TASK-20260517-discovery-progressive-disclosure

状态：partial / blocked-on-P1-P6-browser-validation
Owner：capability_discovery owner / Orchestrator

已完成：search 返回 compact candidates；expand 只展开指定 capability；plan 返回步骤、fallback、missing provider/permission、expected artifacts、user confirmations，并标 `completionEvidence=not-evidence`；explain 支持 user/debug/audit 粒度；输出和 prompt compaction 已做 endpoint/auth/workspace-root/secret 防泄漏。

下一步：P1/P2/P4 等真实任务验证初始 context 不膨胀、agent 能按需 discovery、UI 只展示用户可读摘要，debug refs 仍折叠。

### UX-SYSTEM-TASK-20260517-ui-execution-decoupling

状态：in_progress
Owner：UI-Execution Decoupling Owner

已完成：最小 `ProjectionApi` / `UserActionApi` / `ProjectionSubscriptionApi`；manual preview、selected object、retry、recover、approve/cancel、open debug audit 语义动作；WorkspaceObjectPreview 的 workspace preview hydration 已下沉到可替换 `ArtifactPreviewHydrationApi`；ResultsRenderer recover/debug/selection 入口已逐步走 UserActionApi；raw/debug 术语默认 scrub 有 targeted tests。

下一步：继续清理直接调用 projection helper、workspace preview client 和 audit helpers 的组件；补 import/verify-confirm transaction、artifact 已存在但 handoff 漂移的完整恢复路径、默认 projection raw scrub conformance。

### UX-SYSTEM-TASK-20260517-answer-first-results-panel

状态：todo
Owner：unassigned

目标：结果区默认按用户任务组织：任务是否解决、主答案/报告、关键证据、下一步/恢复按钮；run/audit/raw payload/execution unit 默认进 debug drawer。下一轮 P1-P6 每个进程至少记录一个完成/失败/partial 结果区用户视角评测。

### UX-SYSTEM-TASK-20260517-strict-user-proxy-process

状态：todo
Owner：Orchestrator + P1-P6

目标：把 P1-P6 重新作为开放式真实用户进程，而不是固定剧本回归。每轮必须记录 hard requirements、TaskSuccess、AnswerQuality、root boundary、是否启动 sub agents、修复和验证结果。

## P1-P6 Exploration Cards

每个进程自行选择真实任务，可沿用角色但不要复刻旧 prompts。完成后把结论压缩写回本节或 Discovered Queue；长证据放 workspace/evidence，完整历史进 archive。

### P1 Literature / Full-Text Discovery

状态：partial / strict-eval-failed-contract-recovery-verified
建议任务：最新 arXiv/bioRxiv/PubMed 主题调研，要求全文/PDF、证据位置、中文报告 artifact、selected report follow-up。
重点挑战：browser-rendered/full-text provider、discovery 是否自主选择能力、metadata 是否仍被诚实标为未完成。

#### EVAL-20260518-P1-001 single-cell diffusion full-text literature survey

状态：partial / fail on user hard requirements
用户目标：从默认聊天入口提交 2026 年以来 single-cell perturbation diffusion models 最新论文/全文调研任务。
Hard requirements：
- 最新论文列表至少 5 篇；每篇标题、年份/日期、来源、链接/DOI。
- 全文/PDF 获取或不可得说明；每篇证据位置；中文报告 artifact + 证据矩阵；关键结论、局限性、下一步；selected report follow-up 可用。
Browser entry：
- URL: `http://127.0.0.1:5173`
- before-fix run/session refs: `project-literature-evidence-review-mpa1pkme-scu50q` / `session-literature-evidence-review-mpa0zi3o-cgsmke`
- after-fix run/session refs: `project-literature-evidence-review-mpa1vfgy-6frcnz` / `session-literature-evidence-review-mpa1t341-69iryd`
用户可见结论：
- 主回复是否直接解决问题：否；before-fix 因 `intent=continuation` 进入 unbounded generation loop，convergence guard 在 219973 tokens 终止；after-fix 变为 `intent=fresh`，但 generated task contract 失败。
- artifact 是否可打开、可理解、可复用：否；只有 runtime diagnostic / verification diagnostic，没有论文列表、PDF evidence 或中文报告。
- 缺失或误导：capability discovery 没有形成用户可见能力计划；debug/audit 默认折叠基本成立；结果区诚实显示 recoverable，没有假成功。
TaskSuccess：false
AnswerQuality：partial；fresh-intent 污染已修复并经 browser 复测，但用户 hard requirements 仍未完成。
Root boundary：conversation-policy goal_snapshot fresh-vs-future-followup intent classification；残留 blocker 为 AgentServer generated-task authoring / outputPath ToolPayload contract。
修复动作：`goal_snapshot.py` 现在把“完成后我会继续追问 / report follow-up 可用”识别为未来 artifact follow-up 要求，而不是当前 continuation；新增 unittest 覆盖。
验证：`python3 packages/reasoning/conversation-policy/tests/test_goal_snapshot.py`；manual invocation of 17 `test_execution_classifier.py` functions；`node --import tsx --test src/runtime/capability-discovery.test.ts`；`node --import tsx --test src/ui/src/app/ResultsRenderer.test.ts src/ui/src/app/projectionApi.test.ts`；`npm run typecheck`；`git diff --check`。
剩余风险：全文调研仍被 `literature_review_task.py does not write the SciForge outputPath argument` 阻塞；需要修 generated-task authoring / strict retry 后重新跑 P1 browser，并再验证 selected report follow-up。

#### EVAL-20260518-P1-002 English selected report follow-up recheck

状态：partial / fail on user hard requirements
用户目标：从默认聊天入口提交英文开放式 P1 文献/全文调研任务，明确要求 latest papers、PDF/full-text availability、evidence locations、Chinese report artifact、key conclusions、limitations、selected report follow-up。
Hard requirements：
- 最新论文列表；全文/PDF 可得或不可得说明；证据位置；中文报告 artifact；关键结论；局限性；selected report follow-up。
Browser entry：
- URL: `http://127.0.0.1:5173`
- before-English-fix run/session refs: `project-literature-evidence-review-mpa2pb53-h5wnm5` / `session-literature-evidence-review-mpa2jmrj-6j2f35`
- after-English-fix run/session refs: `project-literature-evidence-review-mpa2w8is-ng5lg9` / `session-literature-evidence-review-mpa2sak7-qf6guo`
- diagnostic artifact: `.sciforge/sessions/2026-05-17_literature-evidence-review_session-literature-evidence-review-mpa2sak7-qf6guo/task-results/generated-literature-dbbdfb8c4470.json`
用户可见结论：
- 主回复是否直接解决问题：否；before-English-fix 仍因 `selected report follow up` 被误判为 `intent=continuation` 并触发 generation convergence guard；after-English-fix 前台显示 `intent=fresh`，但 AgentServer strict retry 仍生成不写 `outputPath` 的 static/non-interface task。
- artifact 是否可打开、可理解、可复用：只有 runtime diagnostic / verification result 可检查；没有真正 paper-list、PDF/full-text evidence、evidence matrix 或中文报告 artifact。
- capability_discovery 是否自主使用：未形成用户可见 discovery plan；generation 直接尝试 workspace task。
- debug/audit/raw 信息是否默认折叠：是；结果区显示 answer-first recoverable failure，run details / process / diagnostic refs 默认在折叠区。
TaskSuccess：false
AnswerQuality：partial；fresh intent 与 deterministic contract recovery 均已验证，但没有满足任何科研交付 hard requirement。
Root boundary：conversation-policy future follow-up intent classification；AgentServer generated-task authoring / strict retry / generated-task interface contract；ArtifactDelivery 只能交付 diagnostic，不能补论文报告。
修复动作：`goal_snapshot.py` 增加英文 `follow-up` fresh-task 保护：无 prior context/explicit refs 且没有 previous/prior/last/above/earlier/existing 信号时，不把 `follow up` 当当前 continuation；新增 unittest 覆盖 browser prompt。前序 deterministic failed-with-reason adapter 已在 browser 中验证，避免 outputPath contract 失败伪成功或空失败。
验证：`python -m unittest packages/reasoning/conversation-policy/tests/test_goal_snapshot.py`；browser recheck；`git diff --check`。
剩余风险：AgentServer 仍会生成静态/不可复用 task code；需要从 generation prompt/policy 或 generated-task repair 继续约束必须读取 argv `inputPath` 并写 argv `outputPath`，或在 report-only answer 路径直接返回 ToolPayload。

### P2 Data Analysis / Reproducibility

状态：partial / strict-eval-failed-fixed-generation-boundary
建议任务：用户上传或描述 messy CSV/TSV 分析任务，要求 QC、统计模型、图表、复跑命令、sensitivity/robustness 和 selected chart follow-up。
重点挑战：generated code syntax/repair、result consistency、artifact grounding。

#### EVAL-20260518-P2-001 messy TSV reproducible assay analysis

状态：partial / fail before fix
用户目标：从默认聊天入口提交 messy TSV，要求 SciForge 生成可复现实验分析包。
Hard requirements：
- QC、清洗策略、统计模型、至少两个图表 artifact、关键结论、sensitivity/robustness、复跑命令、限制说明。
Browser entry：
- URL: `http://127.0.0.1:5273`
- run/session/artifact refs: `project-literature-evidence-review-mpa0si55-syqpd7` / `session-literature-evidence-review-mpa0nfdt-2mdz3l` / `.sciforge/sessions/2026-05-17_literature-evidence-review_session-literature-evidence-review-mpa0nfdt-2mdz3l/task-results/generated-literature-45e15950175a.json`
用户可见结论：
- 主回复是否直接解决问题：否；结果区显示 `运行需要恢复`，没有 QC、模型结论、复跑命令或可用分析 artifact。
- artifact 是否可打开、可理解、可复用：只有 runtime-failure diagnostic；不可复现实验。
- 缺失或误导：默认入口把数据分析请求路由到 `literature-evidence-review@1.0.0`；generated task 声明的 entrypoint path 与 materialized task file 不一致，执行时 `can't open file`。
TaskSuccess：false
AnswerQuality：fail；诚实标为 recoverable，但未满足用户 hard requirements。
Root boundary：AgentServer generated-task generation lifecycle / entrypoint contract / syntax preflight；同类旧证据 `generated-literature-2182f65faaaa` 还暴露 Python syntax preflight `df´l` 失败。
修复动作：generation lifecycle 现在在执行前校验 entrypoint 必须可 materialize，并对 Python entrypoint 做语法预检；失败时触发 bounded strict generation retry，而不是直接执行或终态失败。
验证：`node --import tsx --test src/runtime/gateway/generated-task-runner-generation-lifecycle.test.ts src/runtime/gateway/generated-task-runner-execution-lifecycle.test.ts`；`node --import tsx --test src/ui/src/app/ResultsRenderer.test.ts`；`npm run typecheck`。
剩余风险：本轮未重新跑修复后 browser 端端到端成功路径；默认数据分析任务仍被 literature scenario label 承载，需要后续 routing/capability eval。

### P3 Paper Reproduction / Code Debug

状态：partial / strict-eval-failed-targeted-fix-landed
建议任务：真实代码调试/论文复现任务，要求先跑测试、定位 root cause、改代码、复跑测试、报告 remaining risks。
重点挑战：`DISC-20260517-P3-005` generated task syntax preflight 后是否能 bounded repair/regenerate，而不是把内部生成错误当终态主回复。

#### EVAL-20260518-P3-001 MMD kernel code-debug syntax-preflight repair

状态：partial / fail on real browser task
用户目标：从默认聊天入口调试 `paper_metric_kernel.py` / `test_kernel_mmd.py`，要求先跑 pytest、定位 root cause、改代码、复跑 pytest，并报告 patch summary / test result / remaining risks。
Hard requirements：
- `python -m pytest test_kernel_mmd.py -q` 修复前后各跑一次；定位 root cause；修改代码；主回复给用户可读 patch summary、测试结果、剩余风险。
Browser entry：
- URL: `http://127.0.0.1:5373`
- before-fix run/evidence: `project-literature-evidence-review-mpa0q8t4-mawfnw` / `workspace/parallel/p3/.sciforge/evidence/p3-syntax-preflight-before-fix.png`
- after-fix run/evidence: `project-literature-evidence-review-mpa0yd7f-2a5ue2` / `workspace/parallel/p3/.sciforge/evidence/p3-after-fix-recoverable-generation-blocker.png`
用户可见结论：
- 主回复是否直接解决问题：否；before-fix 前台只显示 `Generated Python entrypoint failed syntax preflight before execution`，没有 root cause、patch summary、pytest rerun 或 remaining risks。
- after-fix：本次真实 browser 没再命中 syntax preflight，失败提前发生在 AgentServer malformed generation response；结果区诚实显示 recoverable，但仍未完成代码调试任务。
TaskSuccess：false
AnswerQuality：partial；P3-005 targeted blocker 已有通用修复和测试，但用户级代码调试交付仍失败。
Root boundary：generated-task execution syntax preflight / bounded repair rerun；新残留 blocker 为 AgentServer generation malformed payload / scenario routing。
修复动作：syntax preflight blocked 后现在写入诊断 refs，记录一次 repair-needed attempt，并复用现有 AgentServer bounded repair/rerun 生命周期；repair 成功时返回 repaired payload，而不是把 preflight 文本作为终态主结果。
验证：`node --import tsx --test src/runtime/gateway/generated-task-runner-execution-lifecycle.test.ts src/runtime/gateway/generated-task-runner-generation-lifecycle.test.ts`；`node --import tsx --test src/runtime/gateway/agentserver-generation-dispatch.test.ts`；`node --import tsx --test src/ui/src/app/ResultsRenderer.test.ts`；`npm run typecheck`；`git diff --check`。
剩余风险：真实 P3 code-debug 任务仍可能被 malformed generation response 卡住；本轮没有获得完整 patch/test/risk 用户交付。

### P4 SciForge Self-Improvement Coding

状态：ready-for-next-milestone
建议任务：让 SciForge 阅读本仓库某个 UI/runtime/gateway 边界并实施小补丁，要求 patch refs、测试命令、风险说明。
重点挑战：coding delivery summary、workspace side-effect salvage、debug folding、PR-style answer-first summary。

### P5 Methodology / Experimental Design

状态：ready-for-next-milestone
建议任务：带资源/伦理/样本限制的 protocol review 或实验设计迭代。
重点挑战：`DISC-20260517-P5-004` primary task syntax failure 后 supplemental artifacts 是否能形成 coherent repair-needed 或 promoted repaired attempt。

### P6 Long-Context / Deliverable Iteration

状态：partial / strict-eval-fail / targeted-fixes-landed
建议任务：多轮 research package / mini grant / reproducibility audit，要求跨轮约束变更、selected artifact 追问、reload 后继续。
重点挑战：ledger/context projection、旧约束污染、direct read-only vs durable writeback 边界。
最新 P6 证据：
- browser session：`session-literature-evidence-review-mpa25q1t-u5181a`，runs `project-literature-evidence-review-mpa26uwz-qzfrk8`、`project-literature-evidence-review-mpa2amo7-ley2ny`、`project-literature-evidence-review-mpa2df82-n4v4rm`。
- round 1：生成 `p6-mini-grant/{project-brief.md,methods-plan.md,risk-register.md,timeline-budget.md}`，refs 可点击，reload 后当前 run 和 conversation projection 可恢复；但状态为 partial / verification unverified，且 timeline team FTE 初稿违反固定团队约束。
- round 2：要求把 `$120,000`/`12 months` 替换为 `$80,000`/`9 months`；AgentServer 触发 convergence guard 后进入 current-reference digest recovery，主回复退化为 `Current Reference Digest Recovery Report`，没有说明保留/替换约束；workspace 后续部分更新 project brief/timeline，但 `risk-register.md` 仍残留 `0.5 FTE`。
- round 3：selected artifact `p6-mini-grant/timeline-budget.md` 追问被标为 satisfied，但实际仍是 digest recovery；timeline 保留 `$80,000`/`9 months`/新 FTE，但没有按要求重写为 personnel/compute/data-validation/contingency 四类。
- 修复动作：限制 vision-sense CJK intent 误路由；AgentServer taskFiles prompt 禁止 raw quoted prose 破坏 JSON；generated task helper 允许缺省 optional array envelope；current-reference digest recovery 结果现在强制 partial/needs-work，避免失败恢复伪装成已满足编辑交付。
- 验证：`node --import tsx tests/smoke/smoke-vision-sense-intent-routing.ts`；`node --import tsx packages/skills/runtime-policy.test.ts`；`node --import tsx --test src/runtime/gateway/generated-task-runner-execution-lifecycle.test.ts`；`node --import tsx --test src/runtime/gateway/result-presentation-contract.test.ts packages/contracts/runtime/artifact-policy.test.ts`；`node --import tsx --test src/ui/src/app/projectionApi.test.ts src/ui/src/app/ResultsRenderer.test.ts`；`npm run smoke:complex-multiturn-chat`；`npm run typecheck`；`git diff --check`。
- 失败验证：`npm run smoke:web-multiturn-final` fails at SA-WEB-05 provider-ready transition because ready provider health is still surfaced as visible Runtime preflight stage.
- 剩余风险：long-context continuation still overfeeds AgentServer and trips convergence guard; digest recovery can preserve refs but does not perform requested rewrites or answer with change summary.

## Discovered Queue

只保留未关闭或可能在下一轮再次成为 blocker 的任务。已完成 discovered tasks 和完整 evidence 已归档到 [`docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md`](docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md)。

### DISC-20260517-P3-005 Generated task syntax preflight needs bounded repair before terminal code-debug failure

状态：partial / targeted-fix-landed / browser-recheck-blocked-by-generation
发现者：P3
轻量证据：P3 dependency-aware MMD debug final recheck run `project-literature-evidence-review-mp9pzl5a-e56fsc`；handoff 已修正为 fresh（`expectedArtifactTypes=[]`、`selectedComponentIds=[]`、`priorAttemptCount=0`、`repairContinuation=false`），但主回复停在 `Generated Python entrypoint failed syntax preflight before execution`，没有交付 root cause、patch summary、pytest rerun、test result 或 remaining risks。
升级证据：P3 复现 before-fix run `project-literature-evidence-review-mpa0q8t4-mawfnw` 仍只显示 syntax preflight terminal failure；修复后 targeted test 覆盖 bounded repair before terminal payload；browser recheck `project-literature-evidence-review-mpa0yd7f-2a5ue2` 未命中 syntax preflight，改为 malformed generation response recoverable failure。
通用性说明：任何 code-debug / reproduction task 都可能生成语法错误 entrypoint；syntax preflight fail-fast 是正确边界，但应触发 bounded repair/regeneration 或 coherent repair-needed/completion-candidate。
疑似边界：AgentServer / generated-task execution / repair loop / Projection / ArtifactDelivery

Todo：
- [x] 最小复现
- [x] 定位 root boundary
- [x] 通用修复
- [x] targeted tests / 必要 browser 复验证据
- [x] 更新 Activity Log

### DISC-20260517-P5-004 Generated-task syntax failure can remain as failed projection despite supplemental artifacts

状态：todo
发现者：P5
轻量证据：P5 microbiome session `workspace/parallel/p5/.sciforge/sessions/2026-05-16_literature-evidence-review_session-workspace-biomedical-knowledge-graph-_kras-g12d_-_-mp8tjp68-mp8y1pdp-7ymg7a`；primary task `generated-literature-99177170665d` failed with Python syntax error；supplemental task `generated-literature-1b4e7268e935` wrote useful `research-report.md` / `evidence-matrix.md` / `notebook-timeline.md`，但 user-visible Projection stayed foregrounded on primary syntax failure。
通用性说明：任何 generated task can fail before writing intended ToolPayload while supplement/recovery creates useful artifacts; Projection should promote repaired attempt or expose one coherent repair-needed state, not mix failed primary and useful artifacts ambiguously.
疑似边界：generated-task execution / supplement lifecycle / Projection / ArtifactDelivery

Todo：
- [x] 最小复现
- [ ] 定位 root boundary
- [ ] 通用修复
- [ ] targeted tests / 必要 browser 复验证据
- [ ] 更新 Activity Log

### DISC-20260518-P1-001 Fresh literature generated task can pass intent but fail outputPath contract

状态：partial / targeted-fix-landed / browser-recheck-shows-structured-failure
发现者：P1
轻量证据：P1 after-fix browser run `project-literature-evidence-review-mpa1vfgy-6frcnz` / session `session-literature-evidence-review-mpa1t341-69iryd`；前台显示 `HarnessDecisionRecorded profile=balanced-default; intent=fresh`，但终态为 `AgentServer generated task literature_review_task.py does not write the SciForge outputPath argument`，没有论文列表、PDF/full-text evidence、中文报告 artifact 或 selected report follow-up。
升级证据：before-fix run `project-literature-evidence-review-mpa1pkme-scu50q` 被 future follow-up 文案误判为 continuation 并触发 convergence guard；fresh-intent 修复后同一真实任务越过该边界，暴露 generated-task outputPath contract blocker。English recheck before policy extension `project-literature-evidence-review-mpa2pb53-h5wnm5` 仍把 `selected report follow up` 判成 continuation；修复后 `project-literature-evidence-review-mpa2w8is-ng5lg9` / `session-literature-evidence-review-mpa2sak7-qf6guo` 显示 `intent=fresh`，并将 repeated outputPath contract failure 转成 `generated-task-contract-failure` structured result，而非假成功。
通用性说明：任何 fresh literature / report / analysis generated task 都可能生成只写旁路文件、不写 argv `outputPath` 的 entrypoint；contract gate 正确 fail-closed，但应通过 stricter authoring、bounded retry 或 deterministic recovery adapter 生成有效 ToolPayload，而不是只交付 runtime diagnostic。
疑似边界：AgentServer generated-task authoring / generated-task preflight / strict retry / ArtifactDelivery

Todo：
- [x] 最小复现
- [x] 定位 root boundary
- [x] 通用修复
- [x] targeted tests / 必要 browser 复验证据
- [x] 更新 Activity Log

### DISC-20260518-P6-001 Current-reference digest recovery can mask failed artifact rewrite

状态：partial / targeted-fix-landed / needs-browser-recheck
发现者：P6
轻量证据：P6 mini grant session `session-literature-evidence-review-mpa25q1t-u5181a`；round 2 run `project-literature-evidence-review-mpa2amo7-ley2ny` and round 3 run `project-literature-evidence-review-mpa2df82-n4v4rm`；AgentServer convergence guard forced `sciforge.current-reference-digest-recovery` and the visible answer became `Current Reference Digest Recovery Report` instead of requested constraint replacement/change summary. Round 3 was marked satisfied even though requested budget categories were not rewritten.
升级证据：workspace `workspace/parallel/p6/p6-mini-grant/timeline-budget.md` partially updated to `$80,000` / `9 months`, but still used old category shape; `risk-register.md` still had `0.5 FTE`; task result refs `task-results/agentserver-digest-recovery-literature-2d143defe9d9.json` and `...-ee0e8723de2b.json` record convergence guard recovery.
通用性说明：任何 selected artifact edit/rewrite/constraint-change turn can hit bounded digest recovery after context growth; digest recovery is useful as evidence salvage but must not be projected as task success for durable writeback requests.
疑似边界：AgentServer context projection / current-reference digest recovery / task outcome projection / durable writeback

Todo：
- [x] 最小复现
- [x] 定位 root boundary
- [x] 通用修复
- [x] targeted tests
- [ ] browser recheck after restart
- [x] 更新 Activity Log

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

## Evidence Policy

- `PROJECT.md` 只保留当前同步面板，不粘贴大段 DOM/log/code。
- 证据文件只在失败、修复前后对比、UI/workspace 不一致、milestone 验收时保存。
- 每条 Activity Log 最多一行，写清 owner、结论、关键 refs、验证命令和剩余 blocker。
- 修改 `PROJECT.md` 前先读最新文件、`git status`、相关 diff，避免覆盖并行进程刚写入的 owner/status。

证据建议位置：

```text
workspace/evidence/<date>/<process>-<topic>/
.sciforge/parallel/<process>/logs/
docs/archive/
```

## Activity Log

- 2026-05-18 02:02 P1：继续最新论文/全文调研 user-proxy；browser 输入通道缺虚拟剪贴板，改用可见 textbox 的逐字符 keypress 提交真实默认入口任务。English `selected report follow up` before-fix run `project-literature-evidence-review-mpa2pb53-h5wnm5` 仍误判 `intent=continuation` 并触发 215004-token convergence guard；修复 `goal_snapshot.py` 后 recheck `project-literature-evidence-review-mpa2w8is-ng5lg9` / `session-literature-evidence-review-mpa2sak7-qf6guo` 显示 `intent=fresh`，但 AgentServer strict retry 仍生成不写 `outputPath` 的 task；deterministic failed-with-reason adapter 在 browser 中可见，debug/audit 默认折叠。验证：goal_snapshot unittest、browser recheck、diff-check；剩余 blocker：AgentServer generated-task authoring 仍需产出可复用 task 或 direct ToolPayload，P1 hard requirements 未满足。

- 2026-05-18 01:54 P6：mini grant/research package 三轮 browser strict-eval fail/partial；修复 vision-sense CJK 误路由、AgentServer taskFiles raw quote policy、generated-task optional envelope、current-reference digest recovery 伪 satisfied；refs `session-literature-evidence-review-mpa25q1t-u5181a` / `project-literature-evidence-review-mpa26uwz-qzfrk8` / `project-literature-evidence-review-mpa2amo7-ley2ny` / `project-literature-evidence-review-mpa2df82-n4v4rm`；验证：vision-sense smoke、runtime-policy、generated-task lifecycle、result-presentation/artifact-policy、ProjectionApi/ResultsRenderer、complex-multiturn smoke、typecheck、diff-check pass；`smoke:web-multiturn-final` still fails SA-WEB-05 provider health preflight.

- 2026-05-18 01:45 Integration Worker：`git fetch --all --prune` 后确认远端 `codex/*` 与本地 worker 分支均无新提交可合并；集成本地 generated-task helper / result presentation 小修复：`write_payload` 现在补齐缺省数组 envelope 字段但仍校验数组类型，runtime policy 提醒避免 raw double quotes 破坏 AgentServerGenerationResponse JSON，strict retry 仍违反 task interface 时改走 deterministic failed-with-reason adapter，current-reference digest recovery 被标为 partial 不再满足 artifact rewrite 请求；验证：generated-task generation/execution lifecycle、runtime-policy、result-presentation-contract、`npm run typecheck`、`git diff --check` 通过；剩余风险：P1 outputPath contract / P2-P3 browser success 仍需真实端到端复验。
- 2026-05-18 01:30 Integration Worker：`git fetch --all --prune` 后确认远端 `codex/*` 均已是 `origin/main` 祖先；审查并集成当前 `codex/p6-long-context` 本地 P2/P3/P6 修复包，补修 message-only blocker JSON 保持 failed displayIntent 与 ChatPanel typecheck 窄化；验证：generated-task lifecycle、direct-answer/artifact/dispatch、ResultsRenderer、ChatPanel、vision-sense smoke、Python goal snapshot、`npm run typecheck`、`git diff --check` 全通过；剩余风险：P2/P3 真实 browser 仍未获得完整用户任务成功，下一轮继续修 scenario routing / malformed generation response。
- 2026-05-18 00:58 Integration Worker：`git fetch --all --prune` 后审查 `origin/codex/m13-complex-multiturn`、`origin/codex/result-presentation-r015`、`origin/codex/sciforge-paper-reproduction-loop`、`origin/codex/t122-boundary-smoke`；四个分支均已是 `origin/main` 祖先，无新增合并；验证：`git diff --check`、`npm run typecheck` 通过；剩余风险：下一轮需等待新 worker branch 或 P1-P6 browser evidence。
- 2026-05-18 01:00 Integration Worker：最终状态检查时检测到并行写入 `packages/skills/runtime-policy*`、`src/runtime/gateway/agentserver-generation-dispatch.ts`、`src/runtime/gateway/artifact-materializer*`、`src/runtime/gateway/generated-task-runner-*`；本轮未合并/未改这些文件；`git diff --check` 仍通过，但上述并行代码改动未纳入先前 `npm run typecheck` 结论。
- 2026-05-18 Orchestrator：重排 `PROJECT.md` 为多 Codex 自动化协议，加入 worker/heartbeat/sub-agent/strict-eval/evidence 规范；未改产品代码；验证：`git diff --check`。
- 2026-05-18 P2：messy TSV 数据分析 strict-eval partial/fail；修复 generated-task entrypoint materialization mismatch 与 Python syntax preflight retry；refs: `project-literature-evidence-review-mpa0si55-syqpd7`、`generated-literature-45e15950175a`、旧 syntax 证据 `generated-literature-2182f65faaaa`；验证：generated-task lifecycle tests、ResultsRenderer tests、typecheck。
- 2026-05-18 P3：MMD code-debug strict-eval partial/fail；修复 `DISC-20260517-P3-005` syntax preflight terminal failure by routing blocked generated Python through bounded repair/rerun before terminal payload；before evidence `project-literature-evidence-review-mpa0q8t4-mawfnw`，after recheck `project-literature-evidence-review-mpa0yd7f-2a5ue2` blocked earlier by malformed generation response；验证：generated-task lifecycle tests、dispatch test、ResultsRenderer test、typecheck、diff-check。
- 2026-05-18 01:30 P1：single-cell diffusion 全文文献调研 strict-eval partial/fail；修复 future report follow-up 文案误判 continuation，browser recheck 从 `intent=continuation`/219973-token convergence guard 变为 `intent=fresh`，但仍 blocked by generated task `outputPath` contract；refs: `project-literature-evidence-review-mpa1pkme-scu50q`、`project-literature-evidence-review-mpa1vfgy-6frcnz`；验证：goal_snapshot unittest、execution_classifier function tests、capability-discovery、ResultsRenderer/projectionApi、typecheck、diff-check。

## Verification Commands

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

## Historical Archive

- 2026-05-14/15 旧 CAP/PKG/GT/PSM/MEM/H022 与早期稳定性任务：[`docs/archive/PROJECT-history-2026-05-14-15.md`](docs/archive/PROJECT-history-2026-05-14-15.md)
- 2026-05-16 Browser Multiturn Stability Sprint、PBT/P1/P2/P3/P4/ARC/MTG 长任务板与 issue 细节：[`docs/archive/PROJECT-history-2026-05-16-browser-sprint.md`](docs/archive/PROJECT-history-2026-05-16-browser-sprint.md)
- 2026-05-17 UX simplification / capability discovery / P1-P6 strict-eval 长任务板、完整 Activity Log、run/session/evidence refs：[`docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md`](docs/archive/PROJECT-history-2026-05-17-ux-gauntlet.md)

归档文件只作为 evidence/source lineage。当前 owner、状态、handoff、未关闭 blocker 和下一步行动以本文件为准。
