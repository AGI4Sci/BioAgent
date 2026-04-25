# BioAgent - PROJECT.md

最后更新：2026-04-22

## 使用约定
- 本文档作为 BioAgent 工程任务板使用，正文只保留正在推进或待推进的任务；已完成任务压缩到归档摘要。
- 产品与架构基准见 `docs/BioAgent_Project_Document.md`。
- 当前 Web UI 位于 `ui/`，本项目服务运行在 `http://localhost:5173/`；本地 workspace writer 运行在 `http://127.0.0.1:5174/`。
- AgentServer 是项目无关的通用“大脑”和 fallback backend；BioAgent 不应维护一个写死工具清单，而应优先通过 skill registry、workspace-local task code 和 AgentServer 动态探索/写代码来解决用户请求。
- 如果确实定位到 AgentServer 通用能力缺口，可以修改 `/Applications/workspace/ailab/research/app/AgentServer`；修改必须泛化到协议、配置、通用工具连接、网络环境或 backend 能力层，并在对应 TODO 标明影响的 API / backend / tool 约定。
- BioAgent 的最终产品形态是 Scenario-first workbench，而不是每个 Agent 一套页面。用户准备 `scenario.md` 或选择内置 Scenario preset，系统编译为 `ScenarioSpec`，再由 skill registry、workspace task、AgentServer repair 和 UIManifest 驱动运行。
- BioAgent 当前的 `POST /api/bioagent/tools/run` 已接入薄的 workspace runtime gateway；前端发送 `scenarioId` 和内部 `skillDomain`。新增科学能力必须进入 seed/workspace skills、workspace-local task code 或 AgentServer 生成任务，而不是回到 TypeScript backend 分支。
- 语言边界必须显式：TypeScript 主要用于 Web UI、workspace writer、artifact/session 协议、组件 registry 和轻量编排壳；科学任务执行代码优先生成到 workspace 内的 Python 脚本 / notebook / package 中，并作为 artifact 的一部分沉淀。只有在性能、生态或既有科学工具要求时，才使用 R、C/C++、Rust、Julia、Shell、WASM 或其它语言；选择非 Python 语言必须在 ExecutionUnit 中记录原因、环境和可复现入口。
- BioAgent 不应把具体科学任务长期写死在 TypeScript backend 分支里。workspace runtime 只能作为通用能力原语和任务引导器；真实任务应尽量表现为 workspace-local code artifact，例如 `.bioagent/tasks/*.py`、`.bioagent/tasks/*.ipynb`、`.bioagent/tasks/*.R`，并输出标准 artifact JSON、日志和 ExecutionUnit。
- 用户请求的解析顺序应为：先检索已安装 skills 是否能满足；若没有合适 skill，则调用 AgentServer 探索、生成 workspace task code 并运行；若任务反复成功且被频繁使用，再由反思循环提炼为新的 skill。脚本即工具，skill 是被验证和泛化后的脚本/流程。
- 自愈机制必须优先复用 AgentServer 的通用“大脑”能力：任务失败后，BioAgent 应把 prompt、任务代码、stderr/stdout、artifact schema、用户反馈和失败现象交给 AgentServer，让其修改 workspace 任务代码并重跑；如果仍无法完成，必须返回明确失败原因和下一步所需条件，不能用 demo、默认结构、默认数据或 record-only 结果冒充成功。
- UI 页面只是交互、状态和展示承载层：动态性优先来自 ScenarioSpec、artifact schema、UIManifest 和 View Composition；展示需求先用 `colorBy`、`splitBy`、`overlayBy`、`facetBy`、`compareWith` 等声明式参数表达，只有标准组件、View Composition 和通用 inspector 都无法表达时，才生成临时 UI plugin，并且必须 sandbox、版本化、可回滚。
- 每个 Scenario 必须维护 scope declaration：能独立完成什么、需要什么输入、何时需要跨 Scenario 串联、何时必须承认当前阶段无法完成；禁止把跨领域开放问题强行包装成未经验证的巨型脚本。
- 湿实验反向路径中，agent 是结构化证据呈现者，不是最终裁判；“假设成立/不成立”必须由研究者或授权角色确认，并写入时间线。
- 研究时间线是一等公民：它是研究记忆、分支探索历史、belief dependency graph 的时间投影，也是未来研究编排层的状态基底。
- 多人协作与权限边界必须在 artifact、时间线、对齐工作台和实验数据回传中保留字段与设计空间；后续实现不能默认所有数据全员可见或可导出。
- 需要浏览器端到端探索时，优先验证用户能否完成真实研究动作，而不是只验证接口能返回；本轮收口优先使用无视觉依赖的 HTTP / runtime smoke，并留下可复现 prompt、调用路径、期望 artifact 和失败现象。
- 外部数据库或模型下载失败时，优先排查本机网络、代理、DNS、证书和服务端工具配置；不要把特定下载源硬编码进 UI。
- 代码路径必须尽量保持唯一真相源：引入新链路或发现冗余时必须删除、合并或明确降级旧链路，避免两个并行逻辑长期共存。

## 当前状态
- 已有 React + Vite Web UI，包含研究概览、Scenario 工作台、对齐工作台、研究时间线。
- 文献证据评估、结构探索、组学差异分析、生物医学知识图谱四个内置 Scenario preset 已通过 workspace runtime gateway 和 seed skills 返回真实 runtime artifact；科学任务逻辑迁入 workspace-local Python task。
- workspace writer 已能落盘 `.bioagent/workspace-state.json`、`sessions/`、`artifacts/`、`versions/`、`config.json`，并提供 Resource Explorer 文件操作。
- 已完成的 Agent 对话、project tool、handoff、workspace、ExecutionUnit 导出等任务见本文末尾归档摘要。

---

## P0 - 当前阻塞
- 暂无当前阻塞。T025/T026/T027/T028/T029/T030/T031/T032/T021 均已按当前阶段成功标准收口；剩余内容仅保留为后续产品化或归档说明，不作为本轮阻塞。

### T033 Scenario-first 产品形态收口

#### 目标说明
- 删除“不同 Agent 页面”作为产品主抽象，改为统一 Scenario workbench。ScenarioSpec 是一等公民；内置四个 preset 只是默认场景，不是页面分叉。

