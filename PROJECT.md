# BioAgent - PROJECT.md

最后更新：2026-04-25

## 使用约定
- 本文档作为 BioAgent 工程任务板使用，正文只保留正在推进或待推进的任务；已完成任务压缩到归档摘要。
- 产品与架构基准见 `docs/BioAgent_Project_Document.md`。
- 当前 Web UI 位于 `ui/`，本项目服务运行在 `http://localhost:5173/`；本地 workspace writer 运行在 `http://127.0.0.1:5174/`。
- AgentServer 是项目无关的通用“大脑”和 fallback backend；BioAgent 不应维护一个写死工具清单，而应优先通过 skill registry、workspace-local task code 和 AgentServer 动态探索/写代码来解决用户请求。
- 如果确实定位到 AgentServer 通用能力缺口，可以修改 `/Applications/workspace/ailab/research/app/AgentServer`；修改必须泛化到协议、配置、通用工具连接、网络环境或 backend 能力层，并在对应 TODO 标明影响的 API / backend / tool 约定。
- 语言边界必须显式：TypeScript 主要用于 Web UI、workspace writer、artifact/session 协议、组件 registry 和轻量编排壳；科学任务执行代码优先生成到 workspace 内的 Python 脚本 / notebook / package 中，并作为 artifact 的一部分沉淀。只有在性能、生态或既有科学工具要求时，才使用 R、C/C++、Rust、Julia、Shell、WASM 或其它语言；选择非 Python 语言必须在 ExecutionUnit 中记录原因、环境和可复现入口。
- BioAgent 不应把具体科学任务长期写死在 TypeScript backend 分支里。workspace runtime 只能作为通用能力原语和任务引导器；真实任务应尽量表现为 workspace-local code artifact，例如 `.bioagent/tasks/*.py`、`.bioagent/tasks/*.ipynb`、`.bioagent/tasks/*.R`，并输出标准 artifact JSON、日志和 ExecutionUnit。
- 研究时间线是一等公民：它是研究记忆、分支探索历史、belief dependency graph 的时间投影，也是未来研究编排层的状态基底。
- 代码路径必须尽量保持唯一真相源：引入新链路或发现冗余时必须删除、合并或明确降级旧链路，避免两个并行逻辑长期共存。

## 当前状态
- 已有 React + Vite Web UI，包含研究概览、Scenario 工作台、对齐工作台、研究时间线。
- 可组合 Scenario Package 方案已落地：Element Registry、Scenario/Skill/UI Compiler、Validation Gate、workspace package API、Scenario Builder、Scenario Library、versioned runs 与 promotion workflow 均已完成。
- 发布后的场景绑定 package/version、SkillPlan、UIPlan 和 runtime route decision；失败状态进入 validation/report/smoke，而不是静默降级为 demo success。

---

## P0 - 当前阻塞
- 暂无 P0 阻塞。
- 当前阶段已完成从“内置 Scenario preset + runtime override”到可组合、可编译、可发布 Scenario Package 系统的迁移。
- 下一阶段进入产品化硬化：端到端浏览器 smoke、workspace scenario 原生路由、更细的 code splitting、`3dmol` 依赖 eval/chunk 警告治理、Scenario Package 发布质量门与运维可观测性。

### T033 Scenario-first 产品形态收口

#### 目标说明
- 删除“不同 Agent 页面”作为产品主抽象，改为统一 Scenario workbench。ScenarioSpec 是一等公民；内置四个 preset 只是默认场景，不是页面分叉。

#### 成功标准
- 前端协议、工作台入口、session state、dashboard 文案都以 Scenario 为主语。
- `src/ui/src/scenarioSpecs.ts` 是前端场景契约唯一入口，声明 `skillDomain`、input/output artifact schema、scope declaration、default UIManifest slots 和 component policy。
- LLM/AgentServer prompt 只允许生成结构化 artifact、ExecutionUnit、claims 和 UIManifest；UI 不执行生成代码。
- workspace runtime 接收 `scenarioId + skillDomain`，skillDomain 只作为内部 skill matching 维度。
- README 与产品设计文档明确最终链路：`scenario.md -> ScenarioSpec -> skill/runtime -> artifact -> UIManifest -> component registry`。

