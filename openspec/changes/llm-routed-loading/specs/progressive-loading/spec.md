# progressive-loading — 加载策略扩展

## 概述

修改能力。`LoadingConfig.strategy` 联合类型新增 `'llm-routed'`，`resolveSkillContents()` 新增对应分支。

## 受影响模块

- `src/types.ts` — `LoadingConfig` 接口

## 需求

### REQ-1: LoadingConfig.strategy 扩展

**当前**:
```typescript
strategy?: 'eager' | 'progressive' | 'lazy';
```

**变更后**:
```typescript
strategy?: 'eager' | 'progressive' | 'lazy' | 'llm-routed';
```

默认值仍为 `'progressive'`，行为不变。

### REQ-2: resolveSkillContents() 新增分支

- **触发条件**: `strategy === 'llm-routed'`
- **行为**: 不执行路由匹配，返回空的 `skillContents`（技能内容在 `activate_skill` 执行时动态加载）
- **ensureIndex()**: 仍需调用（需要技能目录用于注入 system prompt），但不构建路由索引（`router.buildIndex` 可跳过）

### REQ-3: run() / stream() 适配

- `llm-routed` 模式下，`run()` 和 `stream()` 的 Phase 3 需支持多 step 工具追加
- system prompt 初始包含技能目录但不包含任何技能 body
- 每次 `activate_skill` 调用后，后续 step 的 system prompt 和 tools 动态扩展

## 新增依赖

无。