#### 成功标准
- 前端协议、工作台入口、session state、dashboard 文案都以 Scenario 为主语。
- `ui/src/scenarioSpecs.ts` 是前端场景契约唯一入口，声明 `skillDomain`、input/output artifact schema、scope declaration、default UIManifest slots 和 component policy。
- LLM/AgentServer prompt 只允许生成结构化 artifact、ExecutionUnit、claims 和 UIManifest；UI 不执行生成代码。
- workspace runtime 接收 `scenarioId + skillDomain`，skillDomain 只作为内部 skill matching 维度。
- README 与产品设计文档明确最终链路：`scenario.md -> ScenarioSpec -> skill/runtime -> artifact -> UIManifest -> component registry`。

#### TODO
- [x] 建立 `ScenarioSpec` 作为前端场景契约唯一入口。
- [x] 将 UI 状态和 session 主键改为 `ScenarioId` / `sessionsByScenario`。
- [x] 将 dashboard 与 workbench 文案切换为 Scenario preset / ScenarioSpec。
- [x] 将 workspace runtime 请求切换为 `scenarioId` + `skillDomain`。
- [x] 更新 README、PROJECT 和设计文档。

---

## P1 - 架构迁移主线

### T025 Workspace Runtime Gateway 与 `bioagent-tools.ts` 退场

#### 目标说明
- 将当前过渡性的 `scripts/bioagent-tools.ts` 拆分为薄的 runtime gateway，让 BioAgent 后端只负责 skill discovery、task 实例化、进程执行、artifact/log 收集、schema 校验和 AgentServer 自愈桥接；不再承载 PubMed/RCSB/ChEMBL/Scanpy 等具体科学逻辑。

#### 成功标准
- 新增更合适的入口文件，例如 `scripts/workspace-runtime-gateway.ts` 或 `scripts/skill-runtime.ts`，并让 `workspace-server.ts` 调用新入口。
- `scripts/bioagent-tools.ts` 只作为薄入口，不承载科学逻辑；新增功能不得继续写入该文件。
- gateway 接口输入统一为 `skillDomain`、`prompt`、`workspacePath`、`artifacts`、`uiState`、`availableSkills`；输出统一为 `ToolPayload` / `Artifact` / `ExecutionUnit` / logs。
- gateway 不包含数据库字段解析、科学算法、可视化逻辑；这些能力必须在 seed skills、workspace task code 或 AgentServer 生成代码中实现。
- 失败时返回 failed state、日志引用和修复入口，不返回 demo/default/record-only 成功态。

#### TODO
- [x] 新增 runtime gateway 文件和类型定义：`scripts/bioagent-tools.ts` 是薄入口，实际入口为 `scripts/workspace-runtime-gateway.ts`。
- [x] 抽出通用 task runner：`scripts/workspace-task-runner.ts` 支持 Python/R/Shell/CLI task，捕获 stdout/stderr、exitCode、output JSON、artifact refs、runtime fingerprint。
- [x] 把结构探索 Scenario 当前 Python task 执行路径迁入 gateway，作为第一个非 TS 科学逻辑样板：`structure.rcsb_latest_or_entry` seed skill 已通过 gateway 运行真实 RCSB task。
- [x] 删除旧 TS 科学逻辑分支；PubMed、UniProt/ChEMBL、RCSB 和基础 omics CSV differential 均通过 seed workspace task 运行。
- [x] 为 gateway 增加 schema validation：`message`、`claims`、`uiManifest`、`executionUnits`、`artifacts` 缺失或类型错误时返回 `repair-needed`，不生成 demo/default 成功态。
- [x] 更新 smoke：`npm run smoke:fixtures` 仍覆盖 PubMed/RCSB/omics/UniProt/ChEMBL fixture contract；直接 gateway smoke 已验证结构、PubMed、UniProt、ChEMBL 和 omics CSV differential workspace task。
- [x] 增加统一验证入口：`npm run verify` 会串起 typecheck、unit tests、全部 smoke 和 production build；README 已更新到 runtime gateway / seed skills / no local record-only adapter 的当前事实。

### T026 Seed Skill Library 与 Skill Registry MVP

#### 目标说明
- 建立冷启动可用的 seed skill library，覆盖高频 80% 生命科学任务；同时定义用户生成 skill 的 manifest、安装、匹配和启停机制。

#### 成功标准
- skill manifest 至少描述 `id`、`description`、`inputContract`、`outputArtifactSchema`、`entrypoint`、`environment`、`validationSmoke`、`examplePrompts`、`promotionHistory`。
- skills 明确分为 seed skills、workspace skills、user-installed skills。
- 首批 seed skills 覆盖 PubMed 检索、RCSB/AlphaFold 结构下载、基础差异表达、UniProt/ChEMBL 查询、通用文件/表格/日志 inspector。
- 每个 seed skill 都有最小 validation smoke，失败时自动标记 unavailable，不被匹配为可执行能力。
- skill matching 可以根据 prompt、ScenarioSpec、artifact input contract、历史成功率和 scope declaration 选择能力；无匹配时明确转入 AgentServer task generation。

#### TODO
- [x] 定义 `.bioagent/skills/`、`skills/seed/`、`skills/installed/` 目录结构和 manifest schema。
- [x] 将拓展目录拆分为 Tools 与 Skills：Tools 表示 MCP/database/runtime 等确定性工具流程；Skills 表示 Markdown 任务知识或可执行 seed skill。
- [x] 安装 SCP Markdown skill library 到 `skills/installed/scp/`，保留 121 个 `SKILL.md` 与附带 `manifest.json/index.js`；`npm run smoke:scp-skills` 校验安装数量、frontmatter 与 manifest 可读性。
- [x] runtime skill registry 已读取 installed `SKILL.md` 为 `markdown-skill`，并通过 matcher 区分 seed executable 主链与 SCP Markdown skill；`npm run smoke:tools-skills-diverse` 覆盖 PubMed、RCSB、UniProt、组学、BLASTP、protein properties、TCGA、molecular docking、biomedical web search 等多样化路由与 runtime 行为。

### T027 SCP Hub Live Skill Adapters

目标：把已安装 SCP Markdown skills 从“可发现/可匹配”推进到“可真实执行”，优先覆盖用户点名的 protein properties、TCGA expression、molecular docking、biomedical web search。