#### TODO
- [x] 建立 `ScenarioSpec` 作为前端场景契约唯一入口。
- [x] 将 UI 状态和 session 主键改为 `ScenarioId` / `sessionsByScenario`。
- [x] 将 dashboard 与 workbench 文案切换为 Scenario preset / ScenarioSpec。
- [x] 将 workspace runtime 请求切换为 `scenarioId` + `skillDomain`。
- [x] 更新 README、PROJECT 和设计文档。


### T034 Element Registry 与 Manifest 基础设施

#### 目标说明
- 把 skills、tools、artifact schemas、UI components、view presets、role policies、failure policies 从散落代码升级为可枚举、可校验、可组合的 element manifests。
- Element Registry 是 Scenario/Skill/UI 编译器的共同输入，不能只服务前端展示。

#### 成功标准
- 新增统一 manifest 类型定义，覆盖 `SkillElement`、`ToolElement`、`ArtifactSchemaElement`、`UIComponentElement`、`ViewPresetElement`、`RolePolicyElement`、`FailurePolicyElement`。
- 内置四个 Scenario 的现有能力能从 registry 反推出等价组件集合，而不是只能读 `SCENARIO_SPECS` 硬编码。
- seed skills、installed SCP markdown skills、React component registry、artifact schemas 至少各有一个 adapter 进入 Element Registry。
- manifest 包含最小 validation 字段：id、version、description、inputs/outputs、producer/consumer 关系、fallback、capability requirements。
- 添加 smoke/test：registry 能列出内置 elements，且 id 唯一、引用存在、fallback 存在。

#### TODO
- [x] 定义 `src/ui/src/scenarioCompiler/elementTypes.ts` 或共享 runtime 类型。
- [x] 将 `SCENARIO_SPECS.outputArtifacts` 抽成 `ArtifactSchemaElement` catalog。
- [x] 将 UI 组件 registry 补充为 `UIComponentElement` manifest，声明 `acceptsArtifactTypes`、`requiredFields`、`viewParams`、`fallback`。
- [x] 将 seed skill manifests 与 `scpSkillCatalog` 转为 `SkillElement` adapter。
- [x] 增加 registry validation 测试，防止 orphan component、orphan artifact、重复 id。

### T035 ScenarioIR 与 Scenario Package 数据模型

#### 目标说明
- 引入可发布 Scenario Package，不再把用户自定义场景只作为内置 Scenario 的 runtime override。
- Scenario Package 应能保存到 workspace，包含 `scenario.json`、`skill-plan.json`、`ui-plan.json`、`tests.json`、`versions.json`。

#### 成功标准
- 定义 `ScenarioIR`、`ScenarioPackage`、`ScenarioPackageVersion`、`ScenarioPublishStatus` 类型。
- workspace writer 支持保存、读取、列出、归档 `.bioagent/scenarios/<scenario-id>/`。
- 内置四个 Scenario 可作为官方 precompiled package catalog 暴露，默认不导入 workspace；用户可按需导入、导出，导入后再以 workspace scenario 打开运行。
- URL 或 app state 可打开 workspace scenario package，而不是只能打开固定 `ScenarioId` union。
- 旧 session 能记录 `scenarioPackageRef` / `scenarioVersion`，保证后续复现。

#### TODO
- [x] 放宽前端 `ScenarioId` 使用边界：内置 id 保留，workspace scenario 使用 string id。
- [x] 新增 workspace API：`/api/bioagent/scenarios/list|get|save|publish|archive`。
- [x] 新增 package 文件结构写入逻辑与 schema validation。
- [x] 为内置 presets 生成 compatibility adapter，避免一次性重写所有 UI。
- [x] 更新 session/domain 类型，记录 scenario package/version。

### T036 Scenario Compiler：需求描述到可发布场景契约

#### 目标说明
- 用户可以描述研究服务目标，系统自动推荐或手动选择 elements，编译为 `ScenarioIR` 和 Scenario Package 草案。
- 编译器只生成契约，不直接执行科学任务。

#### 成功标准
- 支持手动模式：用户选择 skills/tools/artifact schemas/UI components/scope policies，实时预览 ScenarioIR。
- 支持自动模式：基于用户描述做 heuristic/AgentServer recommendation，输出推荐 elements 和理由。
- 编译产物包含目标、输入契约、输出 artifact schema、scope declaration、role views、权限边界和失败边界。
- 编译器能从四个内置场景描述重建等价 ScenarioIR。
- 编译失败时返回缺失元素、冲突元素、需要用户确认的问题。

