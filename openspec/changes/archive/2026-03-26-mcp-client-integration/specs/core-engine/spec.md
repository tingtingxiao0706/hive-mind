# core-engine Specification (MCP 扩展)

## Purpose

扩展 `createHiveMind` 工厂函数和 `HiveMind` 接口，集成 McpClientManager，在工具注入管线中并列加入 MCP 工具。

> 模块: `src/engine.ts`, `src/types.ts`, `src/index.ts` | 测试: `test/integration.test.ts` (扩展), `test/mcp-client.test.ts` (新增) | 状态: 待实现

## Requirements

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

## 新增 peerDependencies

无（由 mcp-client spec 声明）。
