# BioAgent - PROJECT.md

最后更新：2026-04-20

## 使用约定
- 本文档作为 BioAgent 工程任务板使用，正文只保留正在推进或待推进的任务；已完成任务压缩到归档摘要。
- 产品与架构基准见 `docs/BioAgent_Project_Document.md`。
- 当前 Web UI 位于 `ui/`，本项目服务运行在 `http://localhost:5173/`；本地 workspace writer 运行在 `http://127.0.0.1:5174/`。
- AgentServer 是项目无关的通用“大脑”和 fallback backend；BioAgent 不应维护一个写死工具清单，而应优先通过 skill registry、workspace-local task code 和 AgentServer 动态探索/写代码来解决用户请求。
- 如果确实定位到 AgentServer 通用能力缺口，可以修改 `/Applications/workspace/ailab/research/app/AgentServer`；修改必须泛化到协议、配置、通用工具连接、网络环境或 backend 能力层，并在对应 TODO 标明影响的 API / backend / tool 约定。
- BioAgent 当前的 `POST /api/bioagent/tools/run` 和 `scripts/bioagent-tools.ts` 属于过渡实现：它们可以保留到迁移完成，但不能继续扩展为“更多 if/else 工具分支”。目标形态是删除或重写为薄的 workspace runtime gateway / skill runtime，例如 `workspace-runtime-gateway.ts`，只负责 skill matching、task 运行、artifact 收集和 AgentServer 自愈桥接。
- 语言边界必须显式：TypeScript 主要用于 Web UI、workspace writer、artifact/session 协议、组件 registry 和轻量编排壳；科学任务执行代码优先生成到 workspace 内的 Python 脚本 / notebook / package 中，并作为 artifact 的一部分沉淀。只有在性能、生态或既有科学工具要求时，才使用 R、C/C++、Rust、Julia、Shell、WASM 或其它语言；选择非 Python 语言必须在 ExecutionUnit 中记录原因、环境和可复现入口。
- BioAgent 不应把具体科学任务长期写死在 TypeScript backend 分支里。内置 project tool 只能作为通用能力原语、任务引导器或兼容 fallback；真实任务应尽量表现为 workspace-local code artifact，例如 `.bioagent/tasks/*.py`、`.bioagent/tasks/*.ipynb`、`.bioagent/tasks/*.R`，并输出标准 artifact JSON、日志和 ExecutionUnit。
- 用户请求的解析顺序应为：先检索已安装 skills 是否能满足；若没有合适 skill，则调用 AgentServer 探索、生成 workspace task code 并运行；若任务反复成功且被频繁使用，再由反思循环提炼为新的 skill。脚本即工具，skill 是被验证和泛化后的脚本/流程。
- 自愈机制必须优先复用 AgentServer 的通用“大脑”能力：任务失败后，BioAgent 应把 prompt、任务代码、stderr/stdout、artifact schema、用户反馈和失败现象交给 AgentServer，让其修改 workspace 任务代码并重跑；如果仍无法完成，必须返回明确失败原因和下一步所需条件，不能用 demo、默认结构、默认数据或 record-only 结果冒充成功。
- UI 页面只是交互、状态和展示承载层：动态性优先来自 artifact schema、UIManifest 和 View Composition；展示需求先用 `colorBy`、`splitBy`、`overlayBy`、`facetBy`、`compareWith` 等声明式参数表达，只有标准组件、View Composition 和通用 inspector 都无法表达时，才生成临时 UI plugin，并且必须 sandbox、版本化、可回滚。
- 每个 Agent 必须维护 scope declaration：能独立完成什么、需要什么输入、何时需要跨 Agent 串联、何时必须承认当前 Phase 无法完成；禁止把跨领域开放问题强行包装成未经验证的巨型脚本。
- 湿实验反向路径中，agent 是结构化证据呈现者，不是最终裁判；“假设成立/不成立”必须由研究者或授权角色确认，并写入时间线。
- 研究时间线是一等公民：它是研究记忆、分支探索历史、belief dependency graph 的时间投影，也是未来研究编排层的状态基底。
- 多人协作与权限边界必须在 artifact、时间线、对齐工作台和实验数据回传中保留字段与设计空间；后续实现不能默认所有数据全员可见或可导出。
- 通过 Computer Use 做端到端探索时，优先验证用户能否在浏览器里完成真实研究动作，而不是只验证接口能返回；每个任务都需要留下可复现 prompt、点击路径、期望 artifact 和失败现象。
- 外部数据库或模型下载失败时，优先排查本机网络、代理、DNS、证书和服务端工具配置；不要把特定下载源硬编码进 UI。
- 代码路径必须尽量保持唯一真相源：引入新链路或发现冗余时必须删除、合并或明确降级旧链路，避免两个并行逻辑长期共存。

