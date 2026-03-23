# security-model Specification

## Purpose

提供 basic / strict / sandbox 三级安全模型，从基础路径防护到 V8 Isolate 沙盒隔离，覆盖受信任环境到多租户场景。

> 模块: `src/executor/security.ts`, `src/executor/sandbox.ts` | 测试: `test/executor.test.ts` (13), `test/sandbox.test.ts` (10) | 状态: 已实现

## Requirements

### Requirement: basic 级别 — 基础防护
系统 SHALL 在 basic 安全级别下提供路径穿越防护、白名单校验和资源限制。

#### Scenario: 路径穿越防护
- **WHEN** 脚本路径包含 `../`
- **THEN** `validatePath()` 抛出 `PathTraversalError`

#### Scenario: allowed-tools 白名单
- **WHEN** 执行未在 SKILL.md `allowed-tools` 中声明的脚本
- **THEN** `validateAllowedTools()` 抛出 `ScriptNotAllowedError`

#### Scenario: 超时 + 输出截断
- **WHEN** 脚本运行超时或输出过大
- **THEN** 强制终止进程 / 截断输出

### Requirement: strict 级别 — 严格模式
系统 SHALL 在 strict 安全级别下增加运行时白名单、环境变量隔离和审批控制。

#### Scenario: 运行时白名单
- **WHEN** 脚本使用未在 `allowedRuntimes` 中声明的运行时
- **THEN** 抛出 `RuntimeNotAllowedError`

#### Scenario: 环境变量隔离
- **WHEN** securityLevel 为 strict
- **THEN** `buildStrictEnv()` 构建干净的环境变量集，脚本只能读取显式传入的变量

#### Scenario: 用户审批回调
- **WHEN** 配置 `requireApproval: true` 且提供 `onApproval` 回调
- **THEN** 脚本执行前调用回调，返回 false 则阻止执行

### Requirement: sandbox 级别 — 沙盒模式
系统 SHALL 在 sandbox 安全级别下提供 V8 Isolate 隔离执行和细粒度权限控制。

#### Scenario: V8 Isolate 隔离执行
- **WHEN** securityLevel 为 sandbox 且脚本为 JS/MJS/CJS
- **THEN** 通过 `SandboxExecutor` 在 `vm` 沙盒中执行

#### Scenario: CPU 超时保护
- **WHEN** 沙盒中的脚本执行时间超过 `cpuTimeLimitMs`
- **THEN** 强制终止执行，抛出 `SandboxExitError`

#### Scenario: require 阻断
- **WHEN** 沙盒脚本尝试调用 `require()`
- **THEN** 抛出错误，阻止模块加载

#### Scenario: 定时器阻断
- **WHEN** 沙盒脚本尝试使用 `setTimeout` / `setInterval`
- **THEN** 定时器被剥离，不可用

#### Scenario: 环境变量权限控制
- **WHEN** 配置 `permissions.env: ['NODE_ENV', 'API_KEY']`
- **THEN** 沙盒中 `process.env` 只包含白名单中的变量

#### Scenario: 文件系统权限控制
- **WHEN** 配置 `permissions.fs: { read: ['./data/'], write: [] }`
- **THEN** 仅允许读取指定目录，写入被拒绝

#### Scenario: 网络权限控制
- **WHEN** 配置 `permissions.net: false`
- **THEN** 沙盒中不注入 `fetch`，脚本无法发起网络请求

#### Scenario: 非 JS 脚本回退
- **WHEN** securityLevel 为 sandbox 但脚本为 Python/Bash
- **THEN** 回退到 strict 模式执行