- [x] 验证 SCP 认证边界：`scphub.intern-ai.org.cn/api/mcp/v1/invoke` 对当前 key 返回 `user token expired`；直连 `scp.intern-ai.org.cn/api/v1/mcp/...` + `SCP-HUB-API-KEY` 可连接部分 MCP servers。
- [x] protein properties：文档中的 `VenusFactory` 后端连接失败；已改用可用的 `SciToolAgent-Bio` server 29，真实调用 `ComputeProtPara` / `ComputeHydrophilicity`。
- [x] biomedical web search：文档中的 `BiomedicalSearch` endpoint 是占位/不可解析；已改用 `Origene-Search` server 7，真实调用 `pubmed_search` / `tavily_search`。
- [x] TCGA expression：`Origene-TCGA` server 11 能列 tool 但远端内部服务 `47.101.156.188:80` refused；已设计 cBioPortal TCGA PanCancer Atlas fallback，记录 SCP failure 与 fallback source。
- [x] 新增 live adapter：`scripts/python_tasks/scp_live_adapter_task.py`，runtime gateway 对四个点名 SCP skills 走真实 MCP/cBioPortal fallback adapter；`npm run smoke:scp-live-skills` 需要临时环境变量 `SCP_HUB_API_KEY` 或 `SCPhub_api_key`。
- [x] 扩展为全量 SCP live adapter：所有 `scp.*` skill 都进入 live path。通用 adapter 会解析 `SKILL.md` 中的 MCP endpoint/tool，缺 endpoint 时按 skill id/description 推断候选 server，执行 `capability_probe=true` 时只做真实 MCP discovery，不触发重任务。
- [x] 全量 capability smoke：`SCP_HUB_API_KEY=... npm run smoke:scp-live-capability` 已探测 121/121 SCP skills，结果为 121 live/discoverable、0 explicit blockers。
- [x] 通用执行 smoke：`npm run smoke:scp-live-skills` 覆盖专用 adapter 与 generic adapter；其中 `scp.molecular-properties-calculation` 通过 `SMILESToWeight(smiles=CCO)` 真实执行。
- [x] molecular docking：真实 docking tool 位于 `DrugSDA-Tool` server 2（`molecule_docking_quickvina_fullprocess`）；已新增 `base64_to_server_file` staging，把 RCSB PDB 内容转成 SCP server-side path 后再交给 docking/pocket 工具。若 staging 或远端工具失败，adapter 仍返回 `failed-with-reason`，不伪造 docking score。
- [x] 把结构 Python task 提炼为 `structure.rcsb_latest_or_entry` seed skill。
- [x] 把 PubMed、UniProt、ChEMBL、omics differential runner 迁移为 seed skill task/template，而不是 TS 分支；PubMed、UniProt/ChEMBL 和基础 omics CSV differential 已迁入 workspace Python task，Scanpy/DESeq2/edgeR 后续应作为 omics task 内部可选后端补强，而不是回到 TS gateway 分支。
- [x] 实现 skill registry loader：读取 repo seed skills、workspace skills、user-installed skills，并输出 availability。
- [x] 实现 skill matcher MVP：prompt + skillDomain + artifact contract + validation status。
- [x] 实现 validation smoke runner，并把结果写入 `.bioagent/skills/status.json`；`npm run smoke:skill-registry` 会验证 seed skills 可用、坏 workspace skill 被标记 unavailable，且 unavailable skill 即使被显式 allow 也不会被匹配；`npm run smoke:seed-runtime` 通过 gateway 真实运行 PubMed、RCSB、UniProt、ChEMBL compound 和 omics workspace seed tasks。
- [x] 设计 skill promotion 草案格式：已在 `scripts/runtime-types.ts` 定义 `SkillPromotionProposal`，并在 `docs/SkillPromotionProposal.md` 记录待用户确认的 proposal 结构与 promotion 规则。

### T027 AgentServer Task Generation 与自愈协议

#### 目标说明
- 当 seed/user skill 无法满足请求或 task 失败时，BioAgent 将 prompt、workspace state、available skills、artifact schema、UI state、codeRef、stdout/stderr 和用户反馈交给 AgentServer，让其生成或修改 workspace task code 并重跑。

#### 成功标准
- AgentServer task generation 输入/输出协议明确，且不包含 BioAgent 专属硬编码逻辑。
- 自愈 attempt 必须写出新 task code 或 patch summary，保留 parentAttempt 和 diff 摘要。
- 失败重试次数、失败原因、缺失依赖、用户反馈都写入 task-result / timeline / ExecutionUnit。
- AgentServer 无法完成时返回明确原因和下一步所需条件，不生成 demo/default 结果。

#### TODO
- [x] 定义 AgentServer generation request：prompt、skillDomain、workspace tree summary、available skills、artifact schema、UIManifest contract、uiState/scope summary、prior attempts；类型见 `AgentServerGenerationRequest`，说明见 `docs/AgentServerTaskGenerationProtocol.md`；gateway 在无 skill 时会把最近 attempt history 和 UI scopeCheck 一并交给 AgentServer。
- [x] 定义 AgentServer generation response：task files、entrypoint、environment requirements、validation command、expected artifacts；类型见 `AgentServerGenerationResponse`。
- [x] 接入 AgentServer task generation 运行路径：无可用 skill 时，gateway 会向配置的 AgentServer `/api/agent-server/runs` 请求 `taskFiles/entrypoint`，写入 workspace-local task code 并执行；`npm run smoke:agentserver-generation` 使用本地 contract mock 验证 generated task 写入、运行、artifact 输出和 attempt history。
- [x] 定义 repair request：codeRef、inputRef、outputRef、stdoutRef、stderrRef、schema errors、用户反馈、UI 截图/状态摘要；类型见 `AgentServerRepairRequest` / `AgentServerRepairResponse`。
- [x] 实现 attempt history：attempt、parentAttempt、selfHealReason、patchSummary、diffRef、status；gateway 对 Python task 成功、失败和 schema repair-needed 都写入 `.bioagent/task-attempts/*.json`。
- [x] 构造失败 smoke：`npm run smoke:repair` 故意缺少 omics `matrixRef/metadataRef`，确认 gateway 返回 `repair-needed`、不生成假 artifact，并写入 `.bioagent/task-attempts/`；真实 AgentServer patch 后重跑已由下方 HTTP repair smoke 覆盖。
- [x] UI 展示 repair-needed / self-healed / failed-with-reason 状态：ExecutionUnit normalize 保留三类状态，执行面板展示 attempt、parentAttempt、selfHealReason、failureReason、patchSummary、diffRef 和日志/输出 refs。
- [x] 接入真实 AgentServer patch + rerun：当 task 失败或 schema validation 失败时，gateway 会向配置的 `agentServerBaseUrl` 发送 `/api/agent-server/runs` repair request，要求 AgentServer 修改 workspace task code；BioAgent 落盘 `.bioagent/task-diffs/*`，追加 `parentAttempt`，执行 attempt=2，并在成功时返回 `self-healed` ExecutionUnit。`npm run smoke:agentserver-repair` 使用本地 `/runs` contract mock 验证 patch + rerun；`npm run smoke:workspace-agentserver-repair` 进一步通过 workspace-server HTTP API 验证 `/api/bioagent/tools/run -> gateway -> AgentServer repair -> rerun -> self-healed payload`。若真实 AgentServer 不可达或修复失败，仍保持 `repair-needed/failed`，不伪造成功。

