# agent-runner Specification

## Purpose

支持技能声明为自主 Agent，拥有内置工具链（shell_exec, file_read, file_write）和多步执行循环，由 `x-hive.agent: true` 和 `maxSteps` 控制。

> 模块: `src/agent/index.ts`, `src/agent/loop.ts`, `src/agent/builtin-tools.ts` | 测试: 无专项测试 | 状态: 已实现（独立模块，未集成到 createHiveMind 主流程）

## Requirements

### Requirement: AgentRunner 自主执行
系统 SHALL 支持通过 AgentRunner 执行声明为 Agent 的技能，进入多步工具调用循环。

#### Scenario: Agent 技能识别
- **WHEN** 技能 SKILL.md 声明 `x-hive.agent: true`
- **THEN** 该技能可通过 `AgentRunner.run()` 执行

#### Scenario: 多步执行循环
- **WHEN** AgentRunner 执行 Agent 技能
- **THEN** 使用 `generateText` 进入多步循环，`maxSteps` 由 `skill.xHive.maxSteps` 控制

#### Scenario: 技能工具 + 内置工具
- **WHEN** Agent 技能执行时
- **THEN** 同时注入 `createSkillTools` 和内置工具（shell_exec, file_read, file_write）

### Requirement: 内置 Agent 工具集
系统 SHALL 为 Agent 技能提供系统级内置工具。

#### Scenario: shell_exec
- **WHEN** Agent 调用 `shell_exec` 工具
- **THEN** 在安全边界内执行 shell 命令

#### Scenario: file_read
- **WHEN** Agent 调用 `file_read` 工具
- **THEN** 读取指定文件内容

#### Scenario: file_write
- **WHEN** Agent 调用 `file_write` 工具
- **THEN** 写入内容到指定文件

### Requirement: Agent 模型选择
系统 SHALL 支持 Agent 技能声明首选和回退模型。

#### Scenario: 首选模型
- **WHEN** 技能声明 `x-hive.models.preferred: reasoning`
- **THEN** AgentRunner 优先使用 reasoning 模型

#### Scenario: 模型回退
- **WHEN** 首选模型不可用
- **THEN** 回退到 `x-hive.models.fallback` 或 default 模型
