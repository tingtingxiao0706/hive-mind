# 完善加载策略：实现 eager 和 lazy 模式

## 背景

`LoadingConfig.strategy` 在 `types.ts` 中定义了三种加载策略（`eager` | `progressive` | `lazy`），但 `engine.ts` 当前始终按 progressive 模式运行，未读取也未处理 `strategy` 配置项。本提案补全 `eager` 和 `lazy` 两种模式的实现。

## 目标

1. **`eager` 模式**：`createHiveMind` 初始化时（首次调用 `ensureIndex`）即加载所有技能的完整内容（`SkillContent`），后续 `run()`/`stream()` 跳过按需加载步骤，直接使用预加载的内容。适合技能数量少（<10）、启动延迟不敏感的场景。

2. **`lazy` 模式**：完全惰性——不预加载技能索引，不执行自动路由匹配。仅在 `run()`/`stream()` 通过 `options.skills` 显式指定技能名称时，按需加载对应技能的完整内容。适合技能数量极大（100+）且调用方明确知道需要哪个技能的场景。

3. **`progressive` 模式**（保持现状）：三阶段按需加载——Phase 1 扫描元数据 → Phase 2 路由匹配 Top-K → Phase 3 按需加载完整内容。

## 设计概要

### eager 模式行为

```
createHiveMind(config) → 返回 HiveMind 实例
    │
    ▼ 首次调用 ensureIndex()
Phase 1: registry.scan() → 获取所有 SkillMeta
    │
    ▼ 立即加载所有技能完整内容
Phase 1+: loader.loadFull() × N → 缓存到 eagerContents Map
    │    （路由索引仍然构建，用于 search() 功能）
    │
    ▼ run() / stream() 时
Phase 2: 路由匹配或显式指定 → 从 eagerContents 直接取内容（不再调用 loadFull）
Phase 3: 组装 system prompt + LLM 调用
```

**关键决策**：eager 模式下路由索引仍然构建，`run()` 仍通过路由选出 Top-K，但 loadFull 步骤直接从预加载缓存取值。这样：
- `search()` 和 `list()` 功能不受影响
- 不会把所有技能都注入 system prompt（仍受 `maxActivatedSkills` 限制），避免上下文窗口膨胀
- 唯一的差异是：完整内容的加载时机从"请求时"提前到"首次索引时"

### lazy 模式行为

```
createHiveMind(config) → 返回 HiveMind 实例
    │
    ▼ run(options) 时
    ├── options.skills 未指定？
    │     → 回退到 progressive 行为（扫描 + 路由 + 按需加载）
    │
    └── options.skills 已指定？
          → 跳过 Phase 1 扫描和 Phase 2 路由
          → 直接通过 registry.load(name) 加载指定技能
          → 组装 system prompt + LLM 调用
```

**关键决策**：
- `list()` 和 `search()` 在 lazy 模式下仍然可用——它们会触发首次扫描（与 progressive 一致）
- lazy 的核心差异在于 `run()`/`stream()`：当 `options.skills` 已指定时，跳过 Phase 1 和 Phase 2，直接按名称加载
- 当 `options.skills` 未指定时，优雅回退到 progressive 行为，避免静默失败

### 受影响模块

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `src/engine.ts` | 修改 | 读取 `loading.strategy`，分别实现 eager/lazy 逻辑 |
| `src/registry/index.ts` | 无变更 | `load(name)` 接口已存在，lazy 模式直接使用 |
| `src/loader/index.ts` | 无变更 | `loadFull()` 和 LRU 缓存复用 |
| `src/types.ts` | 无变更 | `LoadingConfig.strategy` 类型定义已存在 |
| `test/integration.test.ts` | 新增用例 | 验证三种策略的行为差异 |

## 非目标 (Non-goals)

1. **不改变 `progressive` 模式的行为** — 现有的三阶段管线逻辑保持不变，`progressive` 仍为默认策略。
2. **不引入异步初始化** — eager 模式不在 `createHiveMind()` 构造时阻塞加载，而是在首次 `ensureIndex()` 调用时执行（保持 `createHiveMind` 同步返回）。
3. **不新增配置字段** — 仅消费已有的 `loading.strategy` 字段，不新增类型定义。
4. **不修改 `SkillRegistry` 接口** — `load(name)` 接口已存在于 `CompositeRegistry` / `LocalRegistry`，直接使用。

## 对现有 73 个测试用例的影响

- **零破坏性** — 所有现有测试均未显式设置 `loading.strategy`，因此默认走 `progressive` 路径，行为完全不变。
- **新增 ~6 个测试用例** — 覆盖 eager 模式的预加载、lazy 模式的显式指定 + 回退行为、以及 `list()`/`search()` 在各模式下的兼容性。

## 新增 peerDependencies

无。本变更仅修改内部逻辑，不引入新的外部依赖。

## 实现复杂度评估

变更集中在 `src/engine.ts`，预估新增约 60-80 行代码（eager 的预加载逻辑 + lazy 的按名称加载逻辑 + 策略分支判断），加上约 80-100 行测试代码。总工作量约 2-3 小时。
