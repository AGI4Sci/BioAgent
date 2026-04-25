# BioAgent - PROJECT.md

最后更新：2026-04-22

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

---

## P0 - 当前阻塞
- 暂无当前阻塞。T025/T026/T027/T028/T029/T030/T031/T032/T021 均已按当前阶段成功标准收口；剩余内容仅保留为后续产品化或归档说明，不作为本轮阻塞。

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




## 归档摘要
- T001 Agent 对话 API：已完成 AgentServer run/stream 接入、错误处理、排队 follow-up、响应 normalize。
- T002 Computer Use 真实可用性探索：已完成首页、设置、workspace、Agent prompt、导出、Resource Explorer smoke；记录见 `docs/ComputerUseSmoke.md`。

