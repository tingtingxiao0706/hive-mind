# core-engine Specification

## Purpose

通过 `createHiveMind(config)` 工厂函数创建 HiveMind 实例，统一编排 SkillLoader、SkillRouter、Registry、ScriptExecutor 和 Vercel AI SDK，提供 `run`、`stream`、`list`、`search`、`install` 等公共 API。

> 模块: `src/engine.ts`, `src/index.ts`, `src/types.ts` | 测试: `test/integration.test.ts` (8 个用例) | 状态: 已实现

## Requirements

### Requirement: createHiveMind 工厂函数
系统 SHALL 通过 `createHiveMind(config)` 创建 `HiveMind` 实例，统一编排所有子系统。

#### Scenario: 最小配置创建实例
- **WHEN** 传入 `models.default` 和至少一个 `skills` 来源
- **THEN** 返回 `HiveMind` 实例，包含 `run`、`stream`、`list`、`search`、`install`、`runtimeStatus` 方法

#### Scenario: 完整配置创建实例
- **WHEN** 传入 models、skills、workspace、loading、scripts 全部配置
- **THEN** 实例按配置初始化所有子系统，scripts 启用时注入脚本工具

### Requirement: run() 单次技能调用
系统 SHALL 通过 `hive.run(options)` 执行单次 LLM 调用，支持自动路由或显式指定技能。

#### Scenario: 自动路由执行
- **WHEN** 调用 `run({ message })` 不指定 skills
- **THEN** 引擎执行 Phase 1 (扫描) → Phase 2 (路由匹配 Top-K) → Phase 3 (generateText)，返回 `{ text, activatedSkills, toolCalls, usage }`

#### Scenario: 显式指定技能
- **WHEN** 调用 `run({ message, skills: ['translator'] })`
- **THEN** 跳过路由，直接加载指定技能的完整内容注入 system prompt

#### Scenario: call_skill 工具注入
- **WHEN** 有多个技能被激活
- **THEN** 自动注入 `call_skill` 工具，支持技能间链式调用，附带深度限制 (`maxCallDepth`) 和去重缓存

### Requirement: stream() 流式输出
系统 SHALL 通过 `hive.stream(options)` 执行流式 LLM 调用。

#### Scenario: 流式响应
- **WHEN** 调用 `stream({ message })`
- **THEN** 返回 async iterable，逐块输出 LLM 响应文本

#### Scenario: 流式模式包含 call_skill
- **WHEN** 流式调用中有多个激活技能
- **THEN** `call_skill` 工具同样可用，与 `run()` 行为一致

### Requirement: list() / search() 技能查询
系统 SHALL 提供技能列表查询和关键词搜索能力。

#### Scenario: 列出所有技能
- **WHEN** 调用 `hive.list()`
- **THEN** 返回所有注册技能的 `SkillMeta[]`

#### Scenario: 搜索技能
- **WHEN** 调用 `hive.search('kubernetes')`
- **THEN** 通过路由器匹配返回相关技能列表

### Requirement: install() 技能安装
系统 SHALL 支持从远程源安装技能到本地。

#### Scenario: Git 仓库安装
- **WHEN** 调用 `hive.install('https://github.com/user/skill.git')`
- **THEN** 克隆仓库到本地缓存目录，技能可被后续 scan 发现

### Requirement: 公共 API 导出
库 SHALL 从 `src/index.ts` 统一导出所有公共类型和实现。

#### Scenario: 导出完整性
- **WHEN** 用户 `import { createHiveMind, SkillLoader, KeywordAdapter, ... } from '@ai-hivemind/core'`
- **THEN** 所有公共接口、类型、错误类、适配器实现均可正常导入

### Requirement: 双格式构建
库 SHALL 通过 tsup 同时输出 ESM 和 CJS 格式。

#### Scenario: ESM 消费
- **WHEN** 在 `type: "module"` 项目中 `import { createHiveMind } from '@ai-hivemind/core'`
- **THEN** 正常工作，无 `require()` 调用

#### Scenario: CJS 消费
- **WHEN** 在 CJS 项目中 `const { createHiveMind } = require('@ai-hivemind/core')`
- **THEN** 正常工作
