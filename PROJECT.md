# BioAgent - PROJECT.md

最后更新：2026-04-29

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

### T047 Runtime Task 生成化与 AgentServer Context Contract

状态：已完成。

#### TODO
- [x] 删除已提交的 `src/runtime/python_tasks/` 任务脚本和 Python cache，并在 `.gitignore` 中禁止再次提交 `__pycache__/`、`*.pyc`。
- [x] 将 `skills/seed/*/skill.json` 中指向源码 Python 脚本的 `workspace-task` entrypoint 迁移为 generated capability / `agentserver-generation` contract。
- [x] 收敛 `workspace-runtime-gateway` 中按 skill id 分支执行固定 Python 文件的逻辑，只保留通用 workspace/evolved skill runner 与 AgentServer generation/repair runner。
- [x] 定义并实现 `contextEnvelope` 构造器，作为 AgentServer generation 和 repair 请求的统一上下文输入。
- [x] `contextEnvelope` 必须包含 project facts、workspace facts、scenario facts、session facts、recent messages、artifact refs、ExecutionUnit/code/log refs、priorAttempts、expected artifact/UI contracts。
- [x] 同一 session 首次调用 AgentServer 时就发送稳定的 workspace/project/session facts，避免 AgentServer 反复探索 `.bioagent` 结构、task I/O 协议和当前项目要求。
- [x] 让 BioAgent sessionId 映射到稳定的 AgentServer agent/session/native backend session；优先复用 Codex/Claude/Gemini 原生多轮 thread/session，而不是每轮新建 stage session。
- [x] AgentServer adapter 层支持 session-scoped native session 缓存，并保留 resume/read/compact/close 生命周期入口；只有跨 backend stage、一次性审查或显式隔离任务才使用 stage-scoped ephemeral session。
- [x] 将 `contextEnvelope` 持久化或可诊断化到 `.bioagent/debug/agentserver-*`，便于排查 context 丢失、事实不一致和无效探索。
- [x] 更新多轮 context 策略：最近 N 条消息作为 short-term memory；workspace session/artifact/execution/attempt refs 作为 long-term memory；合并时以 workspace refs 为事实来源。
- [x] 增加测试：同一 session 中第二轮“继续/修复/文件在哪里”请求必须携带上一轮 artifact refs、codeRef、stdoutRef、stderrRef、taskResult refs 和 sessionId。
- [x] 更新 README 和 UI fallback 文案，把“seed executable skill / 改用 seed skill”改为“workspace capability / generated task / evolved skill”。
- [x] 用 browser smoke 验证工作台/Settings/Workspace/Timeline/Builder/mobile 关键路径；用 AgentServer generation smoke 验证一轮生成任务和一轮继续/查询文件位置的多轮上下文链路。

### T048 AgentServer 长任务上下文与通用多轮执行闭环

状态：已完成（协议与自动化验证完成；真实在线模型 Browser E2E 仍取决于用户侧模型配置可用性）。

