# skill-routing Specification

## Purpose

在 LLM 调用之前通过纯本地计算匹配最相关的 Top-K 技能，零 token 成本，响应时间 <10ms，支持中英文混合查询和 CJK 分词。

> 模块: `src/router/index.ts`, `src/router/adapters/keyword.ts` | 测试: `test/router.test.ts` (8 个用例) | 状态: 已实现

## Requirements

### Requirement: SkillRouter 路由器
系统 SHALL 提供 SkillRouter 在 LLM 调用之前匹配最相关的 Top-K 技能。

#### Scenario: 构建索引
- **WHEN** 调用 `router.buildIndex(skills)`
- **THEN** 将所有技能的 name + description + tags 构建为可搜索的内部索引

#### Scenario: 路由匹配
- **WHEN** 调用 `router.route(query, topK)`
- **THEN** 返回按分数排序的 `MatchResult[]`，响应时间 <10ms

### Requirement: KeywordAdapter 关键词匹配
系统 SHALL 使用 KeywordAdapter 支持中英文混合查询的关键词匹配。

#### Scenario: 英文查询匹配
- **WHEN** 查询 "translate to English"
- **THEN** 按 `命中 token 数 / 总 token 数` 计算分数，完全匹配 +1，部分匹配 +0.5

#### Scenario: CJK 中文查询匹配
- **WHEN** 查询 "翻译成英文：今天天气真好"
- **THEN** 分词器将中文逐字提取 + 相邻双字组合（如 "翻" + "译" + "翻译"），CJK 子串匹配 +0.3 分

#### Scenario: tags 参与评分
- **WHEN** 技能声明了 `metadata.tags: [翻译, 英文]`
- **THEN** tags 内容纳入匹配文本，提高匹配精度

### Requirement: SkillMatcher 适配器接口
系统 SHALL 提供 SkillMatcher 抽象接口，支持替换匹配算法实现。

#### Scenario: 适配器可替换
- **WHEN** 配置 `router: 'auto'`（预留）
- **THEN** 可切换到 @skill-tools/router BM25 适配器

### Requirement: topK 配置
系统 SHALL 支持配置匹配结果数量。

#### Scenario: 默认 Top-3
- **WHEN** 不指定 topK
- **THEN** 返回分数最高的 3 个技能

#### Scenario: 自定义 topK
- **WHEN** 指定 `topK: 5`
- **THEN** 返回分数最高的 5 个技能
