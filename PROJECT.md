# BioAgent - PROJECT.md

最后更新：2026-05-02

## 关键原则

- AgentServer 是项目无关的通用大脑和 fallback backend；BioAgent 不维护写死工具清单，优先通过 skill registry、workspace-local task code 和 AgentServer 动态探索/写代码解决请求。
- 正常用户请求必须交给 AgentServer/agent backend 真实理解和回答；BioAgent 不设置、不维护、不返回预设回复模板，只允许输出协议校验、执行恢复、安全边界和错误诊断类系统信息。
- Self-evolving skills 是核心原则：任务代码先在当前 workspace 中生成、修复和验证；稳定成功后，经用户确认再沉淀到 skill library 或 seed skill 候选。
- 开发者不应为一次任务缺口手工写死专用科研脚本；只能补通用协议、权限、安全边界、runner 能力、context contract、promotion 机制和 UI/artifact contract。
- TypeScript 主要负责 Web UI、workspace writer、artifact/session 协议、组件 registry 和轻量编排；科学任务执行代码优先作为 workspace-local Python/R/notebook/CLI artifact 生成。
- 真实任务应输出标准 artifact JSON、日志和 ExecutionUnit；不得用 demo/空结果伪装成功。
- 错误必须进入下一轮上下文：failureReason、日志/代码引用、缺失输入、recoverActions、nextStep 和 attempt history 都要保留。
- 多轮对话要以 workspace refs 为长期事实来源，以最近消息为短期意图来源；“继续、修复、基于上一轮、文件在哪里”必须能接上当前 session。
- 代码路径保持唯一真相源：发现冗余链路时删除、合并或降级旧链路，避免长期并行实现。

## 任务板



### T056 Turn Acceptance Gate、自动修复与最终回复对象引用

状态：已完成首版（已接入通用 `UserGoalSnapshot`、确定性 `TurnAcceptanceGate`、可选 backend 语义验收、展示层自动修复、最终回复 objectReferences 抽取、右侧文件预览和 contract/test 覆盖；深度 backend rerun repair 作为后续增强）。

#### 背景
- 当前多轮机制已经能携带 recent messages、artifacts、runs、ExecutionUnit、失败原因和用户点选 references，但“完成”更多依赖协议状态，而不是用户本轮真实目标是否被满足。
- 用户要 Markdown 报告却看到 JSON、用户要继续上一轮却无意重跑、用户点选对象但回答未使用该引用，这些都属于“协议成功但用户目标失败”。
- Agent 最终回复经常包含生成产物路径，例如 `.bioagent/tasks/.../report.md`、`.csv`、`.pdf`、文件夹或 task result JSON；这些路径应该自动变成可点击 object/reference chip，点击后在右侧结果视图打开具体内容，而不是只作为纯文本。

#### 目标
- 每一轮对话都生成 `UserGoalSnapshot`：记录用户要的结果类型、格式、引用对象、时效要求、必须产出的 artifact/UI、可接受的 fallback 和明确的完成条件。
- 每一轮 backend 返回后先经过 `TurnAcceptanceGate`：判断最终回复、artifacts、ExecutionUnit、object refs 和右侧 UI 是否满足 `UserGoalSnapshot`。
- 若验收失败，系统自动生成 repair request，带上失败项、原始目标、当前 refs/logs/artifacts，并在预算内自动修复；修复失败时返回 `failed-with-reason`，不把半成品包装成成功。
- 最终回复中的路径、artifact id、run id、execution unit id、URL 和 workspace refs 自动归一化为 `ObjectReference` / `BioAgentReference`，用户点击即可聚焦右侧结果、打开文件预览或进入 Artifact Inspector。

#### 通用 Contract 草案
```ts
type UserGoalSnapshot = {
  turnId: string;
  rawPrompt: string;
  goalType: 'answer' | 'report' | 'analysis' | 'visualization' | 'file' | 'repair' | 'continuation' | 'workflow';
  requiredFormats: string[];
  requiredArtifacts: string[];
  requiredReferences: string[];
  freshness?: { kind: 'today' | 'latest' | 'current-session' | 'prior-run'; date?: string };
  uiExpectations: string[];
  acceptanceCriteria: string[];
};

type TurnAcceptance = {
  pass: boolean;
  severity: 'pass' | 'warning' | 'repairable' | 'failed';
  checkedAt: string;
  failures: Array<{ code: string; detail: string; repairAction?: string }>;
  objectReferences: ObjectReference[];
  repairPrompt?: string;
  semantic?: SemanticTurnAcceptance;
};

type SemanticTurnAcceptance = {
  pass: boolean;
  confidence: number;
  unmetCriteria: string[];
  missingArtifacts: string[];
  referencedEvidence: string[];
  repairPrompt?: string;
  backendRunRef?: string;
};
```

