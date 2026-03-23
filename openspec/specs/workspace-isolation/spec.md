# workspace-isolation Specification

## Purpose

支持不同工作区独立配置技能集、模型映射和安全策略，实现多项目/多团队的技能隔离。

> 模块: `src/workspace/index.ts`, `src/workspace/config.ts` | 测试: `test/integration.test.ts`（工作区字符串传递） | 状态: 已实现（独立模块，未完全集成到 createHiveMind）

## Requirements

### Requirement: WorkspaceManager 工作区管理
系统 SHALL 提供 WorkspaceManager 支持工作区的注册、激活和配置解析。

#### Scenario: 注册工作区
- **WHEN** 调用 `workspaceManager.register(name, config)`
- **THEN** 工作区配置被存储，包含技能来源、模型映射、脚本执行策略

#### Scenario: 激活工作区
- **WHEN** 调用 `workspaceManager.activate(name)`
- **THEN** 后续的 resolveSkills/resolveModels/resolveScripts 使用该工作区配置

#### Scenario: 解析工作区技能
- **WHEN** 调用 `resolveSkills()` 在已激活的工作区中
- **THEN** 返回该工作区配置的技能来源列表

#### Scenario: 解析工作区模型
- **WHEN** 调用 `resolveModels()` 在已激活的工作区中
- **THEN** 返回该工作区配置的模型映射

### Requirement: 工作区配置解析
系统 SHALL 提供 `resolveWorkspaceConfig` 合并工作区默认值。

#### Scenario: 配置合并
- **WHEN** 传入部分工作区配置对象
- **THEN** 合并默认值，返回完整的工作区配置

### Requirement: 多实例隔离
系统 SHALL 支持通过创建多个 HiveMind 实例实现工作区隔离。

#### Scenario: 独立实例
- **WHEN** 创建多个 `createHiveMind({ workspace: 'frontend' })` 和 `createHiveMind({ workspace: 'backend' })`
- **THEN** 两个实例完全独立，各自拥有独立的技能集、模型配置和安全策略