### T028 View Composition 与 Dynamic Results Inspector

#### 目标说明
- 将展示层的“无穷性”优先收敛到声明式 View Composition，而不是生成新 UI 代码；未知 artifact 使用通用 inspector。

#### 成功标准
- 标准组件支持 `colorBy`、`splitBy`、`overlayBy`、`facetBy`、`compareWith`、`highlightSelection`、`syncViewport` 等参数。
- UIManifest 能表达组件布局、联动、对比、分面、过滤和选区同步。
- 未知 schema 使用 JSON/table/file/log/image/PDF/HTML inspector；不会静默回退 demo。
- 动态 UI plugin 只有在标准组件、View Composition 和 inspector 都不足时触发，并要求 sandbox、版本、回滚和权限边界。

#### TODO
- [x] 定义 View Composition schema：component、artifactRef、encoding、layout、selection、sync、transform、compare；类型见 `UIManifestSlot` / `ViewEncoding` 等，说明见 `docs/ViewCompositionSchema.md`。
- [x] 为 molecule viewer、volcano、heatmap、UMAP、network、paper list、data table 增加组合参数支持；paper/data table 支持 filter/sort/limit transform，volcano/UMAP/network 支持 `colorBy`，heatmap 展示 split/facet label，molecule viewer 展示 highlightSelection，所有标准 slot 展示 composition summary。
- [x] 实现 UnknownArtifactInspector：未知 componentId 或显式 `unknown-artifact-inspector` 会展示 JSON/table preview、dataRef、codeRef、stdout/stderr/output refs。
- [x] 为 UIManifest 增加 validation 和 unsupported-state 提示：未注册 componentId 不再空白，显示 unsupported note 并进入 UnknownArtifactInspector。
- [x] workspace runtime seed skill 输出也接入 UIManifest composition：根据任务 prompt、用户编辑的 Scenario 设置和 artifact 类型重排/替换组件槽位；`npm run smoke:runtime-ui-manifest` 覆盖任务显式组件、Scenario override 和 View Composition hint。
- [x] 定义 dynamic UI plugin sandbox 设计，但暂不默认启用代码生成；见 `docs/DynamicUIPluginSandbox.md`。
- [x] 用 prompt 验证：`npm run smoke:view` 覆盖 UMAP 按 cell cycle 着色并 side-by-side batch 对比，不新增科学 task，只保留 UIManifest View Composition。

### T029 Agent Scope Declaration 与诚实边界

#### 目标说明
- 为每个Scenario 明确 Phase 1/2 的能力边界、输入要求、可独立完成的任务、需要手动串联的跨 Agent 场景和不能诚实完成的问题。

#### 成功标准
- 每个 ScenarioSpec 有机器可读 scope declaration。
- 用户提出跨领域开放问题时，系统返回拆解计划和边界，而不是生成未经验证的巨型脚本。
- skill matching 和 AgentServer task generation 都读取 scope declaration。
- UI 能展示“当前 Agent 能做什么 / 缺什么 / 下一步该转交给谁”。

#### TODO
- [x] 为 literature / structure / omics / knowledge / alignment 定义 scope declaration schema；当前 Web ScenarioSpecs 已定义 `ScenarioScopeDeclaration`，alignment 仍需在对齐工作台模型中接入。
- [x] 补充每个 Agent 的 supportedTasks、requiredInputs、unsupportedTasks、handoffTargets、phaseLimitations；literature / structure / omics / knowledge 已写入 `SCENARIO_SPECS`。
- [x] 在 prompt 路由前执行 scope check；超出范围时生成 handoff plan 或 manual chaining plan，并注入 AgentServer / project tool prompt metadata。
- [x] 在 UI 参数面板或 Agent contract 区展示 scope。
- [x] 为复杂跨域问题 smoke：保守性 + CRISPR 效率 + 文献证据，确认 scope check 生成 staged handoff plan 且提示不要生成未经验证的巨型脚本。

## P2 - 研究记忆、证据与协作

### T030 Belief Dependency Graph 与置信度更新

#### 目标说明
- 将 claim、evidence、artifact、assumption 和 decision 的依赖关系显式建模，避免置信度靠全局重算或模糊直觉更新。

#### 成功标准
- 每个 claim / conclusion 可记录依赖的 paper、artifact、实验结果、参数、前提假设和反证。
- 新证据进入系统时，只更新受依赖边影响的结论，并记录传播路径、更新原因和未更新边界。
- belief graph 能连接 timeline event 和 decision revision sequence。

#### TODO
- [x] 定义 belief dependency graph schema：claim 节点、evidence 节点、artifact 节点、assumption 节点、decision 节点、support/opposes/depends-on 边；类型见 `BeliefDependencyGraph`，说明见 `docs/BeliefDependencyGraph.md`。
- [x] 在 claim / evidence matrix / notebook timeline 中增加 dependency refs 和 update reason；`EvidenceClaim`、EvidenceMatrix 和 NotebookTimeline 均展示 dependencyRefs / updateReason，notebook record 也保留 beliefRefs、artifactRefs 和 executionUnitRefs。
- [x] 设计新证据进入后的局部置信度更新流程：影响范围计算、更新摘要、人工确认和回滚；流程见 `docs/BeliefDependencyGraph.md`。
- [x] 支持 opposing evidence 并排展示和“不足以更新”的状态；EvidenceMatrix 已并排展示 supporting / opposing / depends-on，具体“不足以更新”状态可通过 updateReason 记录。
- [x] 将 wet-lab researcher decision 接入 belief graph，但不覆盖原始证据节点；新增 `ResearcherDecisionRecord` 和 `attachResearcherDecision`，测试覆盖 decision 节点追加且原始 evidence 节点保留。

### T031 对齐工作台 MVP 边界

#### 目标说明
- 将对齐工作台早期版本收敛为模板化问卷、检查清单和来源标注；AI 负责翻译、归纳、指出缺失信息和组织讨论，不直接裁判项目可行性。