#### 验收规则
- 报告类请求：必须有可读 `research-report` / Markdown 正文 / `.md` ref；默认报告视图不能展示 ToolPayload JSON、raw artifacts 或诊断过程。
- 文件类请求：必须有可解析 workspace file/folder ref，文件存在且类型可预览或可安全打开。
- 可视化类请求：必须有匹配 UI module 或明确 `blocked-awaiting-ui-design`，不能用空卡片伪装成功。
- 继续/修复类请求：必须引用上一轮 run/artifact/execution refs，不能无依据开始无关新任务。
- 点选引用请求：最终请求上下文、Agent 回复和结果对象必须保留被点选 references。
- 路径引用：最终回复中的 `.bioagent/...`、workspace path、artifact id、run id、execution-unit id、URL 自动变成 object chips；点击默认右侧聚焦，文件内容优先用内置 viewer/inspector 展示。
- 高风险或不可读对象：显示明确 blocker、原因和 recoverActions，不自动执行脚本或打开危险文件。

#### 自动修复策略
- `presentation-repair`：结果存在但展示错误，例如报告正文被 JSON 包住、UI module 绑定错、路径未引用化；优先前端/normalizer 修复。
- `artifact-repair`：回答有结论但缺少要求格式或文件，例如没有 `.md`、表格、图；向 AgentServer 请求补 artifact。
- `execution-repair`：任务本身未完成，例如下载失败、全文未读、代码报错；走已有 repair/rerun，并保留 failureReason、stdout/stderr、codeRef。
- 每轮自动 repair 默认最多 1-2 次；超过预算后把验收失败项作为用户可见诊断和下一步建议。

#### TODO
- [x] 定义 `UserGoalSnapshot` / `TurnAcceptance` TypeScript 类型和 runtime schema，写入 run raw 与 session history。
- [x] 在发送请求前从 prompt、点选 references、scenario/output contract、recent conversation 生成 `UserGoalSnapshot`。
- [x] 实现确定性 `TurnAcceptanceGate`：检查 artifacts、files、Markdown、references 和 raw JSON/ToolPayload 泄漏。
- [x] 接入最终回复路径抽取：把 `.bioagent/...`、workspace 文件、artifact/run/execution refs 和 URL 自动转为 `objectReferences`。
- [x] 点击最终回复里的文件/path object chip 时，右侧结果视图读取并展示文件内容；Markdown/CSV/TSV/HTML/JSON 走内置 viewer，PDF/图片等走安全提示和系统打开 fallback。
- [x] 若 acceptance 失败但可修复，自动执行 presentation repair，并在 `repairPrompt` 中记录 artifact/execution repair 所需失败项和期望产物。
- [x] 为自动修复增加预算和防循环机制：记录 `repairAttempt`、failure codes 和 repair action，不在同一轮无限重试。
- [x] 后续增强：接入语义验收，由 backend 判断最终回答是否满足用户目标，但 BioAgent 保留确定性 gate 的否决权。
- [x] 后续增强：artifact/execution repair 可在用户允许或后台预算满足时自动触发第二次 AgentServer rerun，而不仅记录 `repairPrompt`。
- [x] 增加单测：用户要求 Markdown 报告，backend 返回 JSON 包裹路径，系统自动生成可点击文件引用并避免 raw JSON 默认呈现。
- [x] 增加单测：用户最终回复包含 `.csv` / `.md` 路径，路径自动变 chip，优先展示报告路径。
- [x] 后续增强：补 browser E2E 覆盖点选历史消息/图表/表格/文件后追问、最终回复 object chip 右侧聚焦和真实 workspace Markdown 文件预览。



### T057 统一 Backend Context Window 契约、原生压缩与失败自治恢复

状态：推进中（backend-neutral context/compact contract 已接入；BackendContextWindowState usage/context 归一化、Gemini SDK fallback、Hermes compat 映射与 429/retry-budget 受控恢复首版已完成）。

#### 背景
- 失败解释类问题继续交给 agent backend 是正确方向：用户需要 backend 自主定位、修复和继续，而不是 BioAgent 在前端写死恢复话术。
- 不同 backend 的 context 能力并不一致：Codex 已有 `thread/compact/start`、auto compact、token telemetry 和错误分类；Gemini adapter 有 long-context 与 usage stream，但未暴露统一 compact API；Claude Code 当前走 supervisor bridge，native state/compact 能力还没有进 contract；self-hosted/openteam 可把 AgentServer 自身 current-work/session compaction 作为白盒能力；Hermes backend 已有 context compressor/context length 检测，可后续接入；OpenClaw 目前按 compatibility backend 处理。
- 上层不能让用户感受到 backend 差异：BioAgent 只展示统一的 context window 使用情况、统一的“正在压缩/已压缩/需要稍后重试”状态；具体是 native compact、AgentServer compact、handoff slimming 还是 session rotation，由 AgentServer 决策。
- 最近失败更像 provider 429 / retry budget 问题，而不是单纯 context window exceeded；但超大累计 tokens 会放大 429 和重试消耗，因此需要同时控制上下文、工具输出和重试预算。
- 修改 AgentServer 前必须先按 `/Applications/workspace/ailab/research/app/AgentServer/docs/architecture.md` 校准边界：AgentServer Core 负责统一上下文、run/stage、audit 和 orchestration；各 backend harness 保持自治。
- 右侧结果中的 ExecutionUnit 和研究记录有长期价值，但默认露出过多会分散用户注意力；它们应从“主结果内容”降级为“可复现/审计/研究日志”详情。

