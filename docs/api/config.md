# HiveMindConfig

`createHiveMind` 的完整配置类型。

## HiveMindConfig

```typescript
interface HiveMindConfig {
  models: ModelConfig;
  skills: SkillSource[];
  workspace?: string;
  loading?: LoadingConfig;
  scripts?: ScriptConfig;
  parser?: 'auto' | 'builtin';
  router?: 'auto' | 'builtin';
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  maxCallDepth?: number;
  mcp?: McpConfig;
}
```

### models

- 类型：`Record<string, LanguageModel>`
- **必需**

模型配置，key 是模型标识（如 `default`、`fast`、`reasoning`），value 是 Vercel AI SDK 的 `LanguageModel` 实例。必须至少包含 `default`。

### skills

- 类型：`SkillSource[]`
- **必需**

技能来源列表，支持三种类型：

```typescript
type SkillSource =
  | { type: 'local'; path: string }
  | { type: 'remote'; url: string }
  | { type: 'git'; url: string; branch?: string };
```

### workspace

- 类型：`string`
- 默认：`undefined`

工作区名称，用于多工作区隔离场景。

### loading

- 类型：`LoadingConfig`

```typescript
interface LoadingConfig {
  strategy?: 'eager' | 'progressive' | 'lazy' | 'llm-routed';
  maxActivatedSkills?: number;
  routerTopK?: number;
  cacheSize?: number;
  catalogueTokenBudget?: number;
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `strategy` | `'progressive'` | 加载策略（`eager` 预加载所有 / `progressive` 路由匹配后加载 / `lazy` 跳过索引直接加载 / `llm-routed` LLM 自主选择技能） |
| `maxActivatedSkills` | `5` | 引擎层截断：注入 system prompt 的最大技能数（llm-routed 模式下为 `activate_skill` 可激活的上限） |
| `routerTopK` | `5` | 路由层截断：路由匹配返回的候选技能数（仅 progressive 模式使用） |
| `cacheSize` | `50` | LRU 缓存容量 |
| `catalogueTokenBudget` | `undefined` | llm-routed 模式下技能目录注入 system prompt 的最大 token 预算，超出时截断并提示 LLM |

### scripts

- 类型：`ScriptConfig`

```typescript
interface ScriptConfig {
  enabled?: boolean;
  securityLevel?: 'basic' | 'strict' | 'sandbox';
  allowedRuntimes?: string[];
  timeout?: number;
  maxOutputSize?: number;
  requireApproval?: boolean;
  onApproval?: (script: string, args: string[]) => Promise<boolean>;
  preflight?: boolean;
  sandbox?: SandboxConfig;
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `false` | 是否启用脚本执行 |
| `securityLevel` | `'strict'` | 安全级别 |
| `allowedRuntimes` | `['bash', 'python', 'node']` | 允许的运行时 |
| `timeout` | `30000` | 超时（ms） |
| `maxOutputSize` | `30000` | 输出截断阈值（字符） |
| `requireApproval` | `false` | 是否需要审批 |

### logLevel

- 类型：`'debug' | 'info' | 'warn' | 'error' | 'silent'`
- 默认：`'warn'`

日志级别。`debug` 输出最详细的加载和路由信息。

### maxCallDepth

- 类型：`number`
- 默认：`5`

技能链调用的最大嵌套深度。设为 `0` 禁用 `call_skill` 工具。

### mcp

- 类型：`McpConfig`

MCP Server 连接配置。需安装 `@modelcontextprotocol/sdk`（optional peerDependency）。

```typescript
interface McpConfig {
  servers: McpServerConfig[];
  timeout?: number;
}

interface McpServerConfig {
  name: string;
  transport: McpTransport;
}

type McpTransport =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `servers` | `[]` | MCP Server 配置列表 |
| `timeout` | `30000` | 工具调用超时（ms） |
| `servers[].name` | — | Server 唯一标识，用于工具名前缀 `mcp__<name>__<tool>` |
| `servers[].transport` | — | 传输方式：`stdio`（本地子进程）、`sse`（HTTP+SSE）、`streamable-http`（HTTP 流式） |

## SandboxConfig

sandbox 安全级别的专用配置。

```typescript
interface SandboxConfig {
  cpuTimeLimitMs?: number;
  memoryLimitMb?: number;
  permissions?: SandboxPermissions;
}

interface SandboxPermissions {
  fs?: { read?: string[]; write?: string[] };
  net?: boolean;
  env?: string[];
  childProcess?: boolean;
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `cpuTimeLimitMs` | `10000` | CPU 时间限制 |
| `memoryLimitMb` | `128` | 内存限制 |
| `permissions.fs` | `{}` | 文件系统读写白名单 |
| `permissions.net` | `false` | 是否允许网络访问 |
| `permissions.env` | `[]` | 允许的环境变量 |
| `permissions.childProcess` | `false` | 是否允许子进程 |