#### TODO
- [x] 将当前 `inferScenarioDraft` 从 `App.tsx` 抽出，升级为 `compileScenarioDraft()`。
- [x] 实现手动 element selection 到 ScenarioIR 的纯函数。
- [x] 实现基于关键词/manifest metadata 的自动推荐第一版。
- [x] 预留 AgentServer recommendation API，但保持无 AgentServer 时可用。
- [x] 添加编译错误模型：missing producer、ambiguous skill、unsupported artifact、unsafe policy。

### T037 Skill Compiler 与 Capability Profile

#### 目标说明
- 按 SkVM 启发，把 skill 从 prompt/markdown/脚本清单升级为 `SkillIR / SkillPlan`，并根据 runtime/model/harness capability profile 做稳定调度。

#### 成功标准
- 定义 `SkillIR`，包含 intent、inputs、requiredCapabilities、executionGraph、artifactOutputs、uiContracts、failureModes。
- 定义 `CapabilityProfile`，至少覆盖 `workspace-python`、`agentserver-codex`、`agentserver-native`、`scp-hub`、`seed-skill`。
- Skill Compiler 可为 seed skill 与 installed SCP skill 生成初版 SkillPlan。
- Runtime 选择路径遵循稳定优先级：validated seed skill -> installed workspace skill -> compiled reusable task -> AgentServer generated task -> explicit unsupported。
- 运行记录写入实际使用的 profile、plan id、fallback reason。

#### TODO
- [x] 新增 `src/runtime/capability-profiles.ts`。
- [x] 扩展 skill manifest 类型，加入 requiredCapabilities、failureModes、artifactOutputs。
- [x] 实现 seed skills 到 SkillIR 的 adapter。
- [x] 实现 SCP markdown skill 到 SkillIR 的 coarse adapter。
- [x] 在 `workspace-runtime-gateway.ts` 中记录 skill plan 与 runtime route。
- [x] 增加 smoke：AgentServer 未运行时，seed skill 仍稳定运行；无 producer 时返回 unsupported。

### T038 UI Compiler 与 UIPlan

#### 目标说明
- UI 也要编译，但常规产物是 `UIPlan / UIManifest`，不是生成 React 代码。
- UI Compiler 负责把 artifact schema、component manifest、role view、view composition 编译为稳定展示计划。

#### 成功标准
- 定义 `UIPlan`，覆盖 slots、layout、interactions、roleVisibility、fallbacks、empty states。
- UI Compiler 能根据 artifact schema 自动选择 specialized component，否则按 fallback ladder 降级。
- 每个 UI slot 都有可验证 producer/consumer 关系；没有匹配组件时必须落到 inspector 或 empty state with reason。
- 内置四个 Scenario 的默认 UIManifest 能由 UI Compiler 生成。
- 角色视图能影响默认可见组件和排序，但不改变底层 artifact。

#### TODO
- [x] 定义 `UIPlan` 与 `UIComponentElement` 互操作类型。
- [x] 实现 artifact type -> component selection。
- [x] 实现 fallback ladder：specialized -> generic visualization -> data-table -> inspector -> empty state。
- [x] 将现有 `defaultSlotsForAgent()` 改为读取 compiled UIPlan。
- [x] 增加 UI compiler tests：字段缺失、未知 artifact、角色视图排序、fallback 存在。

### T039 Validation Gate 与发布前 Smoke

#### 目标说明
- 动态组合必须在发布前收敛为可验证 contract。Validation Gate 是稳定运行的硬边界。

#### 成功标准
- 发布 Scenario Package 前必须通过 validation report。
- 检查 input contract、required artifact producer、UI consumer、skill runtime profile、fallback、failure policy、smoke test。
- Validation report 可在 UI 中展示，并区分 blocking errors、warnings、publish notes。
- 支持最小 smoke：用示例输入跑通至少一条成功路径，或确认只允许发布为 draft。
- 失败状态标准化为 `failed-with-reason`，含 `requiredInputs` 和 `recoverActions`。

