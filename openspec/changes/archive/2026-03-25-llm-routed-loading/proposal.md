## Why

当前引擎提供三种加载策略（eager / progressive / lazy），路由层统一由 `KeywordAdapter`（关键词匹配）或 `BM25Adapter` 完成技能选择。这种"代码路由"模式在技能描述质量不高或用户意图模糊时准确率有限——关键词/BM25 本质上是词袋模型，无法理解语义。

Cursor 等主流 Agent IDE 的实践表明：将技能元数据（name + description）注入 system prompt，让 LLM 自身判断该激活哪些技能，路由准确率显著优于基于关键词的匹配。同时，Cursor 的做法是让 LLM 拥有完整文件系统访问权，激活和执行都交给 LLM——这在嵌入式引擎场景下安全性不可接受。

本提案引入第四种加载策略 `"llm-routed"`，将 LLM 用作路由器（发现 + 路由），同时保留引擎对激活、执行、安全的全部控制权。

## What Changes

- **新增加载策略 `"llm-routed"`**：所有技能的 name + description 作为目录注入 system prompt，LLM 通过 `activate_skill` 工具选择需要的技能。
- **新增 `activate_skill` 工具**：LLM 调用此工具激活技能，引擎负责加载完整内容、安全校验、工具注入。激活后引擎发起**新一轮 LLM 调用**，携带技能 body 和技能工具。
- **`LoadingConfig` 扩展**：`strategy` 联合类型新增 `'llm-routed'`。
- **多轮执行机制**：`activate_skill` 返回后，引擎自动将激活技能的 body 追加到 system prompt 并重新调用 LLM（利用现有 `maxSteps` 多轮能力）。

## 非目标 (Non-goals)

- **不替代现有三种策略** — `llm-routed` 是新增选项，现有 eager / progressive / lazy 行为不变。
- **不改变安全模型** — `activate_skill` 仅控制技能选择，不授予 LLM 任意文件系统访问权。激活后的安全边界（scripts 执行、read_resource 路径校验）完全沿用现有三级安全模型。
- **不支持 LLM 动态发现新技能** — 技能目录在首次扫描时确定，LLM 只能从已知目录中选择。
- **不修改 SKILL.md 格式** — 技能作者无需做任何调整。

## Capabilities

### New Capabilities

- `llm-routing`: LLM 驱动的技能路由能力——技能目录注入 system prompt + `activate_skill` 工具 + 多轮激活执行。

### Modified Capabilities

- `progressive-loading`: `LoadingConfig.strategy` 联合类型扩展，`resolveSkillContents()` 新增 `llm-routed` 分支。
- `script-execution`: `buildToolsForSkills()` 需在 `activate_skill` 返回后动态追加技能工具。

## Impact

- **受影响代码**: `src/types.ts`、`src/engine.ts`、`src/index.ts`（导出）
- **对现有 97 个测试用例的影响**: 无破坏性影响。新策略是增量选项，默认策略仍为 `progressive`，现有行为完全不变。需新增测试用例覆盖 `llm-routed` 策略的完整流程。
- **API 变更**: `LoadingConfig.strategy` 联合类型新增 `'llm-routed'`，属于非破坏性扩展。
- **依赖变更**: 无新增依赖。`activate_skill` 工具复用 Vercel AI SDK 的 `tool()` 和 `z`（zod）。
