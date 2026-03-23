# React / Next.js 专项规则

配合 [common-rules.md](common-rules.md) 使用。

---

## 1. 组件模式

- **函数组件优先**：所有新组件使用函数组件 + Hooks，不使用 Class 组件。
- **组件导出**：每个文件导出一个主组件，命名导出优先于默认导出（便于重构和自动导入）。
- **children vs Render Props**：
  - 简单嵌套用 `children`。
  - 需要向子元素传递数据时用 render props 或 Compound Components 模式。
- **forwardRef**：仅在需要暴露 DOM 引用给父组件时使用，日常组件不需要。
- **条件渲染**：简单条件用 `&&` 或三元；多分支用提前 return 或独立变量，避免 JSX 内嵌套三元。

```tsx
// 推荐：提前 return
if (isLoading) return <Skeleton />
if (error) return <ErrorFallback error={error} />
return <UserList users={users} />

// 避免：JSX 内嵌套三元
return (
  <div>
    {isLoading ? <Skeleton /> : error ? <ErrorFallback /> : <UserList />}
  </div>
)
```

## 2. Hooks 规则

- **Rules of Hooks**：只在函数组件或自定义 Hook 顶层调用，不在条件/循环内调用。
- **useState**：
  - 相关联的状态合并为一个对象，避免过多独立 useState。
  - 初始值复杂计算时用函数式初始化：`useState(() => computeExpensive())`。
- **useEffect**：
  - 每个 effect 只做一件事。
  - 依赖数组必须完整 — 不要用 `// eslint-disable` 跳过警告。
  - 始终返回清理函数处理定时器、订阅、AbortController。
  - 避免在 effect 中直接 setState 触发无限循环。
- **useMemo / useCallback**：
  - 不要默认对所有值 memo — 只在 Profiler 确认渲染瓶颈时使用。
  - `useCallback` 主要用于传递给 `React.memo` 包裹的子组件的回调。
- **useRef**：用于 DOM 引用和跨渲染持久化值（如定时器 ID），不要用 ref 替代 state。

## 3. Next.js 专项（App Router）

- **Server vs Client Components**：
  - 默认使用 Server Components — 无交互、无浏览器 API 的组件不加 `'use client'`。
  - 仅在需要 useState、useEffect、事件处理、浏览器 API 时标记 `'use client'`。
  - 将 `'use client'` 下推到最小范围的叶子组件。
- **数据获取**：
  - Server Components 内直接 `await fetch()` 或调用数据库/ORM。
  - Client Components 用 TanStack Query / SWR 或 Server Actions。
  - 避免在 Client Component 中直接 fetch 可以在服务端获取的数据。
- **路由与布局**：
  - `layout.tsx` 中放导航、侧边栏等持久 UI；`page.tsx` 放页面内容。
  - 使用 `loading.tsx` 和 `error.tsx` 处理加载和错误状态。
- **Image / Link**：使用 `next/image` 和 `next/link`，不用原生 `<img>` 和 `<a>`。
- **Metadata**：页面必须通过 `export const metadata` 或 `generateMetadata` 设置 title/description。

## 4. 状态管理（React 专项）

- **useState vs useReducer**：
  - 简单独立状态用 `useState`。
  - 多个关联状态或复杂状态转换用 `useReducer`。
- **Context 使用边界**：
  - Context 适合低频变化的全局数据（主题、语言、认证）。
  - 高频变化的数据（表单输入、动画）避免放 Context — 会导致大范围重渲染。
  - 大型 Context 按职责拆分为多个 Provider。
- **第三方状态库**：如使用 Zustand / Jotai / Redux Toolkit，遵循其官方最佳实践；selector 精细化以避免不必要的重渲染。

## 5. 性能模式（React 专项）

- **React.memo**：仅包裹接收复杂 props 且父组件频繁重渲染的子组件。配合 `useCallback` 保证回调引用稳定。
- **React.lazy + Suspense**：路由级拆分和大型可选功能模块使用懒加载。
- **key 的正确使用**：
  - 列表 key 用稳定的唯一标识（如 id），禁止用 index 作为 key（除非列表不会增删重排）。
  - 利用 key 重置组件状态：换 key 触发重新挂载。
- **Concurrent Features**：了解 `useTransition`、`useDeferredValue` 的适用场景（低优先级更新、大列表搜索过滤）。
- **避免内联对象/函数**：在 JSX props 中避免每次渲染创建新对象/函数（`style={{ ... }}`、`onClick={() => ...}`），除非子组件未被 memo。

## 6. 事件处理

- **命名规范**：事件处理函数统一 `handleXxx` 命名（`handleClick`、`handleSubmit`、`handleInputChange`）。
- **合成事件类型**：TypeScript 项目中为事件参数标注正确类型。

```tsx
function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  setValue(e.target.value)
}

function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  // ...
}
```

- **避免内联箭头函数**：当子组件被 `React.memo` 包裹时，内联 `() => ...` 会导致引用不稳定。使用 `useCallback` 或提取为具名函数。
- **事件委托**：大量同类元素（如列表项）的事件处理，优先在父容器上监听并通过 `event.target` 判断，避免为每项绑定独立处理器。

## 7. Portal

- **使用场景**：模态框、Tooltip、Dropdown、Toast 等浮层组件使用 `createPortal` 渲染到 `document.body` 或专用容器，避免被父组件的 `overflow: hidden` 或 `z-index` 上下文截断。
- **焦点管理**：Portal 渲染的模态框必须管理焦点（打开时 trap focus，关闭时恢复）。
- **事件冒泡**：Portal 中的事件仍沿 React 组件树冒泡（而非 DOM 树），设计时需注意。

## 8. Strict Mode

- **开发双渲染**：React.StrictMode 会在开发模式下双次调用组件函数、effect 和 reducer，用于发现副作用不纯的问题。不要为了"解决"双渲染而移除 StrictMode。
- **effect 清理验证**：双渲染确保 effect 的清理函数正确实现 — 如果 effect 有副作用但没有清理，StrictMode 下会暴露问题。
- **生产环境无影响**：StrictMode 仅在开发模式生效，不影响生产构建。

## 9. React 19+ 新特性

- **`use` Hook**：在组件内读取 Promise 或 Context，替代部分 useEffect + useState 的数据获取模式。仅在支持 Suspense 的场景下使用。
- **Server Actions**：表单提交和数据变更可使用 Server Actions（`'use server'`），替代手动 API 调用 + 状态管理。
- **Form Actions**：`<form action={serverAction}>` 模式自动处理 pending 状态、错误、乐观更新。配合 `useActionState` 管理表单状态。
- **`useOptimistic`**：在服务端确认前先乐观更新 UI，提升感知性能。

> 注意：React 19 特性需确认项目的 React 版本已升级。未升级的项目仍按 React 18 规则编码。

## 10. 错误处理

- **Error Boundary**：为页面级或功能区块设置 Error Boundary，捕获渲染时异常并展示 Fallback UI。
- **异步错误**：API 调用的 try/catch 中提供用户友好的错误提示，避免空白页或控制台报错。
- **类型守卫**：对后端返回数据做运行时校验（如 Zod），不要盲信响应结构。