#### 统一 Contract 草案
```ts
type BackendContextWindowState = {
  backend: string;
  sessionRef: string;
  provider?: string;
  model?: string;
  usedTokens?: number;
  input?: number;
  output?: number;
  cache?: number;
  window?: number;
  ratio?: number;
  source: 'native' | 'provider-usage' | 'agentserver-estimate' | 'unknown';
  status: 'healthy' | 'watch' | 'near-limit' | 'exceeded' | 'compacting' | 'blocked' | 'unknown';
  compactCapability: 'native' | 'agentserver' | 'handoff-only' | 'session-rotate' | 'none';
  lastCompactedAt?: string;
  lastCompactionReason?: string;
};

type BackendContextCompactionResult = {
  status: 'compacted' | 'skipped' | 'failed' | 'unsupported';
  backend: string;
  capabilityUsed: BackendContextWindowState['compactCapability'];
  before?: BackendContextWindowState;
  after?: BackendContextWindowState;
  reason: string;
  userVisibleSummary: string;
  auditRefs: string[];
};
```

#### Backend 能力映射
- `codex`：优先使用 Codex app-server 原生 `thread/compact/start`；监听 `contextCompaction` item、`turn/completed`、`thread/tokenUsage/updated` 和 error；为 custom provider 配置 `model_context_window`、`model_auto_compact_token_limit`、`compact_prompt`。
- `gemini`：已确认当前 Gemini CLI SDK/API adapter 可读取 usage stream 和保留 native session/resume，但未暴露 context-window limit、native compact/clear/summarize 或 in-place session reset；标记为 `provider-usage` telemetry + `agentserver/session-rotate` fallback。若 SDK 后续暴露 native compact/clear/summarize API 再接入。
- `claude-code`：已确认 vendored Claude Code 暴露原生 `/compact`、`compact_boundary`、`status=compacting` 与 usage 相关消息；通过 supervisor bridge 优先调用原生 `/compact`，并把 compact/usage 信号归一化。
- `self-hosted-agent` / `openteam_agent`：作为白盒参考实现，直接实现统一 contract；AgentServer session-store/current-work compaction 即本 backend 的 native managed compaction。
- `hermes-agent`：优先复用 Hermes context compressor、context length detection、rate-limit diagnostics；通过 supervisor compat adapter 将压缩事件、window ratio 和 retry-after 归一化成统一事件。
- `openclaw`：若无可探测 native compact，就标记为 `handoff-only` / `session-rotate`，仍保持同样的 UI 和 preflight 策略。

