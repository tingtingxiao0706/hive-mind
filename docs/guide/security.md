# 安全模型

Hive-Mind 提供三级安全模型，逐级增强隔离和控制。

## 安全级别概览

| 级别 | 防护措施 | 适用场景 |
|------|---------|---------|
| **basic** | 路径穿越防护 + 白名单 + 超时 | 受信任的开发环境 |
| **strict** | + 运行时白名单 + 环境隔离 + 审批回调 | 推荐默认 |
| **sandbox** | + V8 Isolate + CPU/内存限制 + deny-by-default | 多租户生产环境 |

## Basic 级别

最低安全级别，适合受信任的本地开发环境。

```typescript
scripts: {
  enabled: true,
  securityLevel: 'basic',
}
```

**防护措施：**
- 路径穿越检测（阻止 `../../etc/passwd`）
- `allowed-tools` 白名单校验
- 脚本执行超时

## Strict 级别（推荐默认）

在 basic 基础上增加运行时隔离。

```typescript
scripts: {
  enabled: true,
  securityLevel: 'strict',
  allowedRuntimes: ['node', 'python'],
  timeout: 30_000,
}
```

**额外防护：**
- 运行时白名单（只允许声明的运行时执行）
- 环境变量隔离（只传递 PATH/HOME 和显式声明的变量）
- 审批回调（`onApproval`）

### 环境隔离

strict 模式下，脚本进程的环境变量被清洗：

```typescript
// 脚本只能看到这些环境变量
{
  PATH: '...',
  HOME: '...',
  LANG: 'en_US.UTF-8',
  // + 显式传入的变量
}
// process.env 中的 API_KEY、SECRET 等不会泄露
```

## Sandbox 级别

最高安全级别，使用 Node.js `vm` 模块创建 V8 Isolate 沙箱。

```typescript
scripts: {
  enabled: true,
  securityLevel: 'sandbox',
  sandbox: {
    cpuTimeLimitMs: 10_000,
    memoryLimitMb: 128,
    permissions: {
      fs: {
        read: ['./data'],
        write: ['./output'],
      },
      net: false,
      env: ['ALLOWED_VAR'],
      childProcess: false,
    },
  },
}
```

**额外防护：**

| 防护 | 说明 |
|------|------|
| CPU 时间限制 | 死循环自动终止 |
| `require` 阻断 | 无法加载任何 Node 模块 |
| `setTimeout/setInterval` 阻断 | 无定时器 |
| 文件系统权限 | 只能读写声明的路径 |
| 网络权限 | 默认禁止 fetch |
| 环境变量权限 | 只暴露声明的变量 |

::: warning 注意
Sandbox 仅支持 JavaScript 脚本（`.js`, `.mjs`, `.cjs`）。Python、Bash 等非 JS 脚本在 sandbox 级别会回退到 strict 模式执行。
:::

## 安全校验链

每次脚本执行前，依次通过以下校验：

```
1. validatePath       — 路径穿越检测
2. validateAllowedTools — 白名单校验
3. validateRuntime    — 运行时白名单（strict+）
4. onApproval         — 审批回调（如启用）
5. 执行（basic/strict → execa，sandbox → vm）
6. truncateOutput     — 输出截断
```