#### TODO
- [x] 定义 `ValidationReport` 类型。
- [x] 实现静态 validation：schema/ref/fallback/profile。
- [x] 实现 runtime smoke hook：可选执行 workspace seed skill 或 dry-run。
- [x] UI 增加 validation panel，发布按钮受 blocking errors 控制。
- [x] 将 validation report 保存进 Scenario Package。

### T040 Scenario Builder / Compiler UI

#### 目标说明
- 将当前“场景设置”面板升级为 Scenario Builder：用户描述需求、选择 elements、预览 contract、运行 validation、发布稳定场景页面。

#### 成功标准
- Builder 第一屏不是营销页，而是实际工作台内的可用编译器。
- 支持描述框、自动推荐按钮、element tabs、contract preview、validation report、publish action。
- 编译后的 Scenario 可直接进入同一个 workbench 运行。
- UI 不引入每个场景独立页面模板；所有场景复用 Workbench + ResultsRenderer。
- 支持 draft/published/archived 状态展示。

#### TODO
- [x] 新增 `ScenarioBuilderPanel`，替换或扩展 `ScenarioSettingsPanel`。
- [x] 添加 element selector：skills、tools、artifacts、UI components、policies。
- [x] 添加 ScenarioIR / SkillPlan / UIPlan JSON preview。
- [x] 添加 publish flow，写入 workspace `.bioagent/scenarios`。
- [x] 允许从 dashboard / sidebar 打开已发布 workspace scenarios。

### T041 Stable Runtime Router 与 Versioned Runs

#### 目标说明
- 运行时按发布版本执行，任何 run 都能知道自己使用了哪个 Scenario Package、SkillPlan、UIPlan、CapabilityProfile。

#### 成功标准
- `sendBioAgentToolMessage` 和 workspace runtime 请求包含 scenario package/version refs。
- Runtime Router 根据 SkillPlan 和 capability profile 选择执行路径。
- run/session/artifact/executionUnit 记录 contract refs 和 route decision。
- 旧版本 Scenario 的历史 run 不受新版本修改影响。
- AgentServer 只作为生成/修复/泛化后端，不吞掉确定性 seed skill 路径。

#### TODO
- [x] 扩展前端 request payload，携带 scenarioPackageRef/version。
- [x] 扩展 runtime `GatewayRequest` 与 task attempt history。
- [x] 引入 route decision log：selectedSkill、selectedRuntime、fallbackReason。
- [x] 确保 artifact `producerScenario` 支持 workspace scenario id。
- [x] 增加 smoke：同一 scenario 两个版本分别运行并保留 version ref。

### T042 Versioned Artifact Store 与 Scenario Library

#### 目标说明
- 把成功场景、任务、UI 组合沉淀为可复用资产，支持个人、团队、官方 verified 的 library/marketplace 形态。

#### 成功标准
- workspace 中可列出 Scenario Packages、versions、validation reports、run history。
- 高频成功 task 可以被标记为 reusable task / skill candidate。
- 高频 UIPlan 可以被标记为 view preset candidate。
- Scenario Library 能区分 built-in、workspace、team、marketplace、archived。
- 导出 bundle 时包含 scenario package、plans、artifacts、executionUnits、timeline refs。

#### TODO
- [x] 新增 scenario library state 与 workspace list API。
- [x] 添加 reusable task / skill candidate 标记数据结构。
- [x] 添加 view preset candidate 数据结构。
- [x] 更新 export policy，纳入 scenario package 和 plan refs。
- [x] UI 增加 library/list 视图，至少支持打开、复制、归档。

### T043 实施顺序与迁移检查

#### 目标说明
- 确保新方案不会一次性打碎现有四个场景。采用 compatibility adapter 迁移：先让内置 Scenario 以 package 形式运行，再开放用户自定义编译。

#### 成功标准
- 每一步都有独立 smoke/test，不依赖后续大重构。
- 现有四个内置场景在迁移过程中始终可用。
- 旧 localStorage/session/workspace snapshots 有兼容读取路径。
- 文档与 UI 文案不再承诺“每个场景一个模板”，而是“编译发布的研究服务”。

