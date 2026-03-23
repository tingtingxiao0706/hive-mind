# 对接 @skill-tools 适配器

## 背景

architecture.md 3.1 节和多处 specs 中均描述了通过 `parser: 'auto'` / `router: 'auto'` 对接 `@skill-tools/core`（SKILL.md 解析）和 `@skill-tools/router`（BM25 路由）的能力，但 `engine.ts` 的 `resolveParser()` / `resolveMatcher()` 工厂函数当前是空壳——无论配置什么值，始终返回内置实现。

## 目标

1. 实现 `SkillToolsParserAdapter`（对接 `@skill-tools/core`）和 `BM25Adapter`（对接 `@skill-tools/router`），通过 `parser: 'auto'` / `router: 'auto'` 启用。
2. 采用惰性初始化（方案 A），避免改变 `createHiveMind` 的同步签名。
3. `@skill-tools` 包作为 optional peerDependencies 锁定 `0.2.2` 版本，未安装时自动回退到内置实现。

## 设计概要

### 适配器层

```
src/loader/adapters/
  ├── builtin.ts          ← 现有，gray-matter 内置解析
  └── skill-tools.ts      ← 新增，@skill-tools/core 适配器

src/router/adapters/
  ├── keyword.ts           ← 现有，关键词匹配内置路由
  └── bm25.ts              ← 新增，@skill-tools/router BM25 适配器
```

### SkillToolsParserAdapter 映射

| SkillParser 接口方法 | @skill-tools/core API | 处理方式 |
|---|---|---|
| `parse(filePath)` | `parseSkill(filePath)` | 转换 `result.skill.metadata` → `SkillFrontmatter`，处理 `ok: false` |
| `parseContent(content, meta)` | `parseSkillContent(content, filePath, dirPath)` | 同步，同上转换 |
| `resolveFiles(searchPath)` | `resolveSkillFiles(searchPath)` | 直接映射 |
| `countTokens(text)` | `countTokens(text)` | 直接映射（cl100k_base 精确计算 vs 粗估） |

### BM25Adapter 映射

| SkillMatcher 接口方法 | @skill-tools/router API | 处理方式 |
|---|---|---|
| `index(skills)` | `router.indexSkills([{ name, description }])` | 同时维护 `name → SkillMeta` 映射表 |
| `match(query, topK)` | `router.select(query)` | 通过映射表将 skill name 还原为 SkillMeta，截断到 topK |

### 惰性初始化（方案 A）

`createHiveMind()` 保持同步。`parser` 和 `matcher` 变量从 `const` 改为 `let`，在首次 `ensureIndex()` 时通过 `ensureAdapters()` 惰性初始化：

```
createHiveMind(config)  ← 同步，不变
    │
    ▼ 首次 ensureIndex() 调用时
ensureAdapters()
    ├── config.parser === 'auto'?
    │     → dynamic import('@skill-tools/core')
    │     → 成功: SkillToolsParserAdapter
    │     → 失败: warn + 回退 BuiltinAdapter
    └── config.router === 'auto'?
          → dynamic import('@skill-tools/router')
          → 成功: BM25Adapter
          → 失败: warn + 回退 KeywordAdapter
```

### 受影响模块

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `src/loader/adapters/skill-tools.ts` | 新增 | SkillToolsParserAdapter ~60 行 |
| `src/router/adapters/bm25.ts` | 新增 | BM25Adapter ~50 行 |
| `src/engine.ts` | 修改 | parser/matcher 改为 let + ensureAdapters() 惰性初始化 |
| `package.json` | 修改 | 新增 optional peerDependencies（锁定 0.2.2） |
| `test/integration.test.ts` | 新增用例 | 验证 builtin 显式指定和 auto 回退 |

## 非目标 (Non-goals)

1. **不改变 `createHiveMind` 签名** — 保持同步返回。
2. **不强制安装 @skill-tools** — optional peerDep，未安装时静默回退。
3. **不修改内置适配器** — BuiltinAdapter / KeywordAdapter 保持不变。
4. **不引入 @skill-tools 作为 dependencies** — 仅 peerDependencies。

## 对现有 86 个测试用例的影响

零破坏性。所有现有测试未设置 `parser: 'auto'` / `router: 'auto'`，走默认 `builtin` 路径不变。新增 ~3 个测试用例。

## 新增 peerDependencies

```json
"@skill-tools/core": "0.2.2"    // 锁定版本
"@skill-tools/router": "0.2.2"  // 锁定版本
```

均为 optional，通过 `peerDependenciesMeta` 标记。
