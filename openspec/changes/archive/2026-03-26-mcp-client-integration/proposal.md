## Why

当前 Hive-Mind 的工具来源仅有两种：技能内置脚本（`run_script` / `read_resource`）和技能链调用（`call_skill`）。随着 MCP（Model Context Protocol）生态的成熟，大量高质量工具以 MCP Server 形式提供——文件系统、数据库、GitHub、Slack、浏览器等。Hive-Mind 用户如果想让 LLM 使用这些工具，目前只能在应用层自行对接，无法利用引擎的统一工具注入和安全管控。

竞品分析：
- **OpenClaw** 原生支持 MCP Server 连接，`mcp__[server]__*` 命名约定
- **Cursor** 内置 MCP Client，支持 stdio / SSE / streamable-http 传输
- Hive-Mind 在 `openclaw-comparison.md` 中已将 MCP 标注为"后续扩展"

本提案实现 Hive-Mind 作为 **MCP Client**，连接外部 MCP Server，将 MCP 工具动态注入到 LLM 的工具链中。

## What Changes

- **`HiveMindConfig` 新增 `mcp` 字段**：配置 MCP Server 列表，支持 stdio / SSE / streamable-http 三种传输方式。
- **新增 `McpClientManager`**：管理 MCP Server 连接的生命周期（惰性连接、工具发现、调用代理、断开连接），位于 `src/mcp/` 目录。
- **MCP 工具转换为 Vercel AI SDK Tool**：将 MCP Server 声明的工具（JSON Schema 参数）转换为 AI SDK 的 `tool()` 格式，使用 `mcp__<server>__<tool>` 命名约定。
- **工具注入**：MCP 工具在 `engine.ts` 的工具合并点与 `scriptTools`、`callSkillTool` 并列注入，对所有技能可用。
- **`HiveMind` 接口新增 `dispose()` 方法**：关闭 MCP 连接、释放子进程等资源。
- **新增 `@modelcontextprotocol/sdk` 依赖**：MCP 官方 TypeScript SDK，作为 optional peerDependency。

## 非目标 (Non-goals)

- **不实现 MCP Server 模式** — 本次仅实现 Client 端（连接外部 Server），不将 Hive-Mind 自身暴露为 MCP Server。
- **不实现技能级 MCP 绑定** — 本次 MCP 工具对所有技能全局可用，不支持技能通过 `x-hive.mcp` 声明 MCP 工具依赖（后续扩展）。
- **不实现 MCP Resources / Prompts** — 本次仅对接 MCP Tools 能力，Resources 和 Prompts 后续再做。
- **不改变现有工具注入逻辑** — `run_script`、`read_resource`、`call_skill` 等现有工具行为完全不变。
- **不强制安装 MCP SDK** — `@modelcontextprotocol/sdk` 为 optional peerDependency，未配置 `mcp` 时零开销。

## Capabilities

### New Capabilities

- `mcp-client`: MCP Client 连接管理——MCP Server 生命周期管理 + 工具发现 + 调用代理 + 命名空间隔离。

### Modified Capabilities

- `core-engine`: `HiveMindConfig` 新增 `mcp` 字段，工具合并点新增 MCP 工具，`HiveMind` 接口新增 `dispose()` 方法。

## Impact

- **受影响代码**: `src/types.ts`、`src/engine.ts`、`src/index.ts`（导出）、`src/mcp/`（新增目录）
- **对现有 108 个测试用例的影响**: 无破坏性影响。`mcp` 配置为可选字段，未配置时 `McpClientManager` 不创建，现有工具注入和技能管线行为完全不变。需新增测试用例覆盖 MCP 连接管理、工具发现和调用代理。
- **API 变更**: `HiveMindConfig` 新增可选 `mcp` 字段，`HiveMind` 接口新增 `dispose()` 方法——均为非破坏性扩展。
- **依赖变更**: 新增 `@modelcontextprotocol/sdk`（optional peerDependency）。
