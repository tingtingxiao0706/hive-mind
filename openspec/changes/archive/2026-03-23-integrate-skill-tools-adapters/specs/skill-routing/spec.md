# skill-routing Specification

## Purpose

在 LLM 调用之前通过纯本地计算匹配最相关的 Top-K 技能，零 token 成本，响应时间 <10ms，支持中英文混合查询和 CJK 分词。

> 模块: `src/router/index.ts`, `src/router/adapters/keyword.ts`, `src/router/adapters/bm25.ts` | 测试: `test/router.test.ts` (8 个用例), `test/integration.test.ts` | 状态: 已实现

## ADDED Requirements

### Requirement: @skill-tools/router BM25 适配器
系统 SHALL 提供 BM25Adapter 实现 SkillMatcher 接口，对接 @skill-tools/router（v0.2.2）的 BM25 路由能力。

#### Scenario: auto 模式启用 BM25 路由
- **GIVEN** `router: 'auto'` 配置且 `@skill-tools/router` 已安装
- **WHEN** 首次 ensureIndex() 触发 ensureAdapters()
- **THEN** 动态 import @skill-tools/router 并使用 BM25Adapter 替换内置关键词匹配

#### Scenario: auto 模式回退到内置路由
- **GIVEN** `router: 'auto'` 配置但 `@skill-tools/router` 未安装
- **WHEN** ensureAdapters() 尝试动态 import 失败
- **THEN** 输出 warn 日志，继续使用 KeywordAdapter

#### Scenario: builtin 模式跳过 BM25
- **GIVEN** `router: 'builtin'`（默认值）
- **WHEN** 创建 HiveMind 实例
- **THEN** 始终使用 KeywordAdapter，不尝试 import @skill-tools/router
