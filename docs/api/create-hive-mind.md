# createHiveMind

创建并返回一个 `HiveMind` 实例。

## 签名

```typescript
function createHiveMind(config: HiveMindConfig): HiveMind
```

## 参数

### config

类型：`HiveMindConfig`

```typescript
const hive = createHiveMind({
  // 模型配置（必需）
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
  },

  // 技能来源（必需）
  skills: [
    { type: 'local', path: './skills' },
    { type: 'remote', url: 'https://registry.example.com' },
    { type: 'git', url: 'https://github.com/user/skills.git', branch: 'main' },
  ],

  // 工作区名称（可选）
  workspace: 'my-project',

  // 加载策略（可选）
  loading: {
    strategy: 'progressive',
    maxActivatedSkills: 5,
    routerTopK: 5,
    cacheSize: 50,
  },

  // 脚本执行（可选）
  scripts: {
    enabled: true,
    securityLevel: 'strict',
    allowedRuntimes: ['bash', 'python', 'node'],
    timeout: 30_000,
    maxOutputSize: 30_000,
    requireApproval: false,
  },

  // 日志级别（可选，默认 'warn'）
  logLevel: 'info',

  // 技能链最大嵌套深度（可选，默认 5）
  maxCallDepth: 5,
});
```

## 返回值

### HiveMind

| 方法 | 说明 |
|------|------|
| `run(options)` | 同步执行，返回完整结果 |
| `stream(options)` | 流式执行，返回 AsyncIterable |
| `list()` | 列出所有已注册技能 |
| `search(query)` | 按关键词搜索技能 |
| `install(source)` | 从远程源安装技能到本地 |
| `runtimeStatus()` | 检查系统运行时状态 |

## 示例

### 最简配置

```typescript
const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});
```

### 完整配置

```typescript
const hive = createHiveMind({
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
  },
  skills: [{ type: 'local', path: './skills' }],
  workspace: 'backend',
  loading: { strategy: 'progressive', maxActivatedSkills: 3 },
  scripts: {
    enabled: true,
    securityLevel: 'sandbox',
    allowedRuntimes: ['node'],
    timeout: 10_000,
    sandbox: {
      cpuTimeLimitMs: 5_000,
      permissions: { net: false },
    },
  },
  logLevel: 'debug',
  maxCallDepth: 3,
});
```