#### TODO
- [x] Phase A：manifest registry + validation-only，不改变现有 runtime。
- [x] Phase B：内置 Scenario 导出为 package，workbench 仍按旧入口打开。
- [x] Phase C：UIPlan 接管 defaultSlots，ResultsRenderer 不感知来源。
- [x] Phase D：SkillPlan 接管 runtime route，保留 seed skill 兼容。
- [x] Phase E：开放 Scenario Builder 发布 workspace scenarios。
- [x] Phase F：引入 versioned runs、library 和 promotion workflow。

### T044 浏览器端到端 Smoke 与可视回归

#### 目标说明
- 用真实浏览器覆盖从自然语言描述、Scenario Builder 编译、保存/发布、打开 workspace scenario、运行 dry-run validation 到查看结果面板的主路径。

#### 成功标准
- Playwright 或等价浏览器 smoke 能启动 UI 与 workspace writer，并在无 AgentServer 情况下完成核心流程。
- 覆盖桌面与移动宽度，确认 Scenario Builder、Library、Workbench、ResultsRenderer 不出现文本重叠或不可点击控件。
- 截图 artifact 可保存到 `docs/` 或 `.bioagent/test-artifacts/`，便于回归对比。
- 失败时输出明确的页面、selector、截图路径和 console/network 错误。

#### TODO
- [x] 新增浏览器 smoke 脚本：启动 `npm run dev` 或拆分启动 UI/workspace writer。
- [x] 覆盖 Builder：输入需求、选择 elements、查看 JSON preview、validation panel。
- [x] 覆盖 publish flow：保存 draft、发布、刷新 library list。
- [x] 覆盖打开 workspace scenario：从 library 打开并进入 workbench。
- [x] 添加桌面/移动截图断言，检查关键文本不溢出、不遮挡。
- [x] 将浏览器 smoke 接入 `npm run verify` 的可选或 CI-friendly 脚本。

### T045 Workspace Scenario 原生路由

#### 目标说明
- 当前 workspace scenario 通过 compatibility adapter 映射到内置 workbench。下一步让 workspace scenario 拥有原生 URL/app state/session key，同时仍可复用 Workbench + ResultsRenderer。

#### 成功标准
- `scenarioId` app state 支持内置 id 与 workspace package id，不再强制映射为四个内置 id。
- session、draft、scroll、archive、handoff、run history 可以按 workspace scenario id 独立保存。
- 内置 scenario 和 workspace scenario 共用渲染路径；内置 `ScenarioId` 仅作为 built-in contract key。
- 旧 localStorage/session 能迁移，不丢失四个内置场景历史。

#### TODO
- [x] 引入 `BuiltInScenarioId` 与 `ScenarioInstanceId` 的明确命名边界。
- [x] 将 `sessionsByScenario`、drafts、scroll state、archive state 改为 `Record<ScenarioInstanceId, ...>`。
- [x] 为 workspace scenario 加载 `ScenarioPackage` 后生成 runtime workbench descriptor。
- [x] 更新 handoff：workspace scenario artifact 可回到 package-defined handoff targets 或 fallback route。
- [x] 增加 session migration test：旧四场景 localStorage 与新 workspace scenario key 同时可读。
- [x] 增加 smoke：打开两个同 skillDomain 的 workspace scenarios，session/history 不串线。

### T046 Build Performance 与 Code Splitting

#### 目标说明
- 解决当前 Vite build 的超大 chunk 警告，降低首屏 bundle，给未来复杂可视化组件和 Builder 面板留增长空间。

#### 成功标准
- 主 JS chunk 低于约 500KB minified，或有明确可接受的 chunk budget 与 documented exception。
- 3D/omics/graph 等重型可视化按需加载，不阻塞 dashboard 与 Builder 首屏。
- build 输出可解释：核心 app、visualizations、3dmol、charts、scenario compiler 分包清晰。

#### TODO
- [x] 分析 `vite build` chunk composition，记录主要体积来源。
- [x] 对 `3dmol`、Recharts-heavy pages、visualizations 做 dynamic import 或 lazy boundary。
- [x] 给 ResultsRenderer 的重型组件加 loading/empty state，避免懒加载期间布局跳动。
- [x] 配置 chunk naming 与 size budget，保留明确 warning 门槛。
- [x] 增加 build smoke：构建后检查关键 chunk 存在且首屏 chunk 未超 budget。

### T047 3Dmol / 依赖安全警告治理

#### 目标说明
- 当前构建有 `3dmol` direct eval 警告。需要决定是隔离、替换、懒加载还是接受并记录风险，避免发布时安全边界不清。

