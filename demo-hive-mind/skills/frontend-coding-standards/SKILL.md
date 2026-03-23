---
name: frontend-coding-standards
description: >-
  Frontend coding standards for React, Vue, and Next.js projects. Guides AI to
  write code following team conventions for component design, state management,
  API encapsulation, commenting, performance, security, and accessibility.
  Use when writing, creating, generating, or refactoring frontend code.
---

# 前端编码规范

编写前端代码时，遵循以下流程和规则。

> **依赖**：本技能引用 `../frontend-standards/` 下的规则文件，部署时须将 `frontend-standards/` 目录一并复制到项目中。

## 工作流

1. **识别框架**：检查项目的 `package.json` 判断框架（React / Vue / Next.js）。
2. **加载规则**：
   - 通用规则 → [common-rules.md](../frontend-standards/common-rules.md)
   - React / Next.js → 追加 [react-rules.md](../frontend-standards/react-rules.md)
   - Vue → 追加 [vue-rules.md](../frontend-standards/vue-rules.md)
   - 代码示例 → [examples.md](../frontend-standards/examples.md)
3. **按规则编码**：在生成代码的每一步遵循已加载的规则。
4. **自检**：完成后按下方核心原则逐项自查。

## 核心原则（编码时遵循）

### 组件

- 单一职责 — 一个组件只做一件事。
- Props 使用 TypeScript 类型定义，禁止 `any`。
- 超过 200 行或同时混合展示+数据+逻辑时，拆分。

### 状态

- 状态放在需要它的最近公共祖先。
- 能从已有状态派生的值不单独存储。
- 服务端数据用数据获取库（TanStack Query / SWR / Pinia）管理。

### API 封装

- 通过项目统一的请求实例调用接口，禁止裸写 `fetch` / `axios`。
- 每个接口函数有 TypeScript 请求/响应类型定义。
- 接口文件按业务模块组织（`api/user.ts`、`api/order.ts`）。
- 拦截器统一处理 token 注入、错误码、数据解包。

### 注释

- 不写"显而易见"的注释（如 "获取用户列表"）。
- 注释"为什么"而非"做什么" — 解释业务约束、技术 trade-off。
- 公共函数 / 组件必须有 JSDoc/TSDoc 签名说明。
- TODO/FIXME 必须附带 issue 编号或负责人。

### 性能

- 路由级组件和大型库必须懒加载。
- 不要预防性 memo 一切 — 仅在确认瓶颈时使用。
- 避免全量导入第三方库。
- 搜索输入 debounce、滚动事件 throttle。

### 安全

- 禁止用 `dangerouslySetInnerHTML` / `v-html` 渲染用户输入 — 如确需，先 DOMPurify 消毒。
- token、密钥不得出现在 URL、localStorage 明文或 console.log 中。

### 无障碍

- 使用语义化 HTML（`<button>`、`<nav>`、`<main>`）。
- 自定义交互组件必须有 `role`、`aria-label`、键盘事件。
- `<img>` 必须有 `alt`。

### Hooks / Composables

- 统一 `use` 前缀命名。
- 副作用（定时器、监听器、WebSocket）必须在卸载时清理。
- 依赖数组 / 响应式追踪保持完整。

### 代码风格

- 组件 PascalCase、函数 camelCase、常量 UPPER_SNAKE_CASE。
- 按功能模块（feature-based）组织文件。
- 导入排序：外部依赖 → 内部绝对路径 → 相对路径。
- TypeScript `strict` 模式，禁止 `any`。

### 错误处理

- 页面级 / 功能区块必须有错误边界，防止局部崩溃白屏。
- API 调用必须 try/catch，提供用户友好的错误提示，禁止静默吞错。
- 加载失败、数据为空、网络异常必须有兜底 UI（重试按钮 / 空状态）。
- 对后端返回数据做运行时校验（Zod / valibot），不盲信响应结构。

### 测试

- 新增公共组件 / 工具函数时编写测试。
- 测试用户行为和结果，不测内部实现。
- 用 Testing Library 模拟真实交互。

## 决策指引

| 场景 | 选择 |
|------|------|
| 简单独立状态 | `useState` / `ref` |
| 多个关联状态 | `useReducer` / `reactive` |
| 服务端数据 | TanStack Query / SWR / Pinia + API |
| 全局共享数据 | Zustand / Pinia（仅限认证、主题等） |
| 简单条件渲染 | `&&` 或三元 |
| 多分支条件 | 提前 return / computed |
| 频繁切换显隐 | `v-show` / CSS toggle |
| 不常切换显隐 | `v-if` / 条件渲染 |

## 框架专项

- React / Next.js：参阅 [react-rules.md](../frontend-standards/react-rules.md)
- Vue：参阅 [vue-rules.md](../frontend-standards/vue-rules.md)
- 代码对比示例：参阅 [examples.md](../frontend-standards/examples.md)