## 当前状态
- 已有 React + Vite Web UI，包含研究概览、单 Agent 工作台、对齐工作台、研究时间线。
- 文献、结构、组学、知识库四个 Agent 已能通过过渡性的 BioAgent project tool 返回真实 runtime artifact；下一阶段要把这些能力迁移为 skills / workspace tasks / runtime gateway。
- workspace writer 已能落盘 `.bioagent/workspace-state.json`、`sessions/`、`artifacts/`、`versions/`、`config.json`，并提供 Resource Explorer 文件操作。
- 已完成的 Agent 对话、project tool、handoff、workspace、ExecutionUnit 导出等任务见本文末尾归档摘要。

---

## P0 - 当前阻塞
- 暂无。T018 真实 runner 安装与 smoke 已完成；后续任务待新增。

---

## P1 - 后续能力增强

### T022 Skill-growing Runtime 与 `bioagent-tools.ts` 退场

#### 目标说明
- 将 BioAgent 从“TS 文件里写死工具分支”的应用，重构为 skill-growing scientific workspace：用户请求先匹配 skills，匹配不到则由 AgentServer 动态探索、写 workspace task code、运行并自愈；高频成功任务再被整理成新 skill。

#### 成功标准
- `scripts/bioagent-tools.ts` 不再作为长期文件名和能力边界存在；迁移期结束后删除，或重写/重命名为薄的 runtime gateway，例如 `scripts/workspace-runtime-gateway.ts` / `scripts/skill-runtime.ts`。
- runtime gateway 不包含 PubMed/RCSB/ChEMBL/Scanpy 等具体科学逻辑，只提供 skill discovery、task instantiation、process execution、artifact/log collection、schema validation、AgentServer repair handoff。
- skill manifest 至少描述 `id`、`description`、`inputContract`、`outputArtifactSchema`、`entrypoint`、`environment`、`validationSmoke`、`examplePrompts`、`promotionHistory`。
- skills 分为 seed skill library 和 user-generated skill library：seed skills 由团队预构建并覆盖高频 80% 任务，用户生成 skills 来自 workspace task 的成功复用和用户确认。
- BioAgent 能记录用户行为和对话历史中的重复工作流，定期生成 skill 提炼建议；用户确认后才把 workspace task 提升为已安装 skill。
- UI 根据 artifact schema / UIManifest / View Composition 动态展示；未知 artifact 先进入通用 inspector，而不是立刻生成不可控 UI 代码。

#### TODO
- [ ] 新增 skill registry 规范：定义 repo skills、workspace skills、用户安装 skills 的目录结构、manifest schema、版本和启停策略。
- [ ] 定义 seed skill library 冷启动范围：首批覆盖 PubMed、RCSB/AlphaFold、基础差异表达、UniProt/ChEMBL、常见文件/表格/日志 inspector，并为每个 seed skill 提供 validation smoke。
- [ ] 设计 skill matching 流程：根据用户 prompt、当前 agent、workspace artifacts、input contract 和历史成功率选择 skill；不匹配时明确转入 AgentServer task generation。
- [ ] 把 `scripts/bioagent-tools.ts` 拆分退场：保留兼容入口，新增更合适的 runtime gateway 文件名；逐步把现有 literature/structure/omics/knowledge 分支迁到 skills 或 task templates。
- [ ] 定义 AgentServer task generation 协议：输入 prompt、workspace state、available skills、artifact schema、UI state；输出 task code、依赖说明、validation command 和预期 artifacts。
- [ ] 定义 skill promotion / reflection loop：周期性总结用户常用任务、成功 task、失败修复记录，生成可审阅的新 skill 草案和 smoke test。
- [ ] 定义 UI View Composition 协议：标准组件支持 `colorBy`、`splitBy`、`overlayBy`、`facetBy`、`compareWith`、`highlightSelection`、`syncViewport` 等参数；未知 schema 使用 JSON/table/file/log inspector；动态 UI plugin 必须 sandbox、版本化、可回滚。
- [ ] 为每个 Agent 补充 scope declaration：明确 Phase 1/2 可独立完成的任务、需要的输入、跨 Agent 手动串联方式和不能诚实完成的边界。

### T023 Belief Dependency Graph 与对齐工作台 MVP 边界

#### 目标说明
- 将置信度更新和对齐工作台从“听起来合理的 AI 判断”收敛为可审计机制：结论依赖显式图谱，更新有传播路径；对齐工作台早期版本优先使用模板化问卷、检查清单和来源标注，而不是让 AI 直接裁判项目可行性。