#### 成功标准
- 对齐工作台的可行性矩阵每个单元格都标注来源类型：用户填写、数据统计、已有 artifact、文献证据或 AI 推断。
- AI 在对齐工作台中优先负责翻译、归纳、指出缺失信息和组织讨论；证据不足时必须标注 unknown / needs-data，而不是给出确定判断。
- alignment contract 版本可被 hypothesis branch 引用。

#### TODO
- [x] 将对齐工作台 MVP 改为问卷 + checklist 优先：数据资产、样本量、标签质量、批次效应、成功标准、实验约束都先结构化采集。
- [x] 为可行性矩阵增加来源标注和 unknown state；默认矩阵单元标记 `source=AI-draft` / `needs-data`，无证据时不输出确定性可行判断。
- [x] 保存 alignment contract 时记录 sourceRefs、assumptionRefs、decisionAuthority；新增 confirmationStatus，默认 `needs-data`，避免把 AI 草案当正式契约。
- [x] 将 alignment contract version 暴露给 branch model，作为 hypothesis branch 的 parent source；contract 保存 `sourceContractVersion`，branch model 类型支持 `sourceContractVersion`。
- [x] 增加用户确认/签认状态，不把 AI 草案默认当作正式契约；新增“研究者确认保存”动作，确认后写入 `user-confirmed`、confirmedBy、confirmedAt。

### T032 研究时间线、湿实验裁决权与协作权限

#### 目标说明
- 将研究时间线提升为 BioAgent 的长期研究记忆和分支历史；明确湿实验反向路径中 agent 只呈现结构化证据，研究者保留裁决权；为多人协作和权限边界预留一等公民的数据模型。

#### 成功标准
- 时间线事件不只是文字日志，而是结构化记录 `actor`、`action`、`subject`、`artifactRefs`、`executionUnitRefs`、`beliefRefs`、`branchId`、`visibility`、`decisionStatus`、`createdAt`。
- 湿实验数据回传后，UI 区分 agent evidence summary、研究者裁决和下一步行动；agent 不自动把实验结果升级为“假设成立/不成立”。
- 时间线能表达清晰分支粒度：参数级变体只是 run attribute；方法级替代路径创建 method branch；问题定义变化创建 hypothesis branch，并指向对应的 alignment contract / belief / decision 版本。
- 研究者裁决可修订但不可抹除：旧裁决不能被覆盖删除，只能通过 `supersede`、`retract`、`amend`、`reaffirm` 等 revision event 形成裁决历史序列。
- 协作权限模型至少区分个人草稿、团队可见、项目正式记录、受限敏感数据；artifact 和时间线事件都有 visibility / audience 字段。
- 对齐契约、湿实验裁决、关键结论确认必须记录确认人、确认时间和依据。

#### TODO
- [x] 定义 timeline event schema，并与 artifact、ExecutionUnit、belief graph、workspace versions 建立引用关系；新增 `TimelineEventRecord`，包含 artifactRefs、executionUnitRefs、beliefRefs、visibility、decisionStatus。
- [x] 为 wet-lab result artifact 定义 evidence summary schema：quality checks、supports、opposes、uncertain、limitations、recommendedNextActions；新增 `WetLabEvidenceSummary`。
- [x] 在湿实验回传流程中加入 researcher decision record：`supported`、`not-supported`、`inconclusive`、`needs-repeat` 等状态由用户确认，并支持 revision status `supersede`、`retract`、`amend`、`reaffirm`；当前阶段以类型、belief graph helper 和可审计记录结构收口。
- [x] 设计分支时间线模型：`variantKind=parameter|method|hypothesis`、branchId、parentBranchId、sourceContractVersion、sourceBeliefId、mergeFrom、archivedAt、restoreReason；参数级变体不得默认创建 branch；新增 `ResearchBranchRecord`。
- [x] 设计 decision revision sequence：currentDecisionRef 指向最新裁决，历史裁决保持只读归档，belief graph 更新通过 revision event 传播；`BeliefDependencyGraph.currentDecisionRefs` 与 `supersedes` edge 已定义。
- [x] 定义协作与权限最小模型：roles、visibility、audience、sensitiveDataFlags、exportPolicy、decisionAuthority；新增 `CollaborationPolicy`，artifact/timeline 支持 visibility/audience/exportPolicy 字段。
- [x] 更新导出逻辑的权限约束：ExecutionUnit JSON Bundle 导出前会检查 artifact `exportPolicy`、`sensitiveDataFlags` 和 `audience`；`blocked` artifact 会阻止导出，`restricted` artifact 会在 bundle 中写入 warning 和敏感标记。设计约束见 `docs/TimelineDecisionCollaborationModel.md`，实现见 `ui/src/exportPolicy.ts`。

## P3 - 已开始但需并入新架构

### T034 高通量虚拟筛选 Agent 系统真实场景压测

#### 目标说明
- 用真实药物发现工作流压测 BioAgent：蛋白/口袋输入 -> 类药性预筛 -> 对接打分 -> ADMET -> 相似性扩增 -> 下一轮对接，验证 agent routing、SCP live adapter、artifact/ExecutionUnit 诚实状态和失败边界。

