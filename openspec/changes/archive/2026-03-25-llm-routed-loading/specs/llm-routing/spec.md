# llm-routing — LLM 驱动的技能路由

## 概述

新增能力。当 `loading.strategy` 设为 `'llm-routed'` 时，引擎将所有已发现技能的元数据（name + description）注入 system prompt，由 LLM 自行判断需要哪些技能并通过 `activate_skill` 工具激活。

## 受影响模块

- `src/types.ts` — `LoadingConfig.strategy` 联合类型扩展
- `src/engine.ts` — 新增 `llm-routed` 策略分支、`activate_skill` 工具构建、动态工具注入

## 需求

### REQ-1: 技能目录注入

- **触发条件**: `strategy === 'llm-routed'` 且 `ensureIndex()` 完成
- **行为**: 将 `SkillMeta[]` 格式化为文本列表，追加到 system prompt
- **格式**:
  ```
  ## Available Skills
  你可以通过 activate_skill 工具激活以下技能。如果用户的请求不需要任何技能，直接回答即可。
  - {name}: {description}
  - {name}: {description}
  ...
  ```
- **约束**: 仅注入 name 和 description，不注入 body / scripts / references
- **可选**: `loading.catalogueTokenBudget` 限制目录最大 token 数，超出时截断并提示 LLM 目录不完整

### REQ-2: activate_skill 工具

- **注入条件**: `strategy === 'llm-routed'`
- **工具签名**:
  ```typescript
  activate_skill({
    name: string,     // 技能名称（必须在目录中存在）
    reason?: string,  // 激活原因（可选，用于日志追踪）
  })
  ```
- **执行流程**:
  1. 验证 `name` 在 `skillIndex` 中存在，不存在返回 `{ error: 'Skill not found: {name}' }`
  2. 检查已激活技能数是否超过 `maxActivatedSkills`，超过返回 `{ error: 'Max activated skills reached' }`
  3. 调用 `loader.loadFull(skillPath)` 加载完整内容
  4. 将技能工具（run_script / read_resource / list_skill_files）注册到待追加工具集
  5. 返回 `{ activated: true, name, description, instructions: skill.body }`
- **去重**: 同一技能重复激活时直接返回缓存结果，不重复加载

### REQ-3: 动态工具注入

- **机制**: 利用 Vercel AI SDK `generateText` / `streamText` 的 `onStepFinish` 回调
- **行为**: 当 step 中包含 `activate_skill` 工具调用时，在下一 step 的 tools 中追加该技能的工具
- **system prompt 更新**: 下一 step 的 system prompt 追加 `## Skill: {name}\n\n{body}`
- **累积**: 多次 `activate_skill` 调用的工具和 body 累积追加

### REQ-4: 与现有工具的共存

- `activate_skill` 与 `call_skill` 共存于 tools 中
- `call_skill` 的行为不变——即使在 `llm-routed` 模式下，`call_skill` 仍按现有逻辑递归调用 `run()`
- 激活技能后注入的 `run_script` / `read_resource` 等工具名可能与其他技能冲突 → 复用现有的技能前缀化机制（如有），或在 `createSkillTools` 中处理

## 新增依赖

无。