#### 成功标准
- 每个 claim / conclusion 可记录依赖的 paper、artifact、实验结果、参数、前提假设和反证，形成 belief dependency graph。
- 新证据进入系统时，只更新受依赖边影响的结论，并记录更新路径、原因和未更新边界。
- 对齐工作台的可行性矩阵每个单元格都标注来源类型：用户填写、数据统计、已有 artifact、文献证据或 AI 推断。
- AI 在对齐工作台中优先负责翻译、归纳、指出缺失信息和组织讨论；证据不足时必须标注 unknown / needs-data，而不是给出确定判断。

#### TODO
- [ ] 定义 belief dependency graph schema：claim 节点、evidence 节点、artifact 节点、assumption 节点、support/opposes/depends-on 边和置信度更新字段。
- [ ] 在 claim / evidence matrix / notebook timeline 中增加 dependency refs 和 update reason。
- [ ] 设计新证据进入后的局部置信度更新流程：影响范围计算、更新摘要、人工确认和回滚。
- [ ] 将对齐工作台 MVP 改为问卷 + checklist 优先：数据资产、样本量、标签质量、批次效应、成功标准、实验约束都先结构化采集。
- [ ] 为可行性矩阵增加来源标注和 unknown state；禁止无证据时输出确定性可行/不可行判断。

### T024 研究时间线、湿实验裁决权与协作权限

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
- [ ] 定义 timeline event schema，并与 artifact、ExecutionUnit、belief graph、workspace versions 建立引用关系。
- [ ] 为 wet-lab result artifact 定义 evidence summary schema：quality checks、supports、opposes、uncertain、limitations、recommendedNextActions。
- [ ] 在湿实验回传流程中加入 researcher decision record：`supported`、`not-supported`、`inconclusive`、`needs-repeat` 等状态由用户确认，并支持 revision status `supersede`、`retract`、`amend`、`reaffirm`。
- [ ] 设计分支时间线模型：`variantKind=parameter|method|hypothesis`、branchId、parentBranchId、sourceContractVersion、sourceBeliefId、mergeFrom、archivedAt、restoreReason；参数级变体不得默认创建 branch。
- [ ] 设计 decision revision sequence：currentDecisionRef 指向最新裁决，历史裁决保持只读归档，belief graph 更新通过 revision event 传播。
- [ ] 定义协作与权限最小模型：roles、visibility、audience、sensitiveDataFlags、exportPolicy、decisionAuthority。
- [ ] 更新导出逻辑的设计约束：导出 notebook/bundle/pipeline 前检查权限、敏感数据和外部分享范围。

### T021 Python-first 科学任务运行时与 AgentServer 自愈闭环

#### 目标说明
- 将 BioAgent 的科学任务执行层从 TypeScript 写死分支迁移为 workspace-local code artifact：优先由 AgentServer 生成/修改 Python 任务代码，BioAgent workspace service 负责执行、收集 artifact、渲染 UI，并在失败后把错误与用户反馈交还 AgentServer 自愈重试。

#### 成功标准
- TypeScript 只保留 UI、协议、workspace I/O、artifact registry、任务调度和兼容 fallback；文献、结构、组学、知识库等具体科学任务优先以 workspace Python 代码表达。
- 每次科学任务至少沉淀一个可复验任务代码 artifact、一个标准结果 artifact、一个执行日志和一个 ExecutionUnit；ExecutionUnit 记录代码路径、语言、依赖、输入、输出、失败/成功状态。
- 当任务失败或用户反馈指出结果不真实时，BioAgent 能把任务代码、日志、artifact schema、浏览器反馈交给 AgentServer，让 AgentServer 修改代码并重跑；重试次数、diff、失败原因都要写入 artifact/log。
- 允许为了性能或生态使用 R、C/C++、Rust、Julia、Shell、WASM 或其它语言，但必须由任务代码显式声明选择理由、环境和可复现入口；不能因为 Web UI 是 TypeScript 就把科学分析逻辑默认写进 TypeScript。
- 若 AgentServer 或本地环境无法完成任务，UI 必须展示明确原因和缺失条件，不得 fallback 到 demo/default/record-only 结果并标记为成功。

