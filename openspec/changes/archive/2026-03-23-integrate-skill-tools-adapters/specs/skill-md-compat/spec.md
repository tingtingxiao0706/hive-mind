# skill-md-compat Specification

## Purpose

完全兼容 Agent Skills 标准（agentskills.io/specification）的 SKILL.md 格式，通过 `x-hive` 命名空间添加 Hive-Mind 特有的扩展字段，支持技能目录结构自动发现。

> 模块: `src/loader/adapters/builtin.ts`, `src/loader/adapters/skill-tools.ts`, `src/loader/extensions.ts`, `src/types.ts` | 测试: `test/loader.test.ts` (5), `test/extensions.test.ts` (6), `test/integration.test.ts` | 状态: 已实现

## ADDED Requirements

### Requirement: @skill-tools/core 适配器
系统 SHALL 提供 SkillToolsParserAdapter 实现 SkillParser 接口，对接 @skill-tools/core（v0.2.2）的解析能力。

#### Scenario: auto 模式启用 @skill-tools/core
- **GIVEN** `parser: 'auto'` 配置且 `@skill-tools/core` 已安装
- **WHEN** 首次 ensureIndex() 或 resolveSkillContents() 触发 ensureAdapters()
- **THEN** 动态 import @skill-tools/core 并使用 SkillToolsParserAdapter 替换内置解析器

#### Scenario: auto 模式回退到内置解析器
- **GIVEN** `parser: 'auto'` 配置但 `@skill-tools/core` 未安装
- **WHEN** ensureAdapters() 尝试动态 import 失败
- **THEN** 输出 warn 日志，继续使用 BuiltinAdapter

#### Scenario: builtin 模式跳过 @skill-tools/core
- **GIVEN** `parser: 'builtin'`（默认值）
- **WHEN** 创建 HiveMind 实例
- **THEN** 始终使用 BuiltinAdapter，不尝试 import @skill-tools/core