#### 本轮压测记录（2026-04-22）
- [x] 已启动项目服务：Web UI `http://localhost:5173/`，workspace runtime `http://127.0.0.1:5174/`。
- [x] Step 1 蛋白/口袋：通过 `structure.rcsb_latest_or_entry` 请求 `PDB 1A3N`，成功返回 `structure-summary`，下载 RCSB 坐标并写入 `.bioagent/structures/`。
- [x] Step 2 类药性预筛：通过 `scp.drugsda-drug-likeness` 调用 `calculate_mol_drug_chemistry`，代表 SMILES 批次成功返回 QED 与 Lipinski violations。
- [x] Step 3 对接：先通过 `scp.molecular-docking` 压测出 SCP DrugSDA docking 需要 server-side `pdb_file_path` 的真实边界；随后在 workflow adapter 中用 `base64_to_server_file` 完成 PDB 暂存，并通过 `molecule_docking_quickvina_fullprocess` 完成代表批次 docking attempt。
- [x] Step 4 ADMET：通过 `scp.drugsda-admet` 调用 `pred_mol_admet`，代表 SMILES 批次成功返回 `json_content`，包含 physicochemical、druglikeness 和多项 ADMET predictions。
- [x] Step 5 相似性扩增：通过 `scp.drugsda-mol-similarity` 映射到当前 DrugSDA MCP 实际工具 `calculate_morgan_fingerprint_similarity`，成功返回 candidate Tanimoto-like similarity scores。
- [x] 压测发现并修复 live adapter 参数问题：数组参数支持 `key="A|B|C"` 解析，复杂 SMILES 支持引号值，optional file/path 参数不再被 `smiles` 默认值污染。
- [x] 压测发现并修复 MCP error 诚实状态问题：generic SCP adapter 现在识别 MCP `isError` 和 structured `status=error/failed/failure`，返回 `failed-with-reason` 而不是误标 `done`。
- [x] 按用户要求用 Safari 网页端聊天真实回放虚拟筛选场景；第一次运行暴露 `inspector.generic_file_table_log` 抢路由导致 gateway adapter 缺失，已收紧 inspector/knowledge matcher，并为虚拟筛选 prompt 强化 `scp.drug-screening-docking` 路由。
- [x] 新增 `scp.drug-screening-docking` workflow adapter：同一次请求内串联 `calculate_mol_drug_chemistry`、`pred_mol_admet`、RCSB PDB 下载、`base64_to_server_file`、`pred_pocket_prank`、`molecule_docking_quickvina_fullprocess`、`calculate_morgan_fingerprint_similarity`，输出 `virtual-screening-workflow` artifact、data-table、unknown-artifact-inspector 和 execution-unit-table。
- [x] Safari 二次网页聊天压测成功：页面显示 `Virtual-screening workflow status: done.`，完成 4 个 Lipinski-pass molecule、4 行 ADMET、4 次 docking attempt，并生成 workflow artifact；第一次失败记录仍作为真实回归证据保留。
- [x] 补齐通用下载契约：任何 artifact 只要在 `data.downloads[]` 中提供 `{name, contentType, content, rowCount}`，DataTable/UnknownArtifactInspector 都会展示下载按钮；虚拟筛选 workflow 通过该契约提供 `prescreen.csv`、`docking_top1000.csv`、`admet_top100.csv`、`similarity_expansion.csv`，同时落盘到 `.bioagent/virtual-screening/<runId>/`。
- [x] 验证：`npm run typecheck` 通过；`SCPhub_api_key=... npm run smoke:scp-live-skills` 通过；补充 workflow smoke 返回 `virtual-screening-workflow`，完成 4 个 Lipinski-pass molecules、4 行 ADMET、4 次 docking attempt，并生成 4 个 CSV 下载项。当前代表批次只有 4 个输入 SMILES，因此 `docking_top1000.csv` 包含全部可用排序结果，不伪造到 1000 行。

#### 后续 TODO
- [x] 增加 SCP server-side file staging adapter：把 BioAgent 下载的 PDB 通过 `base64_to_server_file` 暂存到 SCP DrugSDA 可访问路径，再把该路径交给 `pred_pocket_prank` / `molecule_docking_quickvina_fullprocess`。
- [ ] 明确 StarBind 与当前 QuickVina/DrugSDA docking 的关系：若必须使用 StarBind，需要新增 StarBind skill/tool connector；若 QuickVina 可作为替代，需要在 Scenario contract 中标明。
- [ ] 将代表批次扩展为 CSV/SDF 大库流式任务：当前 CSV artifact/download schema 已落地；下一步需要接入真实百万库分页/队列化执行，而不是在同步网页请求中一次性 docking 1000+ 分子。
- [x] 为“1-5 完整工作流”新增 workflow-level ExecutionUnit，把每个 step 的 artifactRef/状态串成同一个可恢复 run，而不是仅靠多次独立 runtime 请求。

### T035 历史会话加载与恢复

#### 目标说明
- 用户刷新页面或重新进入工作区后，可以加载 `.bioagent/workspace-state.json` 中的历史会话；当前 Scenario 的 archived sessions 可以从聊天面板恢复为当前会话。

#### TODO
- [x] 启动时从配置 workspacePath 或 workspace writer 最近工作区读取 snapshot；没有显式 workspacePath 时也尝试最近工作区，不再直接跳过恢复。
- [x] 切换 workspacePath 或设置页修改 workspacePath 时强制加载对应 `.bioagent` 快照，避免只更新路径不恢复历史。
- [x] 聊天面板新增通用“历史会话”入口，按 Scenario 展示 archived sessions 的消息、artifact、ExecutionUnit 统计。
- [x] 支持恢复 archived session：当前活跃会话会先归档，选中的历史会话成为当前 Scenario 会话，适用于全部内置 Scenario。
- [x] 验证：`npm run typecheck` 通过；workspace snapshot GET 返回 active scenarios=4、archived sessions=11。

### T036 任务脚本通用性与输入驱动执行

#### 目标说明
- Python task 的职责是把一次用户问题沉淀为可复现执行代码；只有当现有脚本/adapter 与用户输入和任务形态匹配时才复用，否则应触发 AgentServer 生成或修复当前问题专用脚本，不能用固定 demo/default 输入伪装成功。

#### TODO
- [x] 虚拟筛选 workflow adapter 不再默认填充 `PDB 1A3N` 或默认 `CCO/CCN/...` 化合物；缺 PDB 或分子库时返回 `repair-needed/failed-with-reason` blocker，并声明需要用户输入或 AgentServer task generation。
- [x] 移除固定最多 5 个 docking attempt 的限制；`docking_top_n/top_n/top` 从 prompt 解析，默认语义为最多输出 top1000，但实际行数由输入库和真实工具结果决定，不伪造到 1000。
- [x] 支持 `smiles_list` 和 workspace 文件输入（`smiles_file/smiles_csv/library_csv/library`），脚本按输入库内容执行。
- [x] 移除通用 SCP 参数推断和专用 SCP adapter 中的 demo 默认值（如默认 protein sequence、EGFR/LUAD、BRCA1 query、aspirin、CCO、1A3N）；缺必需输入时返回 blocker，而不是自动补样例。
- [x] live SCP adapter 若返回 `repair-needed` 或 artifact metadata 标记 `requiresAgentServerGeneration`，runtime gateway 会尝试 AgentServer repair/generation，而不是把固定 adapter 结果当最终答案。
- [x] 验证：缺 PDB 请求不会使用默认结构；原始 4-SMILES prompt 返回 `4 input molecules`、4 次 docking attempt 和 4 个 CSV 下载项；`npm run typecheck` 与 `SCPhub_api_key=... npm run smoke:scp-live-skills` 通过。

### T037 Fresh task generation 运行记录与自愈重试