#### TODO
- [x] 扩展 `AgentBackendCapabilities`：增加 `contextWindowTelemetry`、`nativeCompaction`、`compactionDuringTurn`、`rateLimitTelemetry`、`sessionRotationSafe` 等能力位。
- [x] 扩展 `AgentBackendAdapter` contract：增加 `readContextWindowState(sessionRef)`、`compactContext(sessionRef, reason)` 可选方法；无原生能力的 backend 返回 fallback capability，而不是抛错。
- [x] 将所有 backend 的 usage event 归一化为 `BackendContextWindowState`：BioAgent adapter/normalizer 统一输出 `backend/provider/model/usedTokens/input/output/cache/window/ratio/source/status/compactCapability`；Codex/Hermes 可用 native/context telemetry 时标记 `native`，Gemini/Claude/self-hosted/OpenClaw 等 stream usage 标记 `provider-usage`，无法读原生 window 时明确降级为 `agentserver-estimate` / `handoff-only` / `session-rotate`。
- [x] 在 AgentServer run preflight 中统一判断 `watch` / `near-limit`：接近阈值时先调用 backend native compact；没有 native compact 时调用 AgentServer `/compact` 或 handoff slimming。
- [x] Codex adapter：封装 `compactThread(threadId)`，调用 `thread/compact/start`，监听 `contextCompaction` item、`turn/completed` 和 error，并把压缩事件写入 run observation。
- [x] Codex custom provider：配置 `model_context_window`、`model_auto_compact_token_limit` 和可选 `compact_prompt`，避免 unknown model fallback 让 auto compact 阈值失真。
- [x] Gemini adapter：探测 SDK 是否提供 context window / session compaction / session reset API；当前仅有 usage stream、`session()`、`resumeSession()`、`sendStream()`，没有 native compact/reset/window limit，已明确标记为 AgentServer compact + `session-rotate` fallback，并补 BioAgent/AgentServer contract smoke。
- [x] Claude Code bridge：检查 vendored Claude Code remote/session manager 能否提供 usage、limit、summary、compact 或 clear history；能用则接入，不能用则只暴露 fallback。
- [x] OpenTeam/openteam_agent compact 专项：明确其作为 self-hosted/AgentServer managed backend 的策略。
  - [x] `readContextWindowState` 使用 AgentServer `/agents/:id/context` 的 session/current-work 视图；即使只能估算，也标记 `compactCapability=agentserver`，不降级成 `handoff-only`。
  - [x] `compactContext` 调用 AgentServer `/agents/:id/compact`，并显式声明 `compactionScope=session-current-work` / `strategy=agentserver-session-current-work`。
  - [x] `/compact` 不可用时返回 `agentserver` compact failure refs，由上层 slim handoff 继续一次受控恢复，但不把 OpenTeam 伪装成 backend native compact。
  - [x] smoke 覆盖 near-limit preflight compact、`contextWindowExceeded` 后 compact+retry 一次、失败时返回 refs/recoverActions。
- [x] Hermes compat adapter：在 BioAgent adapter/normalizer 层映射 Hermes `context_compressor`、context length、compression threshold、rate-limit reset 信息到统一 `BackendContextWindowState` / `contextCompaction` / `rateLimit` 事件；不改 vendored Hermes。
- [x] OpenClaw compact fallback 专项：无 native compact 时明确标记 `handoff-only` / `session-rotate`，不伪装 native compact 成功；compact API unsupported/404 返回 skipped/unsupported + audit refs；补 smoke 覆盖 preflight 不失败、handoff slimming 生效、最终诊断清楚。
- [x] 对 `contextWindowExceeded` 做一次自动恢复：触发统一 compact，再重放同一轮用户请求一次；仍失败时返回 blocker 和 refs。
- [x] 对 `responseTooManyFailedAttempts` / 429 做受控恢复：退避、减少传入上下文、必要时 compact 后重试一次；不做无限重试，并明确暴露 provider/rate-limit 诊断。
- [x] 将 AgentServer 自身的 session compaction 从“run 后整理”为“run 前可预防”：在 includeCurrentWork、多轮失败修复、prior run 很大时先 preview/compact current work，再交给 backend；compact 结果写入 contextWindowState/contextCompaction、run metadata/context refs，失败时 slim handoff 继续并携带 recovery ref。
- [x] 增加 smoke/contract 覆盖：每个 backend 至少覆盖 `readContextWindowState`、preflight compact fallback、context error compact+retry、429 不无限重试。（已补六 backend 矩阵：`codex`、`openteam_agent`、`claude-code`、`hermes-agent`、`openclaw`、`gemini`；覆盖 context source/fallback、preflight compact、contextWindowExceeded compact+retry once、429/retry-budget bounded retry、最终 refs/recoverActions。）
- [ ] 若必须修改 Codex/Claude/Gemini/Hermes/OpenClaw 等官方或 vendored backend 源码，先证明无法通过 SDK/API/RPC/app-server、环境变量、配置、bridge 或 capability 降级解决；patch 必须小、集中、可重放，并记录到 `/Applications/workspace/ailab/research/app/AgentServer/docs/upstream-backend-overrides.md`。
- [x] BioAgent UI：ExecutionUnit 保留为“可复现/运行审计”详情，不作为普通用户默认主 tab；失败、开发者模式、用户点击“查看运行细节”时展开。
- [x] BioAgent UI：研究记录只保留 curated notebook 价值，包括里程碑、假设、关键证据、决策和 run refs；若只是复刻聊天内容，则默认隐藏或合并到运行详情。
- [x] 结果视图降噪：默认只展示用户最关心的成果、状态和少量恢复建议；raw JSON、完整 ExecutionUnit、完整 timeline、stdout/stderr 统一放入可展开详情。

#### 验收标准
- BioAgent 不需要知道具体 backend 的内部实现，也能显示一致的 context window 状态和压缩状态。
- 长程/复杂任务遇到上下文压力时，AgentServer 优先调用 backend 原生 compact；无原生能力时自动降级到 AgentServer external context compaction / handoff slimming。
- 失败解释类追问仍由 backend 处理，且携带必要 refs、日志摘要和当前目标；BioAgent 不把模板化恢复话术当成最终答案。
- 429 / retry budget 问题不会造成无限重试或百万级 token 失控；用户能看到清楚的 provider/rate-limit 诊断。
- 普通用户默认看到的是产物和结论；ExecutionUnit 与研究记录仍可用于复现和审计，但不会抢占主结果焦点。



