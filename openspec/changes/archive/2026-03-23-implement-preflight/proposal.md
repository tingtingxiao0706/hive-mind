# 实现启动时运行时惰性预检

## 背景

`ScriptConfig.preflight` 在 `types.ts` 中已定义（默认 `false`），`RuntimeResolver.preflight()` 和 `ScriptExecutor.preflight()` 的底层实现也已完成，但 `engine.ts` 的 `createHiveMind()` 从未读取 `preflight` 配置项，也从未自动触发预检。用户必须手动调用 `hive.runtimeStatus()` 才能获取运行时状态。

architecture.md 6.3.5 节和 `script-execution` spec 都明确要求：`preflight: true` 时在初始化阶段自动检测运行时可用性。

## 目标

实现惰性预检（方案 B）：在首次 `run()`/`stream()` 调用时（而非 `createHiveMind()` 构造时），自动执行一次运行时预检。

## 设计概要

### 为什么选择惰性预检（方案 B）

`createHiveMind()` 当前是同步函数（返回 `HiveMind` 而非 `Promise<HiveMind>`），但 `preflight()` 是异步操作（需要 `execa` 检测运行时版本）。惰性预检的优势：

- **零 API 破坏** — `createHiveMind` 签名不变，不影响所有现有用户代码
- **与 `ensureIndex` 模式一致** — 首次需要时执行、结果缓存、后续直接跳过
- **符合"不阻塞启动"** — architecture.md 6.3.5 节明确说明"不可用的运行时发出 warning（不阻塞启动）"

### 实现方案

```
createHiveMind(config)
    │
    ├── executor 创建（已有）
    ├── preflightDone = false（新增闭包变量）
    │
    ▼ 首次 run() / stream() 调用时
    ensurePreflight()          ← 新增惰性函数
    ├── if (!preflightDone && executor && config.scripts?.preflight !== false)
    │     executor.preflight(allowedRuntimes)
    │     preflightDone = true
    └── else: 直接跳过
```

**关键决策**：
- `preflight` 默认值为 `false`（`types.ts` 中已定义），只有显式设置 `preflight: true` 时才执行
- 预检结果由 `RuntimeResolver` 内部缓存（已有 `this.cache`），后续 `runtimeStatus()` 和脚本执行时直接命中缓存
- 预检不阻塞——不可用的运行时仅输出 warn 日志，不抛异常

### 受影响模块

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `src/engine.ts` | 修改 | 新增 `preflightDone` 变量 + `ensurePreflight()` 函数，在 `resolveSkillContents()` 入口处调用 |
| `src/types.ts` | 无变更 | `ScriptConfig.preflight` 已定义 |
| `src/executor/index.ts` | 无变更 | `preflight()` 已实现 |
| `src/executor/runtime.ts` | 无变更 | `RuntimeResolver.preflight()` 已实现 |
| `test/integration.test.ts` | 新增用例 | 验证 preflight 在 scripts 启用时的行为 |

## 非目标 (Non-goals)

1. **不改变 `createHiveMind` 的同步签名** — 不引入 `Promise<HiveMind>` 返回类型。
2. **不改变 `preflight` 的默认值** — 保持 `false`，显式启用才触发。
3. **不在 `runtimeStatus()` 中复用预检缓存** — `runtimeStatus()` 保持现有行为（始终执行完整检测），预检的缓存由 `RuntimeResolver` 内部管理。

## 对现有 81 个测试用例的影响

- **零破坏性** — 所有现有测试均未设置 `scripts.preflight: true`，预检逻辑不会被触发。
- **新增 ~2 个测试用例** — 验证 preflight 启用/禁用时的行为。

## 新增 peerDependencies

无。
