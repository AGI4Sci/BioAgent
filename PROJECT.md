# BioAgent - PROJECT.md

最后更新：2026-04-28

## 关键原则

- AgentServer 是项目无关的通用大脑和 fallback backend；BioAgent 不维护写死工具清单，优先通过 skill registry、workspace-local task code 和 AgentServer 动态探索/写代码解决请求。
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

状态：待开始。

#### TODO
- [ ] 将 `turns.jsonl` 明确为冷的原始审计账本：只用于追溯、恢复、范围读取和诊断，不作为每轮请求的完整热上下文输入。
- [ ] 将 `current.jsonl` 明确为热的有界工作上下文：每轮 backend 调用只接收经过筛选、压缩和引用化的当前状态。
- [ ] 所有大体积内容必须 artifact/ref 化：任务脚本、PDF、报告、stdout/stderr、大 JSON、tool result 不得完整内联进 active context。
- [ ] 为每个任务产物记录稳定 artifact refs：包含路径、类型、来源 run/turn、摘要 preview、大小/hash、生成状态和可恢复信息。
- [ ] 多轮追问优先从 artifact refs、execution refs、workspace refs 回答，例如“文件在哪里”“继续上次任务”“报告在哪”“修复上一轮失败”不得重新套模板或无依据重跑。
- [ ] 接入 AgentServer context snapshot：BioAgent 不再自行拼接模板化历史，而是使用 AgentServer Core 提供的 session context、recent turns、persistent/memory、artifact refs 和 operational guidance。
- [ ] 所有用户可见回答必须经过 agent backend 判断生成；BioAgent 只负责路由、上下文准备、执行恢复、artifact 展示和错误诊断，不返回预设模板式最终答案。
- [ ] 生成任务代码后必须继续执行到用户目标完成：代码生成只是中间步骤，成功条件以 expected artifacts、报告内容、文件落盘和 UI contract 满足为准。
- [ ] 失败必须进入下一轮上下文：保留 failureReason、attempt history、代码路径、输入路径、stdout/stderr refs、recoverActions 和 nextStep。
- [ ] 支持 checkpoint/resume：长任务在 stage/run 边界持久化进度，AgentServer 或 backend 断开后可从 refs 和 checkpoint 继续，而不是丢失上下文。
- [ ] 实现通用 compaction 策略：按 token 压力和语义安全点生成 partial/full compaction tag，记录被压缩 turn range、保留事实、约束、文件引用和恢复路径。
- [ ] 区分 AgentServer Core 与 backend harness：Core 提供通用 context/ref/ledger contract；prefix/work/stable/dynamic 等 harness 策略只作为 backend 内部实现，不强制所有 backend 采用。
- [ ] 首轮 AgentServer 调用必须发送稳定事实：workspace root、项目原则、artifact contract、runner contract、当前 sessionId、已有 refs 和用户目标，减少 backend 重复探索。
- [ ] 增加端到端测试：真实多轮复杂任务必须完成“检索/下载/阅读/生成报告 -> 用户追问文件位置 -> 用户要求补充报告字段 -> backend 基于上一轮产物继续修改”。
- [ ] 增加可靠性测试：模拟 AgentServer 重启、stream 断开、大 stdout、大报告、大 turns log，确认不会 OOM，且后续多轮可恢复。
- [ ] 增加非文献场景测试：至少覆盖一个非 arXiv/论文任务，验证方案不是特定任务补丁，而是通用多轮执行能力。
