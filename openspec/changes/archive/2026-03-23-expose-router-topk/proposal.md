# 暴露路由 topK 配置

## 背景

`SkillRouter` 构造函数接受 `topK` 参数（控制路由匹配返回的候选数量），但 `engine.ts` 创建 `SkillRouter` 时从未传入此值，且 `HiveMindConfig` 也没有暴露对应的配置项。用户无法控制路由层的候选数量。

当前有两层独立截断使用相同的默认值 `5`：
1. `SkillRouter.route()` 的 `topK` — 路由层截断
2. `resolveSkillContents()` 的 `maxActivatedSkills` — 引擎层截断

两者含义不同但默认值碰巧相同，导致问题被掩盖。

## 目标

在 `LoadingConfig` 中新增 `routerTopK` 字段，穿透传入 `SkillRouter` 构造函数。

## 设计概要

```typescript
export interface LoadingConfig {
  strategy?: 'eager' | 'progressive' | 'lazy';
  maxActivatedSkills?: number;  // 引擎层截断（注入 system prompt 的技能数）
  routerTopK?: number;          // ← 新增：路由层截断（匹配返回的候选数）
  cacheSize?: number;
}
```

`engine.ts` 中传入 `SkillRouter`：

```typescript
const router = new SkillRouter({
  matcher,
  topK: config.loading?.routerTopK,  // ← 新增
  logger,
});
```

不传时 `SkillRouter` 内部默认 `5`，行为不变。

### 受影响模块

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `src/types.ts` | 修改 | `LoadingConfig` 新增 `routerTopK` 字段 |
| `src/engine.ts` | 修改 | 将 `routerTopK` 传入 `SkillRouter` 构造函数 |
| `test/integration.test.ts` | 新增用例 | 验证 `routerTopK` 配置被接受 |

## 非目标 (Non-goals)

1. **不改变默认行为** — `routerTopK` 不传时默认 `5`，与现有行为完全一致。
2. **不合并 `topK` 和 `maxActivatedSkills`** — 两者职责不同，保持独立。

## 对现有 84 个测试用例的影响

零破坏性。新增 ~1 个测试用例。

## 新增 peerDependencies

无。