#### TODO
- [x] 将 `turns.jsonl` 明确为冷的原始审计账本：只用于追溯、恢复、范围读取和诊断，不作为每轮请求的完整热上下文输入。
- [x] 将 `current.jsonl` 明确为热的有界工作上下文：每轮 backend 调用只接收经过筛选、压缩和引用化的当前状态。
- [x] 所有大体积内容必须 artifact/ref 化：任务脚本、PDF、报告、stdout/stderr、大 JSON、tool result 不得完整内联进 active context。
- [x] 为每个任务产物记录稳定 artifact refs：包含路径、类型、来源 run/turn、摘要 preview、大小/hash、生成状态和可恢复信息。
- [x] 多轮追问优先从 artifact refs、execution refs、workspace refs 回答，例如“文件在哪里”“继续上次任务”“报告在哪”“修复上一轮失败”不得重新套模板或无依据重跑。
- [x] 接入 AgentServer context snapshot：BioAgent 不再自行拼接模板化历史，而是使用 AgentServer Core 提供的 session context、recent turns、persistent/memory、artifact refs 和 operational guidance。
- [x] 所有用户可见回答必须经过 agent backend 判断生成；BioAgent 只负责路由、上下文准备、执行恢复、artifact 展示和错误诊断，不返回预设模板式最终答案。
- [x] 生成任务代码后必须继续执行到用户目标完成：代码生成只是中间步骤，成功条件以 expected artifacts、报告内容、文件落盘和 UI contract 满足为准。
- [x] 失败必须进入下一轮上下文：保留 failureReason、attempt history、代码路径、输入路径、stdout/stderr refs、recoverActions 和 nextStep。
- [x] 支持 checkpoint/resume：长任务在 stage/run 边界持久化进度，AgentServer 或 backend 断开后可从 refs 和 checkpoint 继续，而不是丢失上下文。
- [x] 实现通用 compaction 策略：按 token 压力和语义安全点生成 partial/full compaction tag，记录被压缩 turn range、保留事实、约束、文件引用和恢复路径。
- [x] 区分 AgentServer Core 与 backend harness：Core 提供通用 context/ref/ledger contract；prefix/work/stable/dynamic 等 harness 策略只作为 backend 内部实现，不强制所有 backend 采用。
- [x] 首轮 AgentServer 调用必须发送稳定事实：workspace root、项目原则、artifact contract、runner contract、当前 sessionId、已有 refs 和用户目标，减少 backend 重复探索。
- [x] 增加端到端测试：真实多轮复杂任务必须完成“检索/下载/阅读/生成报告 -> 用户追问文件位置 -> 用户要求补充报告字段 -> backend 基于上一轮产物继续修改”。
- [x] 增加可靠性测试：模拟 AgentServer 重启、stream 断开、大 stdout、大报告、大 turns log，确认不会 OOM，且后续多轮可恢复。
- [x] 增加非文献场景测试：至少覆盖一个非 arXiv/论文任务，验证方案不是特定任务补丁，而是通用多轮执行能力。

#### 完成记录
- AgentServer `turns.jsonl` 写入大 turn 时生成可恢复 `contentRef`，`current.jsonl` 自动保持有界热窗口，并为移出的 turn range 写入 `partial_compaction` tag。
- BioAgent 在 generation / repair / context-answer 请求中接入 AgentServer Core `/context` snapshot，并将 ToolPayload artifacts 持久化为 `.bioagent/artifacts/*.json` 稳定 refs。
- 多轮 artifact/location/report follow-up 默认经 AgentServer context-answer 判断；正常用户可见回答不得回退到本地模板。
- 修复跨场景 artifact 串扰：同一 workspace 内不同 domain 不会误用 unrelated artifact refs。
- 验证：BioAgent `npm run verify:fast`；AgentServer `npm test`、`npm run build`、`npm run smoke:agent-server`；两边 `git diff --check`。

### T049 通用多轮复杂任务闭环修复

状态：进行中。

#### TODO
- [x] 修复多轮意图路由：`文件在哪里/上一轮产物是什么` 这类引用型追问走 AgentServer context-answer；`继续补充/完善/更新/生成/执行/修复` 这类工作型请求必须进入通用 generation/continuation/repair 流程，不能因为提到 artifact/ref/report/上一轮而误判为纯问答。
- [x] 修复 AgentServer 结构化输出规范化：当 backend 返回 fenced JSON、ToolPayload-like JSON 或带 `artifacts` 的直接回答时，BioAgent 要解析出 `message`、`artifacts`、`uiManifest`、`executionUnits`，不得把整段 JSON 当作 markdown 报告展示。
- [x] 删除正常回答路径中的本地模板：所有用户请求必须先经过 AgentServer context-answer 或 generation/continuation 判断；BioAgent 本地只保留失败诊断、协议校验、执行恢复和 artifact 展示。
- [x] 建立“任务代码生成不是终点”的通用验收：如果 AgentServer 返回 `taskFiles` 或 workspace task ref，BioAgent 必须物化、执行、校验 expected artifacts，并在缺失时进入 repair/continuation，而不是只展示生成的代码。
- [x] 强化 artifact 写回：多轮继续生成的新报告、表格、结构化数据要落到 workspace `.bioagent/artifacts` 或 `.bioagent/task-results` 的稳定 ref；`agentserver://...` 临时 ref 只能作为诊断引用，不能替代本地可追踪产物。
- [x] 增加 smoke 覆盖：一轮生成并执行任务、二轮只问路径不重跑、三轮要求补充/更新 artifact 必须产生新的可追踪 artifact，且至少覆盖一个非文献任务，证明修复不是场景补丁。
- [ ] 用真实 Web E2E 复测：在浏览器工作台完成复杂三轮任务，确认 AgentServer 不断连、回复不是预设模板、最终 artifact 内容满足用户目标。