### T058 BioAgent Context Window 圆形进度条与自动压缩体验

状态：已规划。

#### 背景
- 当前聊天里已有 token usage 文本，但缺少 context window 总量、占比、阈值和压缩状态；用户无法判断“是不是快满了”。
- 用户希望 BioAgent 侧有圆形进度条，并在 context window 快满时自动触发压缩。
- 这个 UI 必须 backend-neutral：不同 backend 的 native/fallback 压缩差异只显示成统一状态，例如“上下文健康 / 接近上限 / 正在压缩 / 已压缩 / 需要等待 provider”。

#### UX 原则
- 圆形进度条默认放在聊天输入区或 runtime 状态附近，轻量常驻；hover/click 展开详情。
- 进度来源分级展示：`native` 最可信，`provider-usage` 次之，`agentserver-estimate` 显示为估算，`unknown` 显示为未探测。
- 阈值建议：`watch` 70%，`autoCompact` 85%，`hardBlock` 92%；具体值允许 scenario/backend/workspace 配置。
- 自动压缩优先在“下一轮发送前”或 backend 空闲时触发；只有 backend 明确支持 mid-turn compaction 时才在运行中触发。
- 用户不需要选择 backend-specific 操作；只看到统一按钮/状态：“压缩上下文”“已自动压缩”“需要稍后重试”。

#### TODO
- [x] 扩展 BioAgent stream event/domain type：支持 `contextWindowState`、`contextCompaction`、`contextWindowRatio`、`contextWindowSource`。
- [x] 在 ChatPanel / Runtime Health 附近增加圆形 context meter：显示比例、状态色、模型/窗口大小、最近一次压缩时间。
- [x] meter hover 展示说明：used/window、usage source、backend、compact capability、auto threshold、最近 compact result。
- [x] 当 `ratio >= autoCompactThreshold` 且没有 active turn 时，发送下一轮前自动调用 AgentServer compact/preflight；运行中只显示 pending compact。
- [x] 当用户点击 meter 或“压缩上下文”时，调用统一 compact API；成功后刷新 state，并在聊天中轻量记录一条 system observation。
- [x] 如果 source 是估算或 unknown，UI 用不同样式提示“估算/未知”，但仍允许手动 compact。
- [x] 自动压缩必须可审计：每次 compact 写入 reason、before/after、backend capability、audit refs。
- [x] compact 失败时不要打断用户输入；显示可恢复状态，并让下一轮请求带上 compact failure ref 交给 backend 处理。
- [x] 增加前端测试：不同 ratio/status/source 的显示、自动 compact 阈值、防重复触发、backend unsupported fallback。
- [x] 增加 browser E2E：多轮对话让 usage 接近阈值，确认 meter 变色、preflight 自动 compact、用户侧体验一致。



### T059 Handoff 预算、工具输出瘦身与二进制/Raw 数据隔离

状态：已规划。

#### 背景
- 即使 backend 有 native compact，如果每轮 handoff 继续塞入完整 prior run、stdout/stderr、payload JSON、二进制预览或大 artifact，仍会快速撑爆 context，并放大 429/retry budget。
- BioAgent 已有部分 workspace-task input compact 和 artifact/ref 机制，但需要统一成所有 backend 共享的 handoff budget。

#### TODO
- [x] 定义 `BackendHandoffBudget`：每层最大 tokens/bytes，包括 user goal、refs、recent messages、artifacts、stdout/stderr、ExecutionUnit、UI state、prior attempts。
- [x] 所有 backend adapter 在渲染 handoff 前统一走 budget normalizer；超预算字段改为 refs + schema + head/tail + hash。
- [x] 对二进制文件、图片、PDF、large JSON 只传 metadata/ref/preview，不把原始内容塞进 model context。
- [x] stdout/stderr 默认只传错误摘要、最后 N 行、exit code、相关文件路径；完整日志进入 workspace ref。
- [x] prior attempts 默认只保留最近失败原因、修复动作、artifact refs 和 code refs；旧 attempt 走 session compaction summary。
- [x] 将 budget decisions 写入 run audit，便于解释“为什么 backend 没看到完整 raw 数据，但可通过 ref 找回”。
- [x] 增加 contract test：大型 artifact、二进制图片、超长 stdout、多个 prior attempts 都不会让 handoff 超预算。
- [x] 与 T058 联动：handoff slimming 后刷新 context meter，避免用户看到压缩完成但下一轮又瞬间爆表。



### T060 长程多轮复杂任务评测集：引用操作、上下文保持与问题解决能力

