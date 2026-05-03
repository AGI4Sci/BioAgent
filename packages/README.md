# SciForge Packages

该目录包含 SciForge 的可复用能力和运行时支持包。

在新增或修改 package 之前，请先遵循集成标准：
[`docs/CapabilityIntegrationStandard.md`](../docs/CapabilityIntegrationStandard.md)。

这份标准定义了 `senses`、`ui-components`、`skills`、`tools` 以及其它能力应该如何暴露给 agent，避免 agent 因可用能力过多而分散注意力，同时保留灵活选择能力的空间。

## Package 边界

- `skills`：agent 可选择的工作策略。
- `tools`：skill 可以调用的执行资源。
- `senses`：把非文本或外部状态转成紧凑信号的模态 adapter。
- `ui-components`：artifact renderer 和交互界面。
- `runtime-contract`：运行时共享契约。
- `scenario-core`：scenario 编译与校验基础能力。
- `design-system`：可复用 UI primitives 和 tokens。
- `artifact-preview`：artifact 预览辅助能力。
- `object-references`：object reference 辅助能力。

## 集成原则

使用能保证可靠性的最低集成等级：

- 大多数新 skills 和简单 tools 使用 Markdown-first package。
- 常用 tools 和稳定可复用执行资源使用 schema adapter。
- 关键 senses、安全敏感动作、长时间 workflow 或高成本能力使用 native runtime adapter。

agent 应先接收紧凑的 capability brief，然后只懒加载被选中 package 的详细契约或 `SKILL.md`。
