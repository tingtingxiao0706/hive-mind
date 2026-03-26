# OpenSpec 变更归档日志

记录所有通过 OpenSpec 工作流完成并归档的变更。

---

## 2026-03-25

### llm-routed-loading — LLM 驱动路由加载策略

- **归档路径**: `changes/archive/2026-03-25-llm-routed-loading/`
- **摘要**: 新增第四种加载策略 `llm-routed`，技能元数据注入 system prompt，LLM 通过 `activate_skill` 工具自主选择技能，引擎保持对激活、执行、安全的完整控制。采用两阶段 LLM 调用（路由 → 执行）。
- **受影响模块**: `src/types.ts`、`src/engine.ts`
- **新增测试**: 11 个（`test/llm-routed.test.ts`）
- **测试总数**: 97 → 108

---

## 2026-03-23

### auto-resolve-body-links — 跨技能文件引用

- **归档路径**: `changes/archive/2026-03-23-auto-resolve-body-links/`
- **摘要**: `SkillLoader.loadFull()` 自动提取 body 中的 markdown 链接，将目标文件加入 `read_resource` 白名单，LLM 可按需读取跨目录的链接文件。
- **受影响模块**: `src/types.ts`、`src/loader/index.ts`、`src/executor/tools.ts`、`src/engine.ts`
- **新增测试**: 8 个（`test/loader.test.ts`、`test/executor.test.ts`）
- **测试总数**: 89 → 97

### integrate-skill-tools-adapters — 对接 @skill-tools 适配器

- **归档路径**: `changes/archive/2026-03-23-integrate-skill-tools-adapters/`
- **摘要**: 实现 `SkillToolsParserAdapter`（对接 `@skill-tools/core`）和 `BM25Adapter`（对接 `@skill-tools/router`），通过 `parser: 'auto'` / `router: 'auto'` 启用，未安装时自动回退内置实现。
- **受影响模块**: `src/loader/adapters/skill-tools.ts`（新增）、`src/router/adapters/bm25.ts`（新增）、`src/engine.ts`、`package.json`
- **新增依赖**: `@skill-tools/core@0.2.2`、`@skill-tools/router@0.2.2`（optional peerDep）
- **新增测试**: 3 个（`test/integration.test.ts`）
- **测试总数**: 86 → 89

### expose-router-topk — 暴露路由 topK 配置

- **归档路径**: `changes/archive/2026-03-23-expose-router-topk/`
- **摘要**: `LoadingConfig` 新增 `routerTopK` 字段，穿透传入 `SkillRouter` 构造函数，允许用户独立控制路由层候选数量。
- **受影响模块**: `src/types.ts`、`src/engine.ts`
- **新增测试**: 1 个（`test/integration.test.ts`）
- **测试总数**: 84 → 85 (后合并归入 86)

### implement-preflight — 启动时运行时惰性预检

- **归档路径**: `changes/archive/2026-03-23-implement-preflight/`
- **摘要**: 首次 `run()`/`stream()` 时自动执行运行时预检（`scripts.preflight: true`），与 `ensureIndex` 模式一致的惰性执行 + 缓存。
- **受影响模块**: `src/engine.ts`
- **新增测试**: 2 个（`test/integration.test.ts`）
- **测试总数**: 81 → 84 (后合并归入 84)

### implement-loading-strategies — 实现 eager 和 lazy 加载模式

- **归档路径**: `changes/archive/2026-03-23-implement-loading-strategies/`
- **摘要**: 补全 `eager`（启动时预加载所有技能）和 `lazy`（显式指定技能直接加载）两种加载策略的实现，`progressive` 保持默认。
- **受影响模块**: `src/engine.ts`
- **新增测试**: 6 个（`test/integration.test.ts`）
- **测试总数**: 73 → 81 (后合并归入 81)
