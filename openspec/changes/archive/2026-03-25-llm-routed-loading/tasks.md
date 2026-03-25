# 实现任务清单

## 1. 类型定义扩展 (~30min)

- [ ] `src/types.ts`: `LoadingConfig.strategy` 联合类型新增 `'llm-routed'`
- [ ] `src/types.ts`: `LoadingConfig` 新增可选字段 `catalogueTokenBudget?: number`

**验证方式**: TypeScript 编译通过，现有测试不受影响 (`npx vitest run`)

## 2. 技能目录构建 (~30min)

- [ ] `src/engine.ts`: 新增 `buildSkillCatalogue(metas: SkillMeta[]): string` 函数
  - 将 `SkillMeta[]` 格式化为 `- {name}: {description}` 列表
  - 支持 `catalogueTokenBudget` 截断
  - 返回完整的 "Available Skills" 段落文本

**验证方式**: 单元测试 — `test/engine.test.ts` 新增目录构建测试

## 3. activate_skill 工具实现 (~1.5h)

- [ ] `src/engine.ts`: 新增 `buildActivateSkillTool()` 函数
  - 接收 `skillIndex`、`loader`、`executor`、`maxActivatedSkills` 等闭包变量
  - 实现技能名验证、数量限制、加载、工具注册、去重逻辑
  - 返回 `{ activate_skill: tool({...}) }`
- [ ] `src/engine.ts`: 在 `run()` 和 `stream()` 中：
  - `llm-routed` 模式下 `resolveSkillContents()` 返回空 skillContents
  - system prompt 中注入技能目录（`buildSkillCatalogue` 返回值）
  - tools 中注入 `activate_skill` + `call_skill`
  - 使用 `onStepFinish` 回调在 `activate_skill` 调用后追加技能工具和 body

**验证方式**: 单元测试 — `test/engine.test.ts` 新增 llm-routed 策略测试
- 测试 `activate_skill` 工具存在且可调用
- 测试技能名不存在时返回错误
- 测试超过 maxActivatedSkills 时返回错误
- 测试重复激活去重

## 4. resolveSkillContents() 分支 (~30min)

- [ ] `src/engine.ts`: `resolveSkillContents()` 新增 `llm-routed` 分支
  - 调用 `ensureIndex()` 获取技能目录
  - 跳过路由匹配，返回空 `{ activated: [], skillContents: [] }`
  - 日志输出策略名和技能目录大小

**验证方式**: 单元测试 — `test/engine.test.ts` 验证 llm-routed 分支返回空内容

## 5. run() / stream() 多轮适配 (~1.5h)

- [ ] `src/engine.ts`: `run()` 方法适配
  - `llm-routed` 模式下使用 `generateText` 的 step 回调机制
  - 维护 `pendingTools` 和 `pendingSystemParts` 状态
  - `onStepFinish` 中检测 `activate_skill` 调用，将新工具和 body 追加到下一 step
- [ ] `src/engine.ts`: `stream()` 方法适配
  - 同 `run()`，使用 `streamText` 的 step 回调

**验证方式**: 集成测试 — `test/engine.test.ts` 使用 mock model 验证完整流程
- Step 1: LLM 调用 `activate_skill("xxx")`
- Step 2: LLM 使用技能工具执行任务
- 验证 `RunResult.activatedSkills` 包含动态激活的技能

## 6. 导出与类型检查 (~15min)

- [ ] `src/index.ts`: 确认新类型从公共 API 正确导出（`LoadingConfig` 已导出，无需额外操作）
- [ ] 运行 `npx tsc --noEmit` 确认类型无错误

**验证方式**: TypeScript 编译通过

## 7. 测试覆盖 (~1.5h)

- [ ] `test/engine.test.ts`: 新增 `describe('llm-routed strategy')` 测试组
  - 测试技能目录构建（格式、截断）
  - 测试 `activate_skill` 工具的完整行为
  - 测试多技能激活累积
  - 测试与 `call_skill` 共存
  - 测试 `stream()` 下的 llm-routed 行为
- [ ] 确保现有 97 个测试全部通过

**验证方式**: `npx vitest run` 全部通过，新增测试覆盖上述场景
