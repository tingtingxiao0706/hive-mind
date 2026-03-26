# MCP Client 集成 — 设计文档

## 架构总览

```
createHiveMind(config)
    │
    ├─ SkillLoader          解析 SKILL.md
    ├─ SkillRouter          关键词 / BM25 路由匹配
    ├─ CompositeRegistry    本地 + 远程技能注册表
    ├─ ScriptExecutor       跨语言脚本执行
    ├─ AgentRunner          Agent 技能多步执行循环
    │    └─ call_skill      技能链调用
    └─ McpClientManager     ← 新增
         ├─ connect()       惰性建立 MCP 连接
         ├─ discoverTools() 从 MCP Server 获取工具列表
         ├─ buildTools()    转换为 Vercel AI SDK tool() 格式
         ├─ callTool()      代理调用 MCP 工具
         └─ dispose()       关闭连接、释放资源
```

## 工具注入流程

```
run() / stream()
    │
    ├─ resolveSkillContents()         Phase 1+2: 技能发现 + 激活
    │
    ├─ buildToolsForSkills(skills)    → { run_script, read_resource, list_skill_files }
    ├─ mcpManager.buildTools()        → { mcp__fs__read_file, mcp__github__create_issue, ... }  ← 新增
    ├─ buildCallSkillTool(...)        → { call_skill }
    │
    └─ tools = { ...scriptTools, ...mcpTools, ...callSkillTool }
              ↓
        generateText({ tools }) / streamText({ tools })
```

MCP 工具与现有工具在同一个 Record 中并列注入，互不干扰。

## 模块设计

### src/mcp/index.ts — McpClientManager

```typescript
export class McpClientManager {
  private clients: Map<string, McpClientEntry>;
  private connected: boolean;
  private logger: Logger;

  constructor(config: McpConfig, logger: Logger);

  /** 惰性连接——首次 run()/stream() 时调用 */
  async connect(): Promise<void>;

  /** 将所有 MCP Server 的工具转换为 AI SDK tool() 格式 */
  async buildTools(): Promise<Record<string, unknown>>;

  /** 代理调用单个 MCP 工具 */
  async callTool(server: string, tool: string, args: unknown): Promise<unknown>;

  /** 关闭所有连接 */
  async dispose(): Promise<void>;
}
```

### 连接生命周期

```
createHiveMind({ mcp: { servers: [...] } })
    │
    ├─ new McpClientManager(config.mcp)    ← 仅创建实例，不连接
    │
    ▼ 首次 run() / stream()
    ensureMcpConnected()                   ← 惰性连接（与 ensurePreflight 同模式）
    ├─ 遍历 config.mcp.servers
    │   ├─ stdio → 启动子进程 + StdioClientTransport
    │   ├─ sse → SSEClientTransport(url)
    │   └─ streamable-http → StreamableHTTPClientTransport(url)
    ├─ client.connect() + client.listTools()
    └─ connected = true
    │
    ▼ 后续 run() / stream()
    直接使用已缓存的工具列表
    │
    ▼ dispose()
    关闭所有 client + 杀死子进程
```

### MCP → AI SDK 工具转换

```
MCP Tool (JSON Schema):                    AI SDK Tool:
┌──────────────────────────┐              ┌──────────────────────────┐
│ name: "read_file"        │              │ name: "mcp__fs__read_file"│
│ description: "Read..."   │  ──转换──►   │ description: "Read..."   │
│ inputSchema: {           │              │ parameters: jsonSchema(  │
│   type: "object",        │              │   { type: "object", ... }│
│   properties: {...}      │              │ )                        │
│ }                        │              │ execute: (args) =>       │
└──────────────────────────┘              │   callTool("fs","read_file", args)
                                          └──────────────────────────┘
```

Vercel AI SDK v4 的 `jsonSchema()` 辅助函数可直接接受 JSON Schema 对象，无需转换为 Zod。

### 命名约定

```
mcp__<serverName>__<toolName>

示例:
  mcp__filesystem__read_file
  mcp__github__create_issue
  mcp__database__query
```

与 OpenClaw 的 `mcp__[server-name]__*` 约定一致。双下划线分隔确保不与技能工具名（`run_script`、`call_skill` 等）冲突。

## 类型设计

```typescript
// src/types.ts 新增

interface McpConfig {
  servers: McpServerConfig[];
  timeout?: number;               // 工具调用超时（默认 30000ms）
}

interface McpServerConfig {
  name: string;                    // 唯一标识，如 "github", "filesystem"
  transport: McpTransport;
}

type McpTransport =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
```

## 对三级安全模型的影响

MCP 工具不经过 `ScriptExecutor` 的安全边界（因为 MCP 工具由外部 Server 执行），因此：

- **basic**: MCP 工具直接可用，无额外限制
- **strict**: 可复用 `requireApproval` + `onApproval` 回调（后续扩展，本次不实现）
- **sandbox**: MCP 工具调用通过网络/进程间通信，不受 V8 Isolate 限制

本次实现不对 MCP 工具施加额外安全限制。MCP Server 自身的权限管理由 Server 端负责——这是 MCP 协议的设计意图。后续可在 `McpConfig` 中添加 `requireApproval` 等字段。

## 浏览器兼容性影响

MCP Client 依赖 Node.js 的 `child_process`（stdio 传输）和 `http`（SSE/HTTP 传输），**不兼容浏览器环境**。但这不影响 Hive-Mind 的浏览器兼容性策略：
- `McpClientManager` 仅在配置了 `mcp` 字段时创建
- 浏览器环境下不配置 `mcp` 即可，核心功能不受影响
- `@modelcontextprotocol/sdk` 为 optional peerDependency，不会被打包工具误引入

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| MCP Server 连接失败 | warn 日志 + 该 Server 的工具不注入，不阻塞引擎启动 |
| MCP 工具调用超时 | 返回 `{ error: "MCP tool timeout" }` |
| MCP 工具调用报错 | 返回 `{ error: message }`，LLM 可据此重试或换策略 |
| MCP Server 断开 | 下次调用时自动重连，失败则 warn |
| `@modelcontextprotocol/sdk` 未安装 | 配置了 `mcp` 但包不存在时，抛明确错误信息并指引安装 |