### T050 多轮对话 failed 根因调查与稳定运行方案

状态：核心修复已实现并完成针对性验证。

#### 实施记录
- BioAgent 已加入结构化 `BioAgentRunIntent`，将 existing-only follow-up、artifact continuation、repair、fresh retrieval 和 new task generation 分开路由。
- “不要生成新脚本 / 不要检索 / 只读取已有 / 基于上一轮” 且已有 refs/artifacts 的请求会强制走 AgentServer context-answer，不再进入 workspace-task-generation。
- `AgentServerGenerationResponse.taskFiles` 不再宽松接受纯 string path；path-only task file 必须已经存在于 workspace，否则触发 strict retry；strict retry 仍缺内容时返回 generation contract violation 或按 intent 转 context-answer。
- AgentServer workspace-task-generation/runtime-repair 请求会强制使用 native workspace-capable adapter 路径；配置了 OpenAI-compatible model endpoint 也不会自动降级到 `legacy_supervisor`。
- AgentServer stage finalizer 已增加 contract gate：`taskFiles` path-only、`filesChanged=[]`、`toolCallCount=0`、无 inline content 的 stage 会被标记为 failed，不再伪装 completed。
- 同一 BioAgent session 的 AgentServer agent id 不再按 purpose 拆分；generation/context-answer/repair 共用稳定 session key，并且 delta context 也包含 recent turns。
- `status=done` 的 task attempt 会清除 `failureReason`，避免成功记录污染后续多轮上下文。
- 验证：BioAgent `npm run typecheck`、`smoke:agentserver-artifact-followup`、`smoke:agentserver-generation`、`smoke:agentserver-path-only`、`smoke:agentserver-fenced-generation`、`smoke:agentserver-llm-endpoint`、`smoke-agentserver-path-only-taskfiles-retry.ts`、`smoke-agentserver-text-generation-fallback.ts`、UI routing tests；AgentServer `npm run build`、`agent-server-run-facade.test.ts`。

#### 真实复现结论
- 环境：浏览器工作台 `http://127.0.0.1:5173/`，真实 AgentServer 调用，非 mock。
- 第 1 轮：要求围绕 KRAS G12D / lung adenocarcinoma 检索并整理证据，返回成功，生成 paper-list、claims、结构证据缺口等结果。
- 第 2 轮：用户要求“基于上一轮结果重新分组 claims、重点说明证据强度和后续实验”，AgentServer 返回 `taskFiles` 路径 `.bioagent/tasks/kras-g12d-claim-reorganizer/reorganize_claims.py`，但没有 inline `content`，workspace 中也没有这个文件，BioAgent 物化失败，整轮变成 failed。
- 第 3 轮：用户明确要求“不要生成新脚本，也不要检索新论文，只读取当前会话已有 paper-list 和 claims”，仍然进入 `workspace-task-generation`，再次返回 path-only task file `.bioagent/tasks/kras-g12d-recovery-summary/recovery_summary_task.py`，仍然 failed。
- Debug 记录显示这些失败请求的 `purpose` 是 `workspace-task-generation`，`toolCallCount=0`，`filesChanged=[]`，输出只是 fenced JSON 文本。实际执行路径是 AgentServer `legacy_supervisor`，不是 Codex/agent backend adapter 的原生可写 workspace session。