#### 目标说明
- 每次网页端新请求都应优先沉淀一份当前请求专属的可复现任务代码；代码、输入、输出、日志、自愈 diff 和 attempt history 都归档到 `.bioagent` 运行记录中。若当前环境缺 AgentServer 或生成失败，则回落到已有 validated adapter，但仍不得伪造成功。

#### TODO
- [x] 网页端 project-tool 请求在 `uiState` 中声明 `freshTaskGeneration: true`，让 runtime gateway 能区分用户交互请求和底层 capability/tool smoke。
- [x] runtime gateway 在匹配到固定 skill 后先尝试 AgentServer fresh task generation；AgentServer 不可用或 generation request 失败时才回落到现有 adapter，避免阻断无 AgentServer 环境。
- [x] AgentServer 返回的 `taskFiles` 不再直接散落到 workspace 任意相对路径；运行前统一归档到 `.bioagent/tasks/<generated-run-id>/...`，ExecutionUnit `codeRef` 指向归档后的入口代码。
- [x] generation prompt 明确要求：按当前用户请求重新生成任务代码、优先复用真实可用工具、缺输入/凭据/远端文件/可执行环境时返回 `failed-with-reason`，不能产出 demo/default success artifact。
- [x] AgentServer-generated task 的运行失败、schema validation 失败、JSON parse 失败都会写 attempt 1，并携带 code/log/schema/error 调用 `tryAgentServerRepairAndRerun` 自愈；成功修复后返回 `self-healed` ExecutionUnit 和 diffRef。
- [x] live SCP adapter 的执行失败和解析失败也接入同一自愈链路；固定 adapter 仍可作为无 AgentServer 环境的通用兜底。
- [x] 验证：`npm run typecheck` 通过；无 AgentServer/无 SCP key 的 fresh 请求回落到 `.bioagent/tasks/scp-live-*.py` 并明确 `failed-with-reason`；本地 fake AgentServer smoke 验证 generated codeRef 为 `.bioagent/tasks/generated-knowledge-*/main.py` 且任务成功执行；重启 workspace server 后复用服务环境中的 SCP key 跑通 `npm run smoke:scp-live-skills`。
- [x] 清理历史运行副本：保留 `.bioagent/tasks` 最近 12 个 active 任务脚本；将 48 个旧任务脚本及关联 input/result/log/attempt/diff 归档到 `.bioagent/archives/task-runs-20260422-211253/`，避免历史 `codeRef` 完全丢失。

### T021 Python-first 科学任务运行时与 AgentServer 自愈闭环

#### 目标说明
- 将 BioAgent 的科学任务执行层从 TypeScript 写死分支迁移为 workspace-local code artifact：优先由 AgentServer 生成/修改 Python 任务代码，BioAgent workspace service 负责执行、收集 artifact、渲染 UI，并在失败后把错误与用户反馈交还 AgentServer 自愈重试。

#### 成功标准
- TypeScript 只保留 UI、协议、workspace I/O、artifact registry 和任务调度；文献、结构、组学、知识库等具体科学任务优先以 workspace Python 代码表达。
- 每次科学任务至少沉淀一个可复验任务代码 artifact、一个标准结果 artifact、一个执行日志和一个 ExecutionUnit；ExecutionUnit 记录代码路径、语言、依赖、输入、输出、失败/成功状态。
- 当任务失败或用户反馈指出结果不真实时，BioAgent 能把任务代码、日志、artifact schema、浏览器反馈交给 AgentServer，让 AgentServer 修改代码并重跑；重试次数、diff、失败原因都要写入 artifact/log。
- 允许为了性能或生态使用 R、C/C++、Rust、Julia、Shell、WASM 或其它语言，但必须由任务代码显式声明选择理由、环境和可复现入口；不能因为 Web UI 是 TypeScript 就把科学分析逻辑默认写进 TypeScript。
- 若 AgentServer 或本地环境无法完成任务，UI 必须展示明确原因和缺失条件，不得 fallback 到 demo/default/record-only 结果并标记为成功。

#### TODO
- [x] 定义并落地首批 workspace 任务目录引用：结构任务使用 `.bioagent/tasks/`、`.bioagent/task-inputs/`、`.bioagent/task-results/`、`.bioagent/logs/`、`.bioagent/structures/`，每次运行写出 task code、input JSON、output JSON、stdout/stderr 和坐标文件。
- [x] 定义并接入首批 Python-first ExecutionUnit 字段：`language`、`codeRef`、`entrypoint`、`inputs`、`outputs`、`stdoutRef`、`stderrRef`、`attempt`；动态结果区 ExecutionUnit 面板展示 code artifact 和日志引用。
- [x] 先迁移结构探索 Scenario 的 RCSB/AlphaFold 任务：最新 PDB 搜索、坐标下载、mmCIF/PDB 解析、atomCoordinates 输出已放到 workspace Python task；TypeScript 只负责复制任务模板、执行 Python、读取标准结果 JSON。
- [x] 补齐通用 task runner 抽象：将结构探索 Scenario 当前的 Python runner 提炼为 skill-domain 无关的 workspace runner，支持 Python/R/Shell/CLI 脚本、捕获日志、退出码、产物路径和 runtime fingerprint；具体科学逻辑保留在 seed skill task code 中。
- [x] 接入 AgentServer 自愈协议：失败时把 prompt、codeRef、日志、artifact schema、用户反馈和 UI 状态发给 AgentServer `/api/agent-server/runs`，请其生成 patch 或新 attempt，再由 BioAgent 执行；修复 diff、parentAttempt、selfHealReason、AgentServer run id 和失败原因写入 attempt history / ExecutionUnit。
- [x] 再迁移组学差异分析 Scenario：将 Scanpy/DESeq2/edgeR 调用表达为 workspace task code，保留 Python/R 环境约定和真实 runner smoke；`scripts/python_tasks/omics_differential_task.py` 内部已包含 Scanpy、DESeq2、edgeR 后端选择与 fallback，`npm run smoke:omics-runners` 覆盖真实 Scanpy 或明确 fallback。
- [x] 更新动态结果区：展示 `taskCodeRef`、attempt history、自愈 diff 摘要、失败原因；没有真实 artifact 时保持 empty/failed state。ExecutionUnit 面板已展示 codeRef、stdout/stderr/outputRef、attempt、parentAttempt、selfHealReason、failureReason、patchSummary、diffRef。
- [x] 验证失败-反馈-自愈闭环：构造 schema 缺字段/缺输入场景，确认 AgentServer 能修改 task code 重跑，并通过同一 workspace-server HTTP API 返回真实 artifact 和 `self-healed` ExecutionUnit。为避免视觉验证慢且不稳定，本轮不用 Computer Use，改用 `npm run smoke:workspace-agentserver-repair` 做无浏览器端到端验证；该 smoke 同时覆盖请求体显式 `agentServerBaseUrl` 和 workspace `.bioagent/config.json` 回退配置；`npm run smoke:repair` 覆盖 repair-needed empty state，确认无法修复时不生成 demo/default artifact。
- [x] 移除前端一键 record-only local adapter：发送失败后 UI 不再生成会驱动结果图的本地草案 artifact；用户会看到明确错误，并继续走 workspace runtime / AgentServer 配置修复路径。omics skillDomain 的默认输入也从 `demo:rna-seq` 改为 workspace 文件约定 `matrix.csv`。
- [x] 收紧 knowledge unsupported 语义：未接 disease / clinical-trial connector 时仍可返回结构化 unsupported artifact 供 UI 解释缺口，但 ExecutionUnit 状态改为 `failed-with-reason`，不再用 `record-only`；`npm run smoke:knowledge-unsupported` 锁定该失败语义。

