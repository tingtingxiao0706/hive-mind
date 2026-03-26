# core-engine Specification

## Purpose

通过 `createHiveMind(config)` 工厂函数创建 HiveMind 实例，统一编排 SkillLoader、SkillRouter、Registry、ScriptExecutor、McpClientManager 和 Vercel AI SDK，提供 `run`、`stream`、`list`、`search`、`install`、`dispose` 等公共 API。

> 模块: `src/engine.ts`, `src/index.ts`, `src/types.ts` | 测试: `test/integration.test.ts`, `test/mcp-client.test.ts` | 状态: 已实现

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

### Requirement: HiveMindConfig 新增 mcp 字段

系统 SHALL 在 `HiveMindConfig` 中新增可选的 `mcp` 字段，用于配置 MCP Server 列表。

#### Scenario: 带 MCP 配置创建实例

- **WHEN** 传入 `mcp: { servers: [{ name: 'fs', transport: { type: 'stdio', command: 'npx', args: [...] } }] }`
- **THEN** 系统创建 `McpClientManager` 实例，首次 `run()` 时惰性建立连接

#### Scenario: 不带 MCP 配置

- **WHEN** 未传入 `mcp` 字段
- **THEN** 不创建 `McpClientManager`，行为与现有实现完全一致

### Requirement: 工具注入管线扩展

系统 SHALL 在 Phase 3 工具合并点注入 MCP 工具，与 scriptTools、callSkillTool 并列。

#### Scenario: MCP 工具并列注入

- **GIVEN** MCP Server 已连接，提供 `read_file` 和 `write_file` 两个工具
- **WHEN** 进入 Phase 3 执行
- **THEN** `tools` 合并为 `{ ...scriptTools, ...mcpTools, ...callSkillTool }`，MCP 工具以 `mcp__<server>__<name>` 命名

#### Scenario: 命名空间不冲突

- **GIVEN** MCP 工具名和技能工具名互不冲突
- **WHEN** 合并工具
- **THEN** 所有工具名唯一，MCP 工具使用 `mcp__` 前缀隔离

#### Scenario: llm-routed 策略兼容

- **GIVEN** 加载策略为 `llm-routed`
- **WHEN** Phase 2a（LLM 路由）和 Phase 3（执行）
- **THEN** MCP 工具在两个阶段均可用

### Requirement: HiveMind 接口新增 dispose()

系统 SHALL 在 `HiveMind` 接口新增 `dispose()` 方法，用于释放 MCP 连接等资源。

#### Scenario: dispose 关闭连接

- **GIVEN** MCP Server 已连接
- **WHEN** 调用 `hive.dispose()`
- **THEN** 关闭所有 MCP Client 连接，释放资源

#### Scenario: dispose 无 MCP 时安全

- **GIVEN** 未配置 MCP
- **WHEN** 调用 `hive.dispose()`
- **THEN** 无操作，不抛异常

### Requirement: 惰性连接

系统 SHALL 在首次 `run()` / `stream()` 时惰性建立 MCP 连接，不在 `createHiveMind()` 构造时阻塞。

#### Scenario: 首次调用时连接

- **GIVEN** `mcp` 已配置
- **WHEN** 首次调用 `run()` 或 `stream()`
- **THEN** 在 `resolveSkillContents()` 之后、工具合并之前，自动调用 `mcpManager.connect()`

#### Scenario: 后续调用跳过连接

- **GIVEN** MCP 已连接
- **WHEN** 再次调用 `run()` 或 `stream()`
- **THEN** 直接使用缓存的连接和工具，不重新连接

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
