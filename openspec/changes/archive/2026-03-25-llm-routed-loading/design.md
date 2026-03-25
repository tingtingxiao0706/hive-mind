## Context

当前引擎的三阶段管线（发现 → 激活 → 执行）中，"路由"由代码层（KeywordAdapter / BM25Adapter）完成，对语义理解有限。`llm-routed` 策略将路由决策交给 LLM，同时保留引擎对激活和执行的完整控制。

核心挑战：Vercel AI SDK 的 `tools` 参数在 `generateText()` / `streamText()` 调用时传入，技能激活后需要**动态追加新工具**。这需要利用 `maxSteps` 多轮机制——`activate_skill` 作为第一轮的工具调用返回，引擎在后续 step 中自动带上新注入的工具。

## Goals / Non-Goals

**Goals:**

- 新增 `llm-routed` 策略，LLM 从技能目录中选择需要的技能
- `activate_skill` 工具由引擎注入，LLM 调用后引擎完成加载、安全校验、工具注册
- 复用 Vercel AI SDK 的 `maxSteps` 多轮能力实现动态工具注入
- 支持单次对话中激活多个技能（LLM 可多次调用 `activate_skill`）

**Non-Goals:**

- 不引入独立的"第二轮调用"机制——复用现有 `maxSteps`
- 不在 system prompt 中注入技能 body——仅注入目录（name + description）
- 不修改其他三种策略的行为

## Decisions

### Decision 1: 动态工具注入方式——maxSteps 多轮 vs 手动二次调用

**选择**: 利用 Vercel AI SDK 的 `maxSteps` + `prepareStep` / `onStepFinish` 机制。

**理由**: `generateText` 和 `streamText` 都支持 `maxSteps`，SDK 在每个 step 完成后可通过回调动态修改下一 step 的配置（包括 tools 和 system prompt）。这样 `activate_skill` 返回后，引擎在 `onStepFinish` 中追加技能工具和 body，下一 step LLM 自然可以使用新工具。无需手动拆分两次 `generateText` 调用。

**备选方案**: 在 `activate_skill` 的 `execute` 内部递归调用 `generateText`——被否决，因为会产生嵌套的 LLM 调用栈，复杂度高且与 `call_skill` 的递归模式冲突。

**备选方案**: 在 `activate_skill.execute` 中直接返回技能 body 作为文本，不注入工具——被否决，因为放弃了引擎对脚本执行的安全管控。

### Decision 2: 技能目录注入格式

**选择**: 以结构化列表注入 system prompt，每个技能一行：`- {name}: {description}`

**理由**: 简洁、token 开销可预测（每技能约 30-50 tokens），LLM 容易理解。不需要 JSON 或 XML 等结构化格式。

**备选方案**: 以 JSON 数组注入——被否决，LLM 理解自然语言列表的准确率不低于 JSON，且 token 开销更小。

### Decision 3: activate_skill 的返回值

**选择**: 返回 `{ activated: true, name, description, instructions: skill.body }`，同时引擎侧注册工具供后续 step 使用。

**理由**: LLM 需要看到技能的完整指令（body）才能执行。工具注入在引擎侧通过 step 回调完成，对 LLM 透明。

### Decision 4: 技能目录大小限制

**选择**: 复用现有 `maxActivatedSkills` 配置控制实际激活数量，但目录本身不限制（展示所有已发现技能）。引入 `loading.catalogueTokenBudget`（可选）允许用户限制目录的 token 预算。

**理由**: 目录仅包含 name + description，20 个技能约 600-1000 tokens，可接受。100+ 技能时用户可通过 `catalogueTokenBudget` 截断。

## 架构流程图

