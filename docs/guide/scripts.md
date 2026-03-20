# 脚本执行

Hive-Mind 允许技能包含可执行脚本，通过 `ScriptExecutor` 在安全边界内执行。

## 启用脚本执行

```typescript
const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
  scripts: {
    enabled: true,
    securityLevel: 'strict',
    allowedRuntimes: ['bash', 'python', 'node'],
    timeout: 30_000,
    maxOutputSize: 30_000,
  },
});
```

## 支持的运行时

| 运行时 | 文件扩展名 | 要求 |
|--------|----------|------|
| Bash | `.sh` | 系统安装 bash |
| Python | `.py` | Python 3.8+，推荐安装 `uv` |
| Node.js | `.js`, `.mjs`, `.cjs` | Node.js 18+ |
| Deno | `.ts` | 系统安装 deno |

### Python 运行时策略

`RuntimeResolver` 按优先级尝试以下策略：

1. **`uv run`** — 最佳选择，自动创建隔离环境和管理 PEP 723 依赖
2. **`pipx run`** — 备选方案
3. **`python3` / `python`** — 直接执行

## 运行时检查

```typescript
const status = await hive.runtimeStatus();
console.log(status);
// {
//   bash:   { available: true,  version: '5.2.15', command: 'bash' },
//   python: { available: true,  version: '3.12.1', command: 'python3' },
//   node:   { available: true,  version: '20.11.0', command: 'node' },
// }
```

## 工具注入

当技能包含脚本时，引擎自动为 LLM 注入 `run_script` 工具：

```
技能被激活 → 发现 scripts/ 目录 → 为每个脚本创建 tool → 注入 LLM 调用
```

LLM 可以通过 `run_script` 工具执行脚本，传入参数并获取 stdout/stderr 输出。

## 输出截断

脚本输出超过 `maxOutputSize`（默认 30,000 字符）时自动截断，防止上下文窗口被占满。截断后会附加提示信息：

```
... [truncated, 15000 chars omitted]
```

## 审批流程

对敏感场景，可以要求每次脚本执行前获得审批：

```typescript
const hive = createHiveMind({
  // ...
  scripts: {
    enabled: true,
    requireApproval: true,
    onApproval: async (script, args) => {
      console.log(`即将执行: ${script} ${args.join(' ')}`);
      // 可以弹出确认对话框或写入审计日志
      return true; // true 允许执行，false 拒绝
    },
  },
});
```
