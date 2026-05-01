# BioAgent - PROJECT.md

最后更新：2026-05-01

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

状态：已完成首版（已接入通用 `UserGoalSnapshot`、确定性 `TurnAcceptanceGate`、展示层自动修复、最终回复 objectReferences 抽取、右侧文件预览和 contract/test 覆盖；语义验收和深度 backend rerun repair 作为后续增强）。

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
- [ ] 后续增强：接入语义验收，由 backend 判断最终回答是否满足用户目标，但 BioAgent 保留确定性 gate 的否决权。
- [ ] 后续增强：artifact/execution repair 可在用户允许或后台预算满足时自动触发第二次 AgentServer rerun，而不仅记录 `repairPrompt`。
- [x] 增加单测：用户要求 Markdown 报告，backend 返回 JSON 包裹路径，系统自动生成可点击文件引用并避免 raw JSON 默认呈现。
- [x] 增加单测：用户最终回复包含 `.csv` / `.md` 路径，路径自动变 chip，优先展示报告路径。
- [ ] 后续增强：补 browser E2E 覆盖点选历史消息/图表后追问、右侧结果聚焦和真实文件预览。



### T057 统一 Backend Context Window 契约、原生压缩与失败自治恢复

状态：已规划（从 Codex-first 调整为 backend-neutral；上层行为一致，底层优先复用各 backend 原生能力）。

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
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextWindowTokens?: number;
  ratio?: number;
  source: 'native' | 'provider-usage' | 'agentserver-estimate' | 'unknown';
  status: 'ok' | 'watch' | 'near-limit' | 'compacting' | 'blocked' | 'unknown';
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
- `gemini`：优先读取 SDK usage stream 和 long-context metadata；若 SDK 后续暴露 native compact/clear/summarize API 就接入，否则用 AgentServer preflight compact + handoff slimming，必要时 rotate session。
- `claude-code`：已确认 vendored Claude Code 暴露原生 `/compact`、`compact_boundary`、`status=compacting` 与 usage 相关消息；通过 supervisor bridge 优先调用原生 `/compact`，并把 compact/usage 信号归一化。
- `self-hosted-agent` / `openteam_agent`：作为白盒参考实现，直接实现统一 contract；AgentServer session-store/current-work compaction 即本 backend 的 native managed compaction。
- `hermes-agent`：优先复用 Hermes context compressor、context length detection、rate-limit diagnostics；通过 supervisor compat adapter 将压缩事件、window ratio 和 retry-after 归一化成统一事件。
- `openclaw`：若无可探测 native compact，就标记为 `handoff-only` / `session-rotate`，仍保持同样的 UI 和 preflight 策略。

#### TODO
- [x] 扩展 `AgentBackendCapabilities`：增加 `contextWindowTelemetry`、`nativeCompaction`、`compactionDuringTurn`、`rateLimitTelemetry`、`sessionRotationSafe` 等能力位。
- [x] 扩展 `AgentBackendAdapter` contract：增加 `readContextWindowState(sessionRef)`、`compactContext(sessionRef, reason)` 可选方法；无原生能力的 backend 返回 fallback capability，而不是抛错。
- [ ] 将所有 backend 的 usage event 归一化为 `BackendContextWindowState`：Codex 用 `thread/tokenUsage/updated`，Gemini 用 SDK `usage`，Claude/self-hosted/Hermes/OpenClaw 用 supervisor/model-provider usage 或 AgentServer 估算。
- [x] 在 AgentServer run preflight 中统一判断 `watch` / `near-limit`：接近阈值时先调用 backend native compact；没有 native compact 时调用 AgentServer `/compact` 或 handoff slimming。
- [x] Codex adapter：封装 `compactThread(threadId)`，调用 `thread/compact/start`，监听 `contextCompaction` item、`turn/completed` 和 error，并把压缩事件写入 run observation。
- [x] Codex custom provider：配置 `model_context_window`、`model_auto_compact_token_limit` 和可选 `compact_prompt`，避免 unknown model fallback 让 auto compact 阈值失真。
- [ ] Gemini adapter：探测 SDK 是否提供 context window / session compaction / session reset API；若没有，明确标记为 `agentserver` 或 `session-rotate` fallback。
- [x] Claude Code bridge：检查 vendored Claude Code remote/session manager 能否提供 usage、limit、summary、compact 或 clear history；能用则接入，不能用则只暴露 fallback。
- [ ] Hermes compat adapter：映射 Hermes `context_compressor`、context length、compression threshold、rate-limit reset 信息到统一事件。
- [ ] 对 `contextWindowExceeded` 做一次自动恢复：触发统一 compact，再重放同一轮用户请求一次；仍失败时返回 blocker 和 refs。
- [ ] 对 `responseTooManyFailedAttempts` / 429 做受控恢复：退避、减少传入上下文、必要时 compact 后重试一次；不做无限重试，并明确暴露 provider/rate-limit 诊断。
- [ ] 将 AgentServer 自身的 session compaction 从“run 后整理”为“run 前可预防”：在 includeCurrentWork、多轮失败修复、prior run 很大时先 preview/compact current work，再交给 backend。
- [ ] 增加 smoke/contract 覆盖：每个 backend 至少覆盖 `readContextWindowState`、preflight compact fallback、context error compact+retry、429 不无限重试。
- [ ] 若必须修改 Codex/Claude/Gemini/Hermes/OpenClaw 等官方或 vendored backend 源码，先证明无法通过 SDK/API/RPC/app-server、环境变量、配置、bridge 或 capability 降级解决；patch 必须小、集中、可重放，并记录到 `/Applications/workspace/ailab/research/app/AgentServer/docs/upstream-backend-overrides.md`。
- [ ] BioAgent UI：ExecutionUnit 保留为“可复现/运行审计”详情，不作为普通用户默认主 tab；失败、开发者模式、用户点击“查看运行细节”时展开。
- [ ] BioAgent UI：研究记录只保留 curated notebook 价值，包括里程碑、假设、关键证据、决策和 run refs；若只是复刻聊天内容，则默认隐藏或合并到运行详情。
- [ ] 结果视图降噪：默认只展示用户最关心的成果、状态和少量恢复建议；raw JSON、完整 ExecutionUnit、完整 timeline、stdout/stderr 统一放入可展开详情。

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
- [ ] 当用户点击 meter 或“压缩上下文”时，调用统一 compact API；成功后刷新 state，并在聊天中轻量记录一条 system observation。
- [x] 如果 source 是估算或 unknown，UI 用不同样式提示“估算/未知”，但仍允许手动 compact。
- [ ] 自动压缩必须可审计：每次 compact 写入 reason、before/after、backend capability、audit refs。
- [ ] compact 失败时不要打断用户输入；显示可恢复状态，并让下一轮请求带上 compact failure ref 交给 backend 处理。
- [ ] 增加前端测试：不同 ratio/status/source 的显示、自动 compact 阈值、防重复触发、backend unsupported fallback。
- [ ] 增加 browser E2E：多轮对话让 usage 接近阈值，确认 meter 变色、preflight 自动 compact、用户侧体验一致。



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
- [ ] 与 T058 联动：handoff slimming 后刷新 context meter，避免用户看到压缩完成但下一轮又瞬间爆表。