## 归档摘要
- T001 Agent 对话 API：已完成 AgentServer run/stream 接入、错误处理、排队 follow-up、响应 normalize。
- T002 Computer Use 真实可用性探索：已完成首页、设置、workspace、Agent prompt、导出、Resource Explorer smoke；记录见 `docs/ComputerUseSmoke.md`。
- T003 文献真实检索闭环：已迁回 BioAgent project tool，PubMed E-utilities 可返回真实 `paper-list`。
- T004 结构真实分析闭环：已迁回 BioAgent project tool，RCSB / AlphaFold DB 可返回真实 `structure-summary`。
- T005 Artifact 跨 Agent 手动流转：已完成 handoff message、artifact context、自动触发目标 Agent run。
- T006 Workspace 与 Resource Explorer 文件闭环：已完成 `.bioagent` 落盘、文件夹创建/重命名/删除、writer 错误提示。
- T007 组学真实分析 MVP：已完成 workspace CSV fixture、bounded local CSV differential runner、`.bioagent/omics` 输出与日志。
- T008 知识库真实查询 MVP：已完成 UniProt reviewed human gene 查询与 `knowledge-graph` artifact。
- T009 对齐工作台契约设计：已定义 `alignment-contract` schema，后续进入可编辑保存实现。
- T010 ExecutionUnit 导出与可复现性检查：已完成 JSON Bundle 为 Phase 1 规范审计产物，真实 project tool 返回 ExecutionUnit 字段。
- T011 动态结果区数据来源去 demo 化：已移除 paper cards、molecule viewer、volcano、heatmap、UMAP、network、data table、evidence matrix、ExecutionUnit、notebook 的无条件 demo fallback；右侧组件现在展示 `project-tool` / `record-only` / `empty` 来源条、artifact metadata、dataRef 和 producing tool。
- T012 文献证据评估 Scenario 结果区真实 `paper-list` 渲染：已通过 Safari Computer Use 验证 `TP53 tumor suppressor reviews` 由 BioAgent project tool 完成，右侧展示真实 PubMed paper cards、PubMed URL、`PubMed.eutils.esearch+esummary` ExecutionUnit。
- T013 结构探索 Scenario 结果区真实 `structure-summary` 渲染：已通过 Safari Computer Use 验证 `PDB 7BZ5 residues 142-158` 返回 RCSB `.cif` dataRef、residue range、molecule viewer 和 `RCSB.core.entry` ExecutionUnit；无 artifact 时不再加载默认 7BZ5。
- T014 组学差异分析 Scenario 结果区真实 omics artifact 渲染：已通过 Safari Computer Use 验证固定 CSV fixture 生成 `.bioagent/omics/...json`、`omics.local-csv-differential` ExecutionUnit，并驱动 volcano、heatmap、UMAP。
- T015 生物医学知识图谱 Scenario 结果区真实 `knowledge-graph` 渲染：已通过 Safari Computer Use 验证 `TP53 gene` 返回 UniProt reviewed human entry `P04637`、3 个节点、2 条边和 `UniProt.uniprotkb.search` ExecutionUnit；demo drug/pathway fallback 已从动态表格/网络中移除。
- T016 ExecutionUnit 与结果区一致性检查：已建立 artifact 到 ExecutionUnit 的 resolver，结果区 source badge 展示 producing tool/status；缺引用时显示审计 warning。
- T017 Browser Smoke 四 Agent 动态结果区真实数据回归：已用 Safari 覆盖 Literature、Structure、Omics、Knowledge；记录见 `docs/ComputerUseSmoke.md`。
- T018 组学真实统计运行时接入：已定义 BioAgent workspace-local Python/R runtime 路径，接入 Scanpy `rank_genes_groups`、DESeq2、edgeR 三条真实 runner；artifact/log 记录 requested/effective runner、runtime availability、软件版本、统计模型、输入指纹、outputRef、logRef，失败时回退到 `omics.local-csv-differential`。用户确认安装后，已在 `/tmp/bioagent-results-smoke` 安装 workspace-local Scanpy 1.12.1、R 4.4.3、DESeq2 1.46.0、edgeR 4.4.0；direct smoke 覆盖三条 runner，Safari Computer Use 覆盖 Scanpy 与 edgeR 大矩阵动态结果区。
- T020 对齐工作台真实编辑与版本恢复：已将 Alignment Workspace 从静态卡片升级为可编辑表单；保存生成 `alignment-contract` artifact，workspace writer 会落盘到 `.bioagent/artifacts/` 和 `.bioagent/versions/`；版本列表支持恢复，研究时间线显示保存/恢复事件；Safari Computer Use 已完成保存、刷新恢复和版本恢复 smoke。
- T019 知识库真实数据源扩展：已定义 gene/protein/compound/disease/clinical-trial disambiguation；gene/protein 走 UniProt，compound 已接入真实 ChEMBL molecule search + mechanism + drug indication；未接入的 disease/clinical-trial 仍返回明确 unsupported artifact；`knowledge-graph` 节点/边补充 sourceRefs/supportingRefs；Safari Computer Use 已验证 `sotorasib compound ChEMBL` 返回 ChEMBL compound graph、4 nodes、3 edges、`ChEMBL.molecule.search+mechanism+indication` / `done`。
