# MCP Client 集成 — 任务分解

## 任务 1：类型定义

- [x] 在 `src/types.ts` 中新增 `McpConfig`、`McpServerConfig`、`McpTransport` 类型
- [x] `HiveMindConfig` 新增可选 `mcp?: McpConfig` 字段
- [x] `src/index.ts` 导出新类型

**对应测试**: `test/integration.test.ts`（验证 `mcp` 配置被接受）
**验证方式**: `npm run typecheck` 通过 + 新类型可从包导入
**预估时间**: 30 分钟

## 任务 2：McpClientManager 核心实现

- [x] 创建 `src/mcp/index.ts`，实现 `McpClientManager` 类
- [x] 实现 `connect()`: 遍历 servers 配置，按 transport 类型创建 MCP Client
  - stdio → `StdioClientTransport`
  - sse → `SSEClientTransport`
  - streamable-http → `StreamableHTTPClientTransport`
- [x] 实现 `discoverTools()`: 连接后调用 `client.listTools()` 获取工具列表
- [x] 实现 `buildTools()`: 将 MCP 工具转换为 AI SDK `tool()` 格式
  - 命名: `mcp__<server>__<tool>`
  - 参数: 使用 `jsonSchema()` 直接映射 inputSchema
  - execute: 代理调用 `callTool()`
- [x] 实现 `callTool()`: 解析工具名，转发到对应 MCP Server
- [x] 实现 `dispose()`: 关闭所有连接，杀死子进程
- [x] 错误处理: 连接失败 warn + 降级、调用超时、SDK 未安装检测

**对应测试**: `test/mcp-client.test.ts`
**验证方式**: 单元测试覆盖连接管理、工具发现、转换、调用代理、错误处理
**预估时间**: 2 小时

## 任务 3：engine.ts 集成

- [x] 在 `createHiveMind()` 中根据 `config.mcp` 创建 `McpClientManager`（惰性模式）
- [x] 新增 `ensureMcpConnected()` 惰性函数（与 `ensurePreflight` 同模式）
- [x] 在 `run()` 和 `stream()` 的工具合并点注入 MCP 工具:
  ```
  const mcpTools = mcpManager ? await mcpManager.buildTools() : {};
  const tools = { ...scriptTools, ...mcpTools, ...callSkillTool };
  ```
- [x] llm-routed 策略的两个阶段（路由 + 执行）都注入 MCP 工具
- [x] `HiveMind` 接口新增 `dispose()` 方法
- [x] `dispose()` 实现: 调用 `mcpManager?.dispose()`

**对应测试**: `test/integration.test.ts`（扩展）、`test/mcp-client.test.ts`
**验证方式**: `mcp` 配置时 MCP 工具出现在 LLM 工具列表中，未配置时行为不变
**预估时间**: 1 小时

## 任务 4：依赖和导出

- [x] `package.json` 新增 `@modelcontextprotocol/sdk` 为 optional peerDependency
- [x] `peerDependenciesMeta` 标记为 optional
- [x] `devDependencies` 添加用于测试
- [x] `src/index.ts` 导出 `McpClientManager` 和相关类型

**对应测试**: `npm run typecheck` + `npm run build`
**验证方式**: 构建成功，ESM/CJS 双输出正常
**预估时间**: 20 分钟

## 任务 5：测试

- [x] 新建 `test/mcp-client.test.ts`
- [x] 测试用例:
  - McpClientManager 创建（无配置时不创建）
  - 连接失败降级（warn 日志，不阻塞）
  - 工具发现和缓存
  - MCP 工具命名约定（`mcp__<server>__<tool>`）
  - JSON Schema → AI SDK tool 转换
  - 工具调用代理（正常 + 超时 + 错误）
  - dispose 资源释放
  - SDK 未安装时的错误信息
  - 与 progressive / llm-routed 策略兼容
  - MCP 工具与 scriptTools / callSkillTool 命名空间隔离

**验证方式**: `npm test` 全量通过（预计 108 + ~12 = ~120）
**预估时间**: 1.5 小时

## 任务 6：文档更新

- [x] `README.md` 特性列表新增 MCP Client
- [x] `README.md` API 参考新增 `mcp` 配置和 `dispose()` 说明
- [x] `docs/index.md` hero features 新增 MCP 卡片
- [x] `docs/guide/introduction.md` 特性表新增 MCP
- [x] `docs/guide/core-concepts.md` 新增 MCP Client 小节
- [x] `docs/api/config.md` 新增 McpConfig 类型文档
- [x] `docs/api/create-hive-mind.md` 配置示例新增 MCP

**验证方式**: `npm run docs:build` 构建通过，文档站显示正确
**预估时间**: 1 小时
