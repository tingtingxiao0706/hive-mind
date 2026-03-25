# script-execution — 工具注入适配

## 概述

修改能力。`buildToolsForSkills()` 需在 `llm-routed` 模式下支持延迟调用——技能工具不再在 Phase 2 一次性构建，而是在 `activate_skill` 触发后按需构建。

## 受影响模块

- `src/engine.ts` — `buildToolsForSkills()` 调用时机
- `src/executor/tools.ts` — 无代码修改，但调用方式变化

## 需求

### REQ-1: 延迟工具构建

**当前行为**: `resolveSkillContents()` 返回后立即调用 `buildToolsForSkills(skillContents)`，一次性构建所有技能工具。

**变更后行为**:
- progressive / eager / lazy 模式：行为不变
- llm-routed 模式：初始 `skillContents` 为空，`buildToolsForSkills` 返回空对象。技能工具在 `activate_skill.execute()` 内部调用 `createSkillTools()` 构建，追加到待注入工具集。

### REQ-2: 工具集累积

- 多个技能先后激活时，工具集累积（不覆盖已有工具）
- 如果多个技能定义了同名工具（如 `run_script`），后激活的覆盖先激活的（与现有 `Object.assign` 行为一致）

## 新增依赖

无。