```
┌────────────────────────────────────────────────────────────────┐
│  Phase 1: Discovery                                            │
│  registry.scan() → SkillMeta[] (name + description)            │
│  不构建路由索引（llm-routed 不需要 KeywordAdapter）               │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  System Prompt 构建                                             │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [用户 systemPrompt]                                      │  │
│  │                                                          │  │
│  │  ## Available Skills                                     │  │
│  │  你可以通过 activate_skill 工具激活以下技能：               │  │
│  │  - frontend-coding-standards: 前端编码规范检查和应用       │  │
│  │  - git-commit: 智能 Git 提交信息生成                      │  │
│  │  - api-tester: API 接口测试                               │  │
│  │  ...                                                     │  │
│  │                                                          │  │
│  │  需要时调用 activate_skill，不需要则直接回答。             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  tools = { activate_skill, call_skill }                        │
└────────────────────────────────────────────────────────────────┘
                              │
                    Step 1: LLM 判断
                              │
              ┌───────────────┴───────────────┐
              │                               │
         无需技能                        需要技能
         直接回答                   activate_skill("xxx")
              │                               │
              ▼                               ▼
┌──────────────────┐    ┌────────────────────────────────────────┐
│  返回最终回答      │    │  activate_skill.execute():              │
│  (流程结束)        │    │    1. loader.loadFull(skillPath)        │
└──────────────────┘    │    2. securityPolicy.validate(skill)    │
                        │    3. 注册工具到 pendingTools            │
                        │    4. 返回 { instructions: skill.body } │
                        └────────────────────────────────────────┘
                                          │
                                Step 2: 引擎追加工具
                                          │
                                          ▼
                        ┌────────────────────────────────────────┐
                        │  onStepFinish / prepareStep:            │
                        │    tools += pendingTools (run_script,   │
                        │             read_resource, etc.)        │
                        │    system += skill.body                 │
                        └────────────────────────────────────────┘
                                          │
                                   Step 3: LLM 执行
                                          │
                                          ▼
                        ┌────────────────────────────────────────┐
                        │  LLM 拥有技能指令 + 工具                 │
                        │  → 执行任务（调 run_script 等）          │
                        │  → 返回最终回答                          │
                        └────────────────────────────────────────┘
```

## 浏览器兼容性影响

本次改动不引入新的 Node.js API 调用。`activate_skill` 工具内部复用现有 `SkillLoader.loadFull()`（已使用 `node:path` / `node:fs`），浏览器兼容性边界不变。

## 对三级安全模型的影响

| 安全级别 | 影响 |
|---------|------|
| basic   | 无变化。`activate_skill` 本身不执行脚本，仅加载内容。激活后注入的 `run_script` / `read_resource` 沿用现有安全策略。 |
| strict  | 无变化。运行时白名单、环境变量隔离等 strict 层特性在脚本执行时按原有逻辑生效。 |
| sandbox | 无变化。V8 沙盒仅在 `run_script` 执行脚本时介入，与路由策略无关。 |

`activate_skill` 仅是路由决策工具，不突破安全边界。LLM 通过 `activate_skill` 获得的能力等同于现有 progressive 策略下引擎自动激活的能力——只是决策主体从 KeywordAdapter 变成了 LLM。

## Risks / Trade-offs

- **[风险] LLM 误判，激活了不相关的技能** → 缓解：`maxActivatedSkills` 限制同时激活的技能数；每个激活技能的 body 会增加 system prompt 长度，token 成本线性增长，但总量可控。
- **[风险] LLM 跳过 `activate_skill`，直接回答** → 缓解：system prompt 中明确指示"需要时必须先激活技能"；这属于 prompt engineering 层面的优化，不影响引擎安全性。
- **[Trade-off] 多一轮 LLM 调用** → `activate_skill` 需要额外一个 step，增加延迟和 token 消耗。但这换来了更准确的路由（LLM 语义理解 >> 关键词匹配），对于技能数量多、用户意图模糊的场景净收益为正。
- **[Trade-off] 技能目录占用 system prompt tokens** → 20 个技能约 600-1000 tokens，与 progressive 策略的基线开销（~500 tokens）相当。100+ 技能时可通过 `catalogueTokenBudget` 限制。