#### 成功标准
- `3dmol` 只在结构 viewer 需要时加载，且不会进入非结构场景首屏。
- 安全说明记录 direct eval 来源、影响范围、sandbox/usage 边界和可替代方案。
- 若保留依赖，构建警告有 documented exception；若替换，结构 viewer 仍可用。

#### TODO
- [x] 验证 direct eval 是否仅来自 `node_modules/3dmol/build/3Dmol.js`。
- [x] 将 MoleculeViewer 的 3Dmol import 改为按需加载或隔离 wrapper。
- [x] 增加结构场景 browser smoke：viewer 非空、无全局崩溃、fallback 可用。
- [x] 编写 `docs/DependencyRiskRegister.md`，记录 3Dmol eval 与 chunk 警告处理策略。
- [x] 评估 Mol* 或 iframe/sandbox viewer 替代路线，并记录 tradeoff。

### T048 Scenario Package 发布质量门

#### 目标说明
- 发布动作不只依赖静态 validation，还要有 package-level quality gate：版本、兼容性、smoke、风险、导出策略全部明确。

#### 成功标准
- 发布前必须生成 quality report，包含 validation、runtime smoke、export policy、dependency warnings、version diff。
- blocking / warning / note 分类清楚，UI 中发布按钮只被 blocking errors 阻断。
- 同一 package 新版本能看到 contract diff，避免误发布破坏性变更。

#### TODO
- [x] 定义 `ScenarioQualityReport` 类型，合并 validation report、runtime smoke、export policy 和 version diff。
- [x] 实现 package diff：input contract、output artifacts、SkillPlan、UIPlan、failure policies。
- [x] Builder UI 增加 quality gate summary，显示 blocking/warning/note。
- [x] 发布 API 保存 `quality-report.json`。
- [x] 增加 smoke：带 blocking error 的 package 只能保存 draft，不能 publish。

### T049 Runtime Observability 与诊断面板

#### 目标说明
- 让用户和开发者能快速知道一次 run 为什么选择某个 skill/runtime，失败如何恢复，相关日志和 artifact 在哪里。

#### 成功标准
- Workbench 中可查看 route decision、runtimeProfileId、selectedSkill、fallbackReason、attempt history。
- task attempts、logs、validation report、quality report 可以从 UI 串起来。
- AgentServer 不可用、workspace writer 不可用、seed skill 缺输入等错误展示为可操作诊断。

#### TODO
- [x] 新增 Runtime Diagnostics panel 或扩展 ExecutionUnit table。
- [x] workspace writer 增加 task-attempts list/get API。
- [x] 前端可按 run id / package ref 查询 attempts 与 logs。
- [x] 错误消息标准化：requiredInputs、recoverActions、nextStep。
- [x] 增加 smoke：模拟 AgentServer 不可用，UI 展示 fallback/repair-needed 诊断。

### T050 文档、演示数据与发布包整理

#### 目标说明
- 把新 Scenario Package 系统整理成可交付材料：设计文档、用户流程、开发者扩展指南、示例 workspace package。

#### 成功标准
- 设计文档与 PROJECT.md 一致，不再描述旧的“每场景一个聊天模板”方案。
- 有一个最小 workspace scenario package 示例，可作为回归 fixture 和用户参考。
- README 或 docs 中说明如何启动、编译、发布、运行和诊断 scenario。

#### TODO
- [x] 更新 `docs/BioAgent_Project_Document.md` 的 implementation status 与 next phase。
- [x] 新增 `docs/ScenarioPackageAuthoring.md`：elements、compiler、validation、publish flow。
- [x] 新增 example workspace scenario fixture，覆盖 `scenario.json`、`skill-plan.json`、`ui-plan.json`、`tests.json`。
- [x] README 增加 Scenario Builder / Library 使用说明。
- [x] 增加文档一致性 smoke：关键文件存在、示例 package 可被 workspace API 读取。



## 归档摘要
- T001 Agent 对话 API：已完成 AgentServer run/stream 接入、错误处理、排队 follow-up、响应 normalize。
- T002 Computer Use 真实可用性探索：已完成首页、设置、workspace、Agent prompt、导出、Resource Explorer smoke；记录见 `docs/ComputerUseSmoke.md`。