#### 为什么现在不像 Codex 那样稳定长时间运行
- 当前多轮请求被拆成 BioAgent 的 generation、context-answer、runtime-repair 等不同 purpose；这些 purpose 会生成不同 AgentServer agent id/native session key，后端没有形成一个持续的“同一任务线程”。
- 当配置了 OpenAI-compatible model endpoint 时，AgentServer 会走 `legacy_supervisor` 路径。这个路径可以产出文本，但不能像 Codex native backend 一样稳定地编辑文件、运行命令、观察失败、继续修复。
- BioAgent 的 context policy 在有 artifact refs 的 delta 场景下会减少 recent turns；下一轮看到的是压缩过的 artifact/ref 摘要和前一轮 generated prompt，而不是一个连续的 agent 工作现场。
- HTTP stream 和 UI `runPrompt` 仍然以单次请求为生命周期；断流、超时、path-only generation 或一次 repair 边界失败，都会直接暴露成用户可见 failed，而不是 server-side run 继续执行、checkpoint、resume。
- UI completion 逻辑把任何 blocking `ExecutionUnit` / `repair-needed` / `failed-with-reason` 都提升成整轮 failed；这对真实 blocker 是对的，但缺少 `blocked-awaiting-user`、`repairing`、`completed-with-warnings`、`resumable` 等状态。

#### 根因拆解
- 多轮意图路由过于依赖正则：`不要重新/基于上一轮/读取已有结果/给我摘要` 这类 existing-only 请求仍可能因为提到报告、summary、执行、生成等词进入 task generation。
- `AgentServerGenerationResponse` 的 TypeScript 类型要求 `taskFiles[].content`，但 runtime parser 仍接受 `taskFiles: ["path.py"]`，导致 path-only JSON 被当成有效 generation 结果继续流入物化阶段。
- BioAgent 对 path-only task file 只有一次 strict retry；如果 retry 仍返回 path-only，就形成 terminal failed，没有自动切换到 native workspace-capable backend 或 existing-context answer。
- AgentServer stage boundary 没有把“声称生成 task file，但 `filesChanged=[]` 且无 inline content”判为 contract violation；legacy supervisor 可以用一段 JSON 文本完成 stage。
- AgentServer capability 没有显式参与路由：workspace-task-generation / repair 需要 `canEditWorkspace`、`canRunShell`、`canPersistNativeSession`，但当前 backend fallback 仍允许 model-provider-only 路径承担这些任务。
- running guidance 在 UI 中只是排队成下一次 `runPrompt`，不是注入当前 AgentServer run；用户以为是在指导正在运行的 agent，系统实际又开了一轮新 generation。
- task attempt 里存在成功 run 也写入 `failureReason` 的污染：`status=done` 但 `failureReason` 可能保存成功 message，后续上下文容易把历史成功误读成失败信号。

#### 总体改造目标
- 把 BioAgent 多轮对话从“每轮发起一次生成任务”改成“一个可恢复的 workspace run”：同一用户目标拥有稳定 runId/sessionId/nativeSessionRef，直到满足验收条件、用户暂停或遇到明确 terminal blocker。
- 把 AgentServer 从“能返回文本 JSON 就算完成 stage”改成“按 task contract 验收”：需要文件就必须有 inline content 或真实 filesChanged，需要执行就必须有 command/log/artifact evidence，需要修复就必须带 failure context 和 rerun evidence。
- 把 existing-only follow-up、continuation、repair、fresh retrieval 分开路由：不该生成脚本的请求绝不进入 task generation；该继续工作的请求必须接上已有 artifact/task refs，而不是从头探索。