状态：已完成首版（已落地 `tests/longform/` 六个长程人工评测脚本、Codex/Computer Use 执行模板、longform 结构校验、pending manifest/checklist 生成器、weekly prepare、next-round runner helper、missing-evidence checklist、evidence command generator、operator runbook exporter、round observation recorder、top-level evidence recorder、finalization/scoring CLI、weekly plan selector、T060 evidence quality gate、longform status/weekly regression summary、右键选中文字引用浏览器 E2E、引用 payload contract、显式引用使用 acceptance 检查；真实 backend 每周回归按模板持续执行并沉淀 manifest）。

#### 背景
- BioAgent 需要用真实长程任务验证复杂科研问题解决能力，而不是只验证单轮协议、UI 展示或 mock smoke。
- 新增的引用交互包括：选中文字右键引用、点选整块 UI 引用、引用 chip 点击回到并高亮来源、引用 marker 进入聊天框、最终回复 object references 聚焦右侧结果。
- 长程任务必须覆盖多轮规划、检索、执行、失败修复、结果复用、上下文压缩、引用追问和最终报告交付。
- 测试目标不是让 BioAgent 给出预设答案，而是验证 backend 是否能正确使用被引用内容、历史产物、失败日志和 workspace refs 继续推进复杂问题。

#### 评测原则
- 每个任务至少 6 轮，推荐 8-12 轮；中间必须包含 2 次以上引用操作。
- 引用操作必须混合使用：右键引用具体文字、点选引用 UI 块、引用 run/result chip、引用右侧 artifact/file/object。
- 每个任务都要产生可复现 artifact：Markdown 报告、CSV/TSV 表格、图表、notebook、代码或日志 refs。
- 每个任务都要设计一次干扰或修复场景：信息不足、结果矛盾、执行失败、文件缺失、上下文过长或用户改变目标。
- 验收时重点看“是否使用了引用”，而不是仅检查 references 数组是否存在：最终回答、artifact 和后续行动必须能体现被引用内容。

#### Codex 执行要求
- 这些长程任务必须由 Codex 真实操作 BioAgent 前端完成，不能只用单元测试、mock request 或直接调用 API 代替。
- Codex 必须优先使用内置浏览器打开 `http://localhost:5173/`，完成真实页面交互：输入 prompt、等待 backend stream、切换结果 tab、点选 UI、右键引用文字、点击引用 chip、检查右侧 object references。
- Codex 必须配合使用 Computer Use 做桌面级验证：确认浏览器窗口焦点、鼠标右键菜单、文本选区、拖拽/滚动、截图标记和高亮效果在真实 UI 中可见。
- 每个长程任务至少保留 3 类证据：内置浏览器截图或 DOM 观察、Computer Use 截图/坐标操作记录、session/workspace artifact refs。
- 测试记录必须写明使用的 backend/model、任务开始/结束时间、每轮 prompt、引用 marker（例如 `※1`）、引用来源、产物 refs、失败与修复动作。
- 如果 backend 不可用、端口不可用或模型额度不足，Codex 仍需用内置浏览器和 Computer Use 完成前端引用交互冒烟，并在记录中明确 blocker、缺失能力和下一次可重跑步骤。

#### 任务 1：文献证据评估到可复现报告
- 目标：围绕一个生物医学 claim 生成文献证据矩阵、支持/反对证据、研究限制和可复现 Markdown 报告。
- 多轮脚本：
  - 第 1 轮：用户提出 claim，例如“评估 Playwright MCP 是否适合 BioAgent 浏览器自动化技能安装与安全验证”或一个真实 biomedical claim。
  - 第 2 轮：要求生成 paper list、证据矩阵和初版结论。
  - 第 3 轮：用户右键引用某条证据摘要中的一句关键限制，追问“这个限制会不会推翻结论？”
  - 第 4 轮：用户点选整块 Evidence matrix UI，要求重排证据等级并标出低可信证据。
  - 第 5 轮：用户引用一个失败/警告 ExecutionUnit，要求解释其对报告可信度的影响。
  - 第 6 轮：用户要求输出最终 Markdown 报告、CSV 证据表和 object references。
- 必查点：引用文字进入 backend context；点选矩阵后回答使用矩阵内容；最终报告包含引用来源、limitations、路径/object chips。