#### TODO
- [x] 定义并落地首批 workspace 任务目录引用：结构任务使用 `.bioagent/tasks/`、`.bioagent/task-inputs/`、`.bioagent/task-results/`、`.bioagent/logs/`、`.bioagent/structures/`，每次运行写出 task code、input JSON、output JSON、stdout/stderr 和坐标文件。
- [x] 定义并接入首批 Python-first ExecutionUnit 字段：`language`、`codeRef`、`entrypoint`、`inputs`、`outputs`、`stdoutRef`、`stderrRef`、`attempt`；动态结果区 ExecutionUnit 面板展示 code artifact 和日志引用。
- [x] 先迁移结构 Agent 的 RCSB/AlphaFold 任务：最新 PDB 搜索、坐标下载、mmCIF/PDB 解析、atomCoordinates 输出已放到 workspace Python task；TypeScript 只负责复制任务模板、执行 Python、读取标准结果 JSON。
- [ ] 补齐通用 task runner 抽象：将结构 Agent 当前的 Python runner 提炼为 profile 无关的 workspace runner，支持 Python/R/其它语言脚本、捕获日志、退出码、产物路径和数据指纹；不要把具体科学逻辑写进 runner。
- [ ] 接入 AgentServer 自愈协议：失败时把 prompt、codeRef、日志、artifact schema、用户反馈和 UI 状态发给 AgentServer，请其生成 patch 或新 attempt，再由 BioAgent 执行。
- [ ] 再迁移组学 Agent：将 Scanpy/DESeq2/edgeR 调用表达为 workspace task code，保留 Python/R 环境约定和真实 runner smoke。
- [ ] 更新动态结果区：展示 `taskCodeRef`、attempt history、自愈 diff 摘要、失败原因；没有真实 artifact 时保持 empty/failed state。
- [ ] 用 Computer Use 验证失败-反馈-自愈闭环：构造一个下载失败或 schema 缺字段场景，确认 AgentServer 能修改 task code 重跑并在右侧显示真实 artifact。

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
- T012 文献 Agent 结果区真实 `paper-list` 渲染：已通过 Safari Computer Use 验证 `TP53 tumor suppressor reviews` 由 BioAgent project tool 完成，右侧展示真实 PubMed paper cards、PubMed URL、`PubMed.eutils.esearch+esummary` ExecutionUnit。
- T013 结构 Agent 结果区真实 `structure-summary` 渲染：已通过 Safari Computer Use 验证 `PDB 7BZ5 residues 142-158` 返回 RCSB `.cif` dataRef、residue range、molecule viewer 和 `RCSB.core.entry` ExecutionUnit；无 artifact 时不再加载默认 7BZ5。
- T014 组学 Agent 结果区真实 omics artifact 渲染：已通过 Safari Computer Use 验证固定 CSV fixture 生成 `.bioagent/omics/...json`、`omics.local-csv-differential` ExecutionUnit，并驱动 volcano、heatmap、UMAP。
- T015 知识库 Agent 结果区真实 `knowledge-graph` 渲染：已通过 Safari Computer Use 验证 `TP53 gene` 返回 UniProt reviewed human entry `P04637`、3 个节点、2 条边和 `UniProt.uniprotkb.search` ExecutionUnit；demo drug/pathway fallback 已从动态表格/网络中移除。
- T016 ExecutionUnit 与结果区一致性检查：已建立 artifact 到 ExecutionUnit 的 resolver，结果区 source badge 展示 producing tool/status；缺引用时显示审计 warning。
- T017 Browser Smoke 四 Agent 动态结果区真实数据回归：已用 Safari 覆盖 Literature、Structure、Omics、Knowledge；记录见 `docs/ComputerUseSmoke.md`。
- T018 组学真实统计运行时接入：已定义 BioAgent workspace-local Python/R runtime 路径，接入 Scanpy `rank_genes_groups`、DESeq2、edgeR 三条真实 runner；artifact/log 记录 requested/effective runner、runtime availability、软件版本、统计模型、输入指纹、outputRef、logRef，失败时回退到 `omics.local-csv-differential`。用户确认安装后，已在 `/tmp/bioagent-results-smoke` 安装 workspace-local Scanpy 1.12.1、R 4.4.3、DESeq2 1.46.0、edgeR 4.4.0；direct smoke 覆盖三条 runner，Safari Computer Use 覆盖 Scanpy 与 edgeR 大矩阵动态结果区。
- T020 对齐工作台真实编辑与版本恢复：已将 Alignment Workspace 从静态卡片升级为可编辑表单；保存生成 `alignment-contract` artifact，workspace writer 会落盘到 `.bioagent/artifacts/` 和 `.bioagent/versions/`；版本列表支持恢复，研究时间线显示保存/恢复事件；Safari Computer Use 已完成保存、刷新恢复和版本恢复 smoke。
- T019 知识库真实数据源扩展：已定义 gene/protein/compound/disease/clinical-trial disambiguation；gene/protein 走 UniProt，compound 已接入真实 ChEMBL molecule search + mechanism + drug indication；未接入的 disease/clinical-trial 仍返回明确 unsupported artifact；`knowledge-graph` 节点/边补充 sourceRefs/supportingRefs；Safari Computer Use 已验证 `sotorasib compound ChEMBL` 返回 ChEMBL compound graph、4 nodes、3 edges、`ChEMBL.molecule.search+mechanism+indication` / `done`。