#### BioAgent 侧修改方案
- 在 `src/runtime/workspace-runtime-gateway.ts` 增加结构化 `BioAgentRunIntent`：`answer_existing_context`、`continue_existing_artifact`、`repair_existing_task`、`generate_new_task`、`fresh_retrieval`、`rerun_current_task`。每次请求先产出 intent、confidence、freshWorkAllowed、workspaceWriteRequired、reason。
- 强化 existing-only 硬规则：只要用户明确说“不要重新/不要检索/不要生成新脚本/只读取已有/基于上一轮结果”，并且 session 有可用 artifact refs，就强制走 context-answer 或 artifact reader，禁止 workspace-task-generation。
- 将 artifact reader 前置为确定性能力：对已有 paper-list、claims、report、task result，先读取本地 `.bioagent/artifacts` / `.bioagent/task-results` 的结构化内容和必要 excerpt，再交给 AgentServer context-answer 组织回答。
- 修改 `parseGenerationResponse` 和 task materialization 前置校验：`taskFiles` 只接受对象；每个 task file 必须有非空 `content`，或者 AgentServer audit 必须证明该 path 已经在 workspace 写入。path-only string 在 BioAgent 边界直接判为 `contract_violation:path_only_taskfiles`。
- 对 strict retry 增加升级策略：如果一次 retry 后仍 path-only，按 intent 分流。existing-only 转 context-answer；workspaceWriteRequired 转 native workspace-capable backend；backend 无能力则返回清晰 blocker，不再让 UI 展示“找不到脚本”的低层错误。
- 合并 AgentServer agent/session identity：`agentServerAgentId()` 不再把 purpose 拼进身份主键；同一 BioAgent session/scenario 使用稳定 native session，generation/context-answer/repair 作为同一 session 的 turn metadata。
- 调整 `agentServerContextPolicy()`：delta 模式也要携带最近用户意图摘要、上一轮 assistant outcome、active task refs、失败 attempt refs；不要把大段 generation prompt 当成多轮语义上下文。
- 在 `src/ui/src/App.tsx` 将 running guidance 改成 active run guidance：有运行中的 AgentServer runId 时调用 guidance/interrupt endpoint；没有 active run 时才排队为下一轮 continuation。
- 在 `src/ui/src/api/bioagentToolsClient.ts` 调整 completion taxonomy：区分 `completed`、`completed-with-warnings`、`repairing`、`blocked-awaiting-user`、`resumable-failed`、`failed-terminal`。只有 terminal blocker 才标红 failed。
- 修复 attempt 记录：`status=done` 的 attempt 不允许写入 `failureReason`；成功摘要进入 `summary/message`，失败原因只在 failed/repair-needed 状态写入。

#### AgentServer 侧修改方案
- 在 `/Applications/workspace/ailab/research/app/AgentServer/server/agent_server/types.ts` 增加 backend capability contract：`canEditWorkspace`、`canRunShell`、`canPersistNativeSession`、`canResumeRun`、`canStreamToolEvents`、`supportsInlineTaskFiles`。
- 在 `/Applications/workspace/ailab/research/app/AgentServer/server/agent_server/service.ts` 的 backend selection 中加入 capability gate：`workspace-task-generation`、`runtime-repair`、`artifact-continuation` 必须使用具备 workspace edit/tool 能力的 native adapter；`legacy_supervisor` 只能承担 pure text/context-answer 或返回 inline content 的轻量生成。
- 修改 `shouldRouteModelEndpointThroughSupervisor` 的使用边界：配置了 model endpoint 不应自动把 workspace-write 任务降级到 legacy supervisor。若 native adapter 支持 model override，则仍走 native adapter；不支持时返回 capability blocker。
- 在 `buildStageRecordFromExecution()` 或 stage finalizer 中增加 contract verification：若输出包含 `taskFiles`/entrypoint 但 `filesChanged=[]`、`toolCallCount=0`、无 inline `content`，stage 必须失败为 `contract_violation:path_only_taskfiles`，不能标记 completed。
- AgentServer 对 BioAgent generation prompt 使用 JSON Schema/structured output gate：`taskFiles[].content` 非空、entrypoint 引用的文件必须存在于 inline content 或 workspace write evidence；不符合 schema 时自动在同一 native session 内修复一次。
- 将 native session scope 从 stage 优先改为 session/run 优先：同一 BioAgent session 的 generation、repair、context answer 共享 `nativeSessionRef`；只有显式隔离、安全审查或跨 backend handoff 才使用 stage scope。
- 增加 server-side run lifecycle：`POST /runs` 创建持久 run，`GET /runs/:id/events` 断线续流，`POST /runs/:id/guidance` 注入用户运行中指导，`POST /runs/:id/cancel` 取消。BioAgent UI 不再把一次 HTTP stream 当成任务生命。
- 在 AgentServer Core context store 中保存 compacted working memory：用户目标、当前计划、已完成 artifact refs、失败原因、下一步、acceptance checklist。恢复时优先加载 working memory，而不是原始 turns 全量拼接。