#### 任务 2：单细胞分析方案设计、执行与修复
- 目标：从用户给出的 scRNA-seq 分析目标出发，生成 QC、聚类、marker gene、差异表达和可视化方案，并在 workspace 中执行或生成可复现任务代码。
- 多轮脚本：
  - 第 1 轮：用户要求分析一个公开或 fixture 数据集，明确疾病/细胞类型问题。
  - 第 2 轮：BioAgent 生成执行计划和输入需求；用户引用 UIManifest 中的数据表/输入 slot，要求只使用该 slot。
  - 第 3 轮：执行失败或缺依赖时，用户引用失败日志文字，要求 backend 自主修复。
  - 第 4 轮：用户点选 UMAP/结果图 UI，追问“这两个 cluster 是否应该合并？”
  - 第 5 轮：用户右键引用 marker gene 表中的几行，要求解释细胞类型注释依据。
  - 第 6 轮：用户改变目标，要求基于已产出的 refs 追加差异表达和富集分析，不重跑无关步骤。
  - 第 7 轮：输出 notebook、figure refs、marker table 和结论报告。
- 必查点：失败日志引用驱动修复；图表/表格引用影响后续分析；继续任务复用已有 artifacts 而不是从头开始。

#### 任务 3：结构生物学突变影响分析
- 目标：围绕一个蛋白突变，检索结构、定位残基、分析可能影响、生成结构视图和证据摘要。
- 多轮脚本：
  - 第 1 轮：用户给出蛋白 ID 和突变，例如 UniProt/PDB + residue change。
  - 第 2 轮：BioAgent 检索结构、序列映射、功能区域和已知文献。
  - 第 3 轮：用户点选结构 viewer 或结构摘要 UI，要求说明被点选区域附近的相互作用。
  - 第 4 轮：用户右键引用一段“不确定映射/低分辨率/缺失 loop”提示，要求评估可信度。
  - 第 5 轮：用户引用某个 artifact/file ref，要求生成 PyMOL/3Dmol 可复现脚本。
  - 第 6 轮：要求最终输出结构图、方法说明、限制和可复现文件路径。
- 必查点：结构 UI 引用可定位；不确定性文字引用进入最终 limitations；脚本和图像以 objectReferences 暴露。

#### 任务 4：跨工具知识图谱与冲突证据消解
- 目标：整合 PubMed、UniProt、ChEMBL、DrugBank 或内部 artifact，构建一个 gene-drug-disease 关系图，并处理矛盾证据。
- 多轮脚本：
  - 第 1 轮：用户指定 gene/drug/disease 三元组，要求构建证据图。
  - 第 2 轮：BioAgent 输出关系图、证据列表和置信度。
  - 第 3 轮：用户右键引用一条反对证据，要求重算结论。
  - 第 4 轮：用户点选关系图中的某条边或边详情 UI，要求解释该边的证据来源。
  - 第 5 轮：用户引用右侧 artifact inspector 中的 raw JSON/table，要求导出规范化 TSV。
  - 第 6 轮：用户要求给出最终 decision memo：哪些关系可信、哪些需要实验验证。
- 必查点：矛盾证据引用能改变置信度；图谱边引用能追溯证据；导出 TSV 文件可预览。

#### 任务 5：长上下文压力下的报告迭代与压缩恢复
- 目标：通过大量中间结果、日志和多次追问，把 context window 推近阈值，验证 compact/handoff slimming 后仍能继续使用引用。
- 多轮脚本：
  - 第 1-3 轮：连续要求生成多个候选分析、表格和中间报告。
  - 第 4 轮：用户引用第一轮报告中的一个段落，要求和当前结论对比。
  - 第 5 轮：用户引用最新运行日志中的失败原因，要求修复并继续。
  - 第 6 轮：触发或模拟 context near-limit；确认 meter、compact event 和 audit refs 出现。
  - 第 7 轮：compact 后用户再次点击旧引用 chip，要求继续围绕旧引用追问。
  - 第 8 轮：输出压缩前后仍一致的最终结论和可复现 refs。
- 必查点：compact 后引用仍可用；handoff 不携带大 raw，但 backend 能通过 refs 找回必要上下文；不出现无限重试。

#### 任务 6：用户目标漂移与引用约束下的研究计划重构
- 目标：测试用户多次改变目标时，BioAgent 是否能保留关键引用、舍弃过时假设、重构计划并给出可执行下一步。
- 多轮脚本：
  - 第 1 轮：用户提出宽泛研究目标。
  - 第 2 轮：BioAgent 产出初始计划和假设列表。
  - 第 3 轮：用户右键引用其中一个假设，要求“只保留这条主线”。
  - 第 4 轮：用户点选一个无关结果 UI，要求解释为什么它不应进入主线。
  - 第 5 轮：用户引入新约束，例如预算、时间、数据不可用或必须使用特定 skill。
  - 第 6 轮：用户引用前一轮的约束文字，要求重写计划、里程碑和验收标准。
  - 第 7 轮：输出最终 project plan、risk register 和 next actions。
- 必查点：引用约束能覆盖旧目标；无关 UI 引用不会被过度使用；最终计划有明确完成标准。

