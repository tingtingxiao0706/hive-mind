# llm-routing Specification

## Purpose

当 `loading.strategy` 设为 `'llm-routed'` 时，引擎将所有已发现技能的元数据（name + description）注入 system prompt，由 LLM 自行判断需要哪些技能并通过 `activate_skill` 工具激活。

> 模块: `src/engine.ts`, `src/types.ts` | 测试: `test/engine.test.ts` | 状态: 已实现

## Requirements

### Requirement: 技能目录注入
系统 SHALL 在 `llm-routed` 模式下将技能目录注入 system prompt。

#### Scenario: 目录格式
- **GIVEN** `strategy === 'llm-routed'` 且 `ensureIndex()` 完成
- **WHEN** 构建 system prompt
- **THEN** 将 `SkillMeta[]` 格式化为文本列表追加到 system prompt，格式为：
  ```
  ## Available Skills
  你可以通过 activate_skill 工具激活以下技能。如果用户的请求不需要任何技能，直接回答即可。
  - {name}: {description}
  ```

#### Scenario: 仅注入元数据
- **WHEN** 注入技能目录
- **THEN** 仅注入 name 和 description，不注入 body / scripts / references

#### Scenario: catalogueTokenBudget 限制
- **GIVEN** 配置了 `loading.catalogueTokenBudget`
- **WHEN** 目录超出 token 预算
- **THEN** 截断目录并提示 LLM 目录不完整

### Requirement: activate_skill 工具
系统 SHALL 在 `llm-routed` 模式下注入 `activate_skill` 工具，供 LLM 按需激活技能。

#### Scenario: 正常激活
- **WHEN** LLM 调用 `activate_skill({ name, reason? })`，且 `name` 在 `skillIndex` 中存在
- **THEN** 调用 `loader.loadFull(skillPath)` 加载完整内容，将技能工具注册到待追加工具集，返回 `{ activated: true, name, description, instructions: skill.body }`

#### Scenario: 技能不存在
- **WHEN** `name` 不在 `skillIndex` 中
- **THEN** 返回 `{ error: 'Skill not found: {name}' }`

#### Scenario: 超过最大激活数
- **WHEN** 已激活技能数超过 `maxActivatedSkills`
- **THEN** 返回 `{ error: 'Max activated skills reached' }`

#### Scenario: 去重
- **WHEN** 同一技能重复激活
- **THEN** 直接返回缓存结果，不重复加载

### Requirement: 动态工具注入
系统 SHALL 利用 Vercel AI SDK 的 `onStepFinish` 回调实现动态工具注入。

#### Scenario: 工具追加
- **WHEN** step 中包含 `activate_skill` 工具调用
- **THEN** 在下一 step 的 tools 中追加该技能的工具

#### Scenario: system prompt 更新
- **WHEN** 技能激活后
- **THEN** 下一 step 的 system prompt 追加 `## Skill: {name}\n\n{body}`

#### Scenario: 多技能累积
- **WHEN** 多次 `activate_skill` 调用
- **THEN** 工具和 body 累积追加

### Requirement: 与现有工具的共存
系统 SHALL 保证 `activate_skill` 与 `call_skill` 在 `llm-routed` 模式下共存。

#### Scenario: call_skill 行为不变
- **WHEN** 在 `llm-routed` 模式下调用 `call_skill`
- **THEN** 仍按现有逻辑递归调用 `run()`

#### Scenario: 同名工具覆盖
- **WHEN** 多个技能定义了同名工具（如 `run_script`）
- **THEN** 后激活的覆盖先激活的（与现有 `Object.assign` 行为一致）
