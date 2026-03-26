# mcp-client Specification

## Purpose

管理与外部 MCP Server 的连接，发现 MCP 工具并转换为 Vercel AI SDK 格式，代理 LLM 对 MCP 工具的调用。

> 模块: `src/mcp/index.ts` (新增) | 测试: `test/mcp-client.test.ts` (新增) | 状态: 待实现

## Requirements

### Requirement: McpClientManager 连接管理

系统 SHALL 通过 McpClientManager 管理与 MCP Server 的连接生命周期。

#### Scenario: 惰性连接

- **GIVEN** `config.mcp` 配置了 MCP Server 列表
- **WHEN** 首次调用 `run()` 或 `stream()`
- **THEN** 系统自动建立与所有配置的 MCP Server 的连接，后续调用复用连接

#### Scenario: stdio 传输

- **GIVEN** MCP Server 配置 `transport.type` 为 `'stdio'`
- **WHEN** 建立连接
- **THEN** 系统启动 `transport.command` 指定的子进程，通过 stdin/stdout 通信

#### Scenario: SSE 传输

- **GIVEN** MCP Server 配置 `transport.type` 为 `'sse'`
- **WHEN** 建立连接
- **THEN** 系统通过 SSE 长连接与 `transport.url` 指定的服务端通信

#### Scenario: streamable-http 传输

- **GIVEN** MCP Server 配置 `transport.type` 为 `'streamable-http'`
- **WHEN** 建立连接
- **THEN** 系统通过 HTTP 流式请求与 `transport.url` 指定的服务端通信

#### Scenario: 连接失败降级

- **GIVEN** 某个 MCP Server 无法连接（进程不存在、网络不通等）
- **WHEN** 建立连接
- **THEN** 系统记录 warn 日志，跳过该 Server 继续连接其他 Server，不阻塞引擎启动

#### Scenario: dispose 资源释放

- **WHEN** 调用 `dispose()`
- **THEN** 关闭所有 MCP Client 连接，终止 stdio 子进程，释放所有资源

### Requirement: MCP 工具发现

系统 SHALL 从已连接的 MCP Server 发现可用工具并缓存。

#### Scenario: 工具列表获取

- **GIVEN** MCP Server 连接成功
- **WHEN** 调用 `client.listTools()`
- **THEN** 返回该 Server 声明的所有工具（name + description + inputSchema）

#### Scenario: 工具缓存

- **GIVEN** 工具列表已获取
- **WHEN** 后续调用 `buildTools()`
- **THEN** 直接返回缓存的工具列表，不重复调用 MCP Server

### Requirement: MCP 工具转换

系统 SHALL 将 MCP 工具转换为 Vercel AI SDK 的 `tool()` 格式。

#### Scenario: 命名约定

- **GIVEN** MCP Server 名为 `"filesystem"`，工具名为 `"read_file"`
- **WHEN** 转换为 AI SDK 工具
- **THEN** 工具名为 `"mcp__filesystem__read_file"`

#### Scenario: JSON Schema 参数映射

- **GIVEN** MCP 工具的 `inputSchema` 是 JSON Schema 对象
- **WHEN** 转换为 AI SDK 工具
- **THEN** 使用 AI SDK 的 `jsonSchema()` 直接映射参数 schema，不转换为 Zod

#### Scenario: 工具描述保留

- **GIVEN** MCP 工具包含 `description`
- **WHEN** 转换为 AI SDK 工具
- **THEN** 描述前缀加上 `[MCP: <serverName>]`，保持原始描述内容

### Requirement: MCP 工具调用代理

系统 SHALL 代理 LLM 对 MCP 工具的调用，将请求转发到对应的 MCP Server。

#### Scenario: 正常调用

- **WHEN** LLM 调用 `mcp__filesystem__read_file({ path: "/tmp/test.txt" })`
- **THEN** 系统从工具名解析出 server=`"filesystem"`、tool=`"read_file"`，通过 MCP Client 转发调用并返回结果

#### Scenario: 调用超时

- **GIVEN** MCP 工具调用超过 `mcp.timeout`（默认 30000ms）
- **WHEN** 超时发生
- **THEN** 返回 `{ error: "MCP tool call timed out" }`

#### Scenario: 调用错误

- **WHEN** MCP Server 返回错误
- **THEN** 返回 `{ error: <errorMessage> }`，不抛异常，LLM 可据此重试

### Requirement: 未配置时零开销

系统 SHALL 在 `config.mcp` 未配置时不创建 McpClientManager，不引入任何运行时开销。

#### Scenario: 无 MCP 配置

- **GIVEN** `createHiveMind()` 未传入 `mcp` 字段
- **WHEN** 调用 `run()` 或 `stream()`
- **THEN** 工具注入行为与当前完全一致，MCP 相关代码路径不被触发

#### Scenario: SDK 未安装

- **GIVEN** `config.mcp` 已配置但 `@modelcontextprotocol/sdk` 未安装
- **WHEN** 首次 `run()` 触发连接
- **THEN** 抛出明确错误信息，指引用户安装 `npm install @modelcontextprotocol/sdk`

## 新增 peerDependencies

```json
"@modelcontextprotocol/sdk": ">=1.0.0"
```

标记为 optional，通过 `peerDependenciesMeta` 配置。
