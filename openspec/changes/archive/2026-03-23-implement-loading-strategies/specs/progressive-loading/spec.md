# progressive-loading Specification (Delta)

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: 三阶段按需加载
系统 SHALL 将技能加载分为发现、激活、执行三个阶段，仅对匹配的技能加载完整内容。加载行为 SHALL 受 `loading.strategy` 配置控制。

#### Scenario: progressive 为默认策略
- **GIVEN** `loading.strategy` 未配置或配置为 `'progressive'`
- **WHEN** 引擎执行任何操作
- **THEN** 行为与当前实现完全一致：Phase 1 惰性扫描 → Phase 2 路由匹配并按需加载 → Phase 3 LLM 调用
