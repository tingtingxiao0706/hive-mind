# progressive-loading Specification

## Purpose

将技能加载分为发现、激活、执行三个阶段按需加载，将 N 个技能的基线开销从 O(N) 降到 O(k)，其中 k 为匹配数（通常 1-3），实测节省 74.3% prompt tokens。

> 模块: `src/engine.ts`, `src/loader/index.ts`, `src/loader/adapters/builtin.ts` | 测试: `test/loader.test.ts` (5 个用例) | 状态: 已实现
## Requirements
### Requirement: 三阶段按需加载
系统 SHALL 将技能加载分为发现、激活、执行三个阶段，仅对匹配的技能加载完整内容。加载行为 SHALL 受 `loading.strategy` 配置控制。

#### Scenario: progressive 为默认策略
- **GIVEN** `loading.strategy` 未配置或配置为 `'progressive'`
- **WHEN** 引擎执行任何操作
- **THEN** 行为与当前实现完全一致：Phase 1 惰性扫描 → Phase 2 路由匹配并按需加载 → Phase 3 LLM 调用

### Requirement: SkillLoader 技能加载器
系统 SHALL 通过 SkillLoader 管理技能的元数据和完整内容加载，带 LRU 缓存。

#### Scenario: loadMeta 加载元数据
- **WHEN** 调用 `loader.loadMeta(filePath)`
- **THEN** 通过 BuiltinAdapter 解析 SKILL.md 的 frontmatter，返回 `SkillMeta`

#### Scenario: loadFull 加载完整内容
- **WHEN** 调用 `loader.loadFull(filePath)`
- **THEN** 返回 `SkillContent`，包含 body、scripts、references、assets

#### Scenario: LRU 缓存复用
- **WHEN** 同一技能在缓存有效期内被多次加载
- **THEN** 直接返回缓存结果，不重复解析文件

### Requirement: BuiltinAdapter 解析器
系统 SHALL 使用基于 gray-matter 的 BuiltinAdapter 解析 SKILL.md 文件。

#### Scenario: frontmatter 解析
- **WHEN** SKILL.md 包含 YAML frontmatter
- **THEN** 正确解析 name、description、compatibility、allowed-tools、metadata、x-hive 等字段

#### Scenario: resolveFiles 文件发现
- **WHEN** 调用 `adapter.resolveFiles(searchPath)`
- **THEN** 递归扫描目录，返回所有 SKILL.md 文件路径

#### Scenario: countTokens 粗估
- **WHEN** 调用 `adapter.countTokens(text)`
- **THEN** 返回 token 数量的粗略估算

### Requirement: maxActivatedSkills 限制
系统 SHALL 支持配置单次请求最多激活的技能数量。

#### Scenario: 超过上限截断
- **WHEN** 路由匹配到超过 `maxActivatedSkills` 个技能
- **THEN** 仅取分数最高的 Top-K，丢弃低分技能

### Requirement: eager 加载策略
系统 SHALL 支持 `eager` 加载策略，在首次索引时预加载所有技能的完整内容，后续请求直接从缓存取用。

#### Scenario: eager 模式预加载全部技能
- **GIVEN** `loading.strategy` 配置为 `'eager'`
- **WHEN** 首次调用 `ensureIndex()`（由 `run()`、`stream()`、`list()` 触发）
- **THEN** 系统在扫描元数据后，立即对所有技能执行 `loadFull()`，将完整内容缓存到内存

#### Scenario: eager 模式请求时跳过按需加载
- **GIVEN** `loading.strategy` 配置为 `'eager'`，且技能已预加载完成
- **WHEN** 调用 `run()` 或 `stream()` 进入 Phase 2
- **THEN** 路由匹配后直接从预加载缓存获取 `SkillContent`，不再调用 `loadFull()`

#### Scenario: eager 模式仍受 maxActivatedSkills 限制
- **GIVEN** `loading.strategy` 配置为 `'eager'`
- **WHEN** 路由匹配到超过 `maxActivatedSkills` 个技能
- **THEN** 仅取分数最高的 Top-K 注入 system prompt，不会把所有预加载的技能全部注入

### Requirement: lazy 加载策略
系统 SHALL 支持 `lazy` 加载策略，在 `run()`/`stream()` 显式指定技能时跳过索引扫描和路由匹配，直接按名称加载。

#### Scenario: lazy 模式显式指定技能
- **GIVEN** `loading.strategy` 配置为 `'lazy'`
- **WHEN** 调用 `run({ skills: ['translator'] })` 显式指定技能名称
- **THEN** 系统跳过 Phase 1（索引扫描）和 Phase 2（路由匹配），直接通过 `registry.load(name)` 加载指定技能

#### Scenario: lazy 模式未指定技能时回退
- **GIVEN** `loading.strategy` 配置为 `'lazy'`
- **WHEN** 调用 `run({ message: '...' })` 未指定 `skills` 参数
- **THEN** 系统优雅回退到 progressive 行为（扫描 + 路由 + 按需加载），并记录 warn 级别日志

#### Scenario: lazy 模式的 list() 和 search() 仍可用
- **GIVEN** `loading.strategy` 配置为 `'lazy'`
- **WHEN** 调用 `list()` 或 `search(query)`
- **THEN** 系统触发索引扫描（与 progressive 一致），正常返回结果