#### 执行闭环设计
- 标准状态机：`classify_intent -> load_context_refs -> choose_backend_by_capability -> generate_or_answer -> materialize -> execute -> validate_artifacts -> repair_or_continue -> final_answer`。
- 验收标准由 expected artifacts、用户目标和 task contract 共同决定：仅生成代码不是完成；必须有可读 artifact、stdout/stderr/log refs、UI manifest 或明确说明无法继续的 blocker。
- Repair loop 必须带上失败文件路径、stderr/stdout、缺失 artifact、上一次代码摘要和 contract violation 类型；每次修复后重新执行并验证，而不是只返回修复建议。
- 长任务每个安全点写 checkpoint：current plan、completed steps、pending steps、artifact refs、nativeSessionRef、backend capability、last event cursor。浏览器刷新或 stream 断开后可以继续看同一个 run。

#### 测试与验收
- BioAgent smoke：第 1 轮生成并执行复杂任务；第 2 轮“只基于上一轮结果总结/分组，不要重新检索/不要生成脚本”必须走 context-answer，不能出现 workspace-task-generation。
- BioAgent smoke：AgentServer 返回 path-only `taskFiles` 时，BioAgent 必须识别 contract violation，并按 intent 转 context-answer、切 native backend 或给 capability blocker；不得再报“workspace file missing”作为最终用户错误。
- AgentServer unit/smoke：legacy supervisor 返回 `taskFiles: ["foo.py"]` 且 `filesChanged=[]` 时 stage 必须失败为 contract violation；native adapter 真实写入文件或返回 inline content 时才能通过。
- UI E2E：四轮浏览器流程必须通过：复杂任务生成 artifact -> existing-only 追问 -> 基于 artifact 继续更新 -> 人为制造失败后 repair/rerun；全程 runId 可见、可恢复、没有误报 terminal failed。
- Resume E2E：中途断开 stream 或刷新页面后，UI 通过 runId/event cursor 恢复事件和最终 artifact，不能丢上下文或重新从头跑。
- Attempt context 测试：`status=done` 的 attempt 不允许有 `failureReason`；failed/repair-needed attempt 必须携带 failureReason、recoverActions、refs 和 nextStep。

#### 分阶段落地顺序
- Phase 1：先修硬失败边界。完成 BioAgent path-only schema 校验、existing-only intent 硬规则、AgentServer contract violation gate、attempt failureReason 污染修复。
- Phase 2：接入 capability routing。AgentServer 暴露 backend capabilities，BioAgent 对 workspace-write 任务强制选择 native workspace-capable backend，model-provider-only 路径只做 context-answer/direct payload。
- Phase 3：打通持久 run lifecycle。新增 runId/event cursor/guidance/resume/cancel，UI running guidance 注入 active run，HTTP 断线不等于任务失败。
- Phase 4：统一长期 session。移除 purpose-based native session 分裂，改为同一 BioAgent session 的稳定 nativeSessionRef，加 compacted working memory 和 acceptance checklist。
- Phase 5：真实 Web E2E 回归。用 KRAS G12D 三轮任务和一个非文献任务复测，确认多轮可以像 Codex 一样持续执行、修复和交付，而不是在中间协议错误处 failed。