#### TODO
- [x] 把上述 6 个任务整理成 `tests/longform/` 下的人工评测脚本，每个脚本包含 turn-by-turn prompt、必做引用操作、预期 artifact 和验收清单。
- [x] 为每个 `tests/longform/` 脚本增加 Codex 执行规程：内置浏览器步骤、Computer Use 步骤、截图点位、引用操作点位、预期高亮对象和失败记录格式。
- [x] 增加浏览器 E2E：选中文字右键引用到对话栏，确认输入框出现 `※n` marker、reference chip 出现、点击 chip 高亮原文。
- [x] 增加浏览器 E2E：点选模式引用整块 UI，确认输入框出现 `※n` marker、chip 点击高亮整块 UI。
- [x] 增加 Computer Use 冒烟：真实鼠标右键选中文字、点击“引用到对话栏”、点击 chip 回到来源并截图确认高亮。
- [x] 增加 Codex 长程回归模板：要求每次真实测试都记录内置浏览器 URL、Computer Use 截图、操作时间线、backend stream 关键事件和 artifact refs。
- [x] 增加长程回归准备器：从 `tests/longform/scenarios/*.json` 生成 pending `manifest.json`、`run-checklist.md` 和 evidence 目录，并纳入 `verify:deep`。
- [x] 增加 round observation recorder：真实 UI 每轮跑完后用 CLI 写入 observedBehavior、status、artifact/execution/screenshot refs，并自动推断顶层 run status。
- [x] 增加 top-level evidence recorder：用 CLI 追加或更新 artifacts、executionUnits、screenshots，减少人工编辑 manifest JSON 时漏证据。
- [x] 增加 finalization/scoring CLI：真实 run 结束后用 CLI 写入顶层 status、coverageStage、completedAt、1-5 分评分、结案 notes 和 blocker/repair action。
- [x] 增加 T060 evidence quality gate：`passed` manifest 必须包含 6+ passed rounds、2 类以上引用操作、browser/Computer Use/workspace 三类证据、produced artifacts 和引用影响说明。
- [x] 增加 longform status/weekly regression summary：汇总 6 个脚本的 latest status、passed/pending 数量、quality issues 和本周真实 backend passed run 数；可用 `--enforce-weekly` 强制每周至少 2 个真实回归。
- [x] 增加 weekly plan selector：按 missing、pending、repair-needed、failed 优先级选择本周还需要跑的真实 backend 场景，并生成 `longform:prepare` 命令。
- [x] 增加 weekly prepare：根据 weekly plan 一键生成本周推荐场景的 pending manifest/checklist；默认跳过已有 pending manifest，避免覆盖半成品记录。
- [x] 增加 next-round runner helper：从 pending manifest 输出下一轮 prompt、引用操作、预期 artifact、验收点和对应 `longform:record-round` 命令。
- [x] 增加 missing-evidence checklist：从 manifest 输出离 `passed` 结案还缺的 rounds、round refs、browser/Computer Use/workspace 证据、produced artifact、reference impact 和 completedAt。
- [x] 增加 evidence command generator：按当前 manifest 自动生成逐轮 `record-round`、顶层 `record-evidence` 和 `finalize` 命令骨架。
- [x] 增加 operator runbook exporter：为 pending manifest 生成 `operator-runbook.md`，汇总目标、下一轮、缺口、逐轮记录命令、顶层证据命令和 finalize 命令。
- [x] 增加多轮 contract test：发送请求时 `references` payload 保留 selectedText/sourceRef/composerMarker，prompt 中只含简短 marker，不含完整引用正文。
- [x] 增加 acceptance 检查：当用户引用了对象，最终回答必须在 message/run/objectReferences 或 artifact 中体现引用使用；未使用时进入 repair。
- [x] 增加长程测试记录模板：记录 backend、模型、轮数、context ratio、compact 事件、失败修复次数、最终 artifact refs 和人工评分。
- [x] 为每个长程任务定义评分维度：目标保持、引用使用、推理连续性、执行能力、失败恢复、artifact 质量、可复现性、UI 可用性。
- [x] 每周至少跑一次 2 个任务的真实 backend regression，保留 session export、workspace refs 和失败复盘。

#### 验收标准
- 至少 3 个长程任务能在真实 backend 上连续完成 6+ 轮，并产出可复现 artifact。
- 每个完成任务至少使用 2 个不同类型引用，且最终回答能说明引用如何影响结论或下一步行动。
- 引用 chip 点击可稳定高亮来源；引用 marker 简洁，不污染 prompt 阅读体验。
- 每个真实长程任务都必须有内置浏览器执行证据和 Computer Use 视觉证据；缺任一类证据则只能算未完成评测。
- 遇到失败、上下文压缩或用户目标变化时，BioAgent 能继续围绕已有 refs 推进，而不是丢失上下文或重新开始。
