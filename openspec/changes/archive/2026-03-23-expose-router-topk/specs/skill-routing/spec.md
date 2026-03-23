# skill-routing Specification (Delta)

## ADDED Requirements

### Requirement: routerTopK 配置穿透
系统 SHALL 支持通过 `LoadingConfig.routerTopK` 配置路由匹配返回的候选技能数量，并将其传入 `SkillRouter` 构造函数。

#### Scenario: 自定义 routerTopK
- **GIVEN** `loading.routerTopK` 配置为 `10`
- **WHEN** 路由匹配执行时
- **THEN** `SkillRouter` 返回最多 `10` 个候选技能（而非默认的 `5` 个）

#### Scenario: routerTopK 默认值
- **GIVEN** `loading.routerTopK` 未配置
- **WHEN** 路由匹配执行时
- **THEN** `SkillRouter` 使用内部默认值 `5`，行为与当前一致
