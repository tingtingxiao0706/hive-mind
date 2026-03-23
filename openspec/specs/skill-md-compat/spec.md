# skill-md-compat Specification

## Purpose

完全兼容 Agent Skills 标准（agentskills.io/specification）的 SKILL.md 格式，通过 `x-hive` 命名空间添加 Hive-Mind 特有的扩展字段，支持技能目录结构自动发现。

> 模块: `src/loader/adapters/builtin.ts`, `src/loader/extensions.ts`, `src/types.ts` | 测试: `test/loader.test.ts` (5), `test/extensions.test.ts` (6) | 状态: 已实现

## Requirements

### Requirement: SKILL.md 标准兼容
系统 SHALL 完全兼容 Agent Skills 标准的 frontmatter 格式。

#### Scenario: 标准字段解析
- **WHEN** SKILL.md 包含标准 frontmatter 字段（name, description, compatibility, allowed-tools, metadata）
- **THEN** BuiltinAdapter 正确解析所有字段到 `SkillMeta`

#### Scenario: metadata.tags 提取
- **WHEN** frontmatter 包含 `metadata.tags: [翻译, 英文]`
- **THEN** tags 被提取到 `SkillMeta.tags`，参与路由匹配

#### Scenario: allowed-tools 解析
- **WHEN** frontmatter 包含 `allowed-tools: Bash(scripts/run.sh) Bash(scripts/lint.py)`
- **THEN** 解析为脚本路径白名单，用于安全校验

### Requirement: x-hive 扩展命名空间
系统 SHALL 通过 `x-hive` 前缀支持 Hive-Mind 特有的扩展字段。

#### Scenario: 完整 x-hive 解析
- **WHEN** frontmatter 包含 `x-hive:` 块（agent, maxSteps, scripts, models, workspace）
- **THEN** `parseXHive()` 正确解析为 `XHiveConfig` 类型

#### Scenario: 部分 x-hive 配置
- **WHEN** frontmatter 仅包含部分 x-hive 字段
- **THEN** 未声明的字段使用默认值

#### Scenario: 无 x-hive 字段
- **WHEN** SKILL.md 不包含 x-hive 块
- **THEN** `xHive` 为 undefined，技能按普通模式运行

#### Scenario: agent 声明
- **WHEN** `x-hive.agent: true`
- **THEN** 技能被标记为 Agent 技能，启用多步执行循环

#### Scenario: scripts 配置
- **WHEN** `x-hive.scripts: { approval: true, timeout: 60000, runtimes: [bash, python] }`
- **THEN** 脚本执行使用指定的审批策略、超时和运行时

#### Scenario: models 偏好
- **WHEN** `x-hive.models: { preferred: reasoning, fallback: default }`
- **THEN** 引擎优先使用 reasoning 模型，不可用时回退

### Requirement: SkillParser 适配器模式
系统 SHALL 提供 SkillParser 抽象接口，支持替换解析实现。

#### Scenario: BuiltinAdapter 默认使用
- **WHEN** 不配置 parser 或配置为默认
- **THEN** 使用基于 gray-matter 的 BuiltinAdapter

#### Scenario: 预留 @skill-tools 适配器
- **WHEN** 配置 `parser: 'auto'`（预留）
- **THEN** 可切换到 @skill-tools/core 适配器

### Requirement: 技能目录结构发现
系统 SHALL 在加载技能时自动发现 scripts/、references/、assets/ 子目录。

#### Scenario: scripts 目录
- **WHEN** 技能目录包含 `scripts/` 子目录
- **THEN** 列出所有脚本文件，包含路径和推断的运行时类型

#### Scenario: references 目录
- **WHEN** 技能目录包含 `references/` 子目录
- **THEN** 文件路径记录在 `SkillContent.references`，可通过 `read_resource` 按需读取

#### Scenario: assets 目录
- **WHEN** 技能目录包含 `assets/` 子目录
- **THEN** 文件路径记录在 `SkillContent.assets`
