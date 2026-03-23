# 前端通用规则（框架无关）

适用于 React、Vue、Next.js 等所有前端项目。

---

## 1. 组件设计

- **单一职责**：一个组件只做一件事。超过 200 行或同时处理展示 + 数据获取 + 业务逻辑时，考虑拆分。
- **Props 接口设计**：
  - 使用 TypeScript 接口/类型定义 Props，禁止 `any`。
  - Boolean props 用肯定语义命名（`isVisible` 而非 `isNotHidden`）。
  - 回调 props 统一 `onXxx` 命名。
  - 避免超过 7 个 props — 过多说明组件承担了太多职责。
- **组件粒度**：UI 原子组件（Button、Input）→ 组合组件（SearchBar）→ 业务组件（UserProfile）→ 页面组件（UserPage）。
- **可复用性**：业务无关的 UI 逻辑抽为通用组件，业务相关的保留在业务层。

## 2. 状态管理

- **就近原则**：状态放在需要它的最近公共祖先，而非一律提升到全局。
- **派生 vs 独立**：能从已有状态计算得到的值不应作为独立状态存储。
- **全局状态准入**：仅用户认证、主题、国际化等真正全局的数据放全局 store。
- **表单状态**：优先使用表单库（React Hook Form / VeeValidate）而非手动管理每个字段。
- **异步状态**：服务端数据优先用数据获取库（TanStack Query / SWR / Pinia + API 插件）管理缓存、重试、失效。

## 3. API / 接口封装

- **统一请求实例**：项目必须有统一的 axios/fetch 封装实例（如 `utils/request.ts` 或 `lib/http.ts`），配置 baseURL、超时、默认 headers。
- **拦截器职责**：
  - 请求拦截：token 注入、请求签名。
  - 响应拦截：统一错误码处理（401 跳登录、403 提示、5xx 上报）、数据解包（取 `response.data`）。
  - 重试策略：幂等 GET 可自动重试，非幂等请求不重试。
- **类型定义**：每个接口的请求参数和响应结构必须有 TypeScript 类型定义。

```typescript
// 推荐：类型安全的接口函数
interface UserListParams { page: number; pageSize: number; keyword?: string }
interface UserListResponse { list: User[]; total: number }

export function getUserList(params: UserListParams): Promise<UserListResponse> {
  return request.get('/users', { params })
}
```

- **模块化组织**：按业务模块拆分接口文件（`api/user.ts`、`api/order.ts`），禁止将所有接口堆在一个文件中。
- **禁止裸调用**：组件内不得直接写 `axios.get(...)` 或 `fetch(...)`，必须通过封装后的接口函数调用。
- **Loading / Error 模式**：统一处理请求状态，避免每个组件重复写 `loading`、`error`、`data` 三件套。

## 4. 注释与文档

- **禁止冗余注释**：不写"显而易见"的注释。

```typescript
// BAD: 冗余 — 代码本身已说明
// 获取用户列表
const users = await getUserList()

// GOOD: 解释非显而易见的约束
// 分页上限 100 是后端硬限制，超出会返回 400
const PAGE_SIZE_MAX = 100
```

- **注释"为什么"而非"做什么"**：复杂业务逻辑需解释决策原因、业务背景、技术 trade-off。
- **JSDoc / TSDoc**：公共函数、组件、工具函数必须有签名说明（参数、返回值、抛出的异常）。

```typescript
/**
 * 将金额从分转换为元，保留 2 位小数。
 * 后端统一以分为单位存储，前端展示时需转换。
 */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}
```

- **TODO / FIXME 规范**：必须附带 issue 编号或负责人，禁止裸 TODO。
  - `// TODO(zhangsan): 迁移到新 API 后移除 #issue-1234`
  - `// FIXME(@lisi): 时区转换在跨天场景下不正确`

## 5. 性能

- **懒加载**：路由级组件必须懒加载；大型第三方库（图表、编辑器、地图）必须动态导入。
- **Memo / 缓存**：仅在 Profiler 确认瓶颈时使用 memo；不要预防性 memo 一切。
- **列表渲染**：超过 50 项的列表考虑虚拟滚动（react-virtuoso / vue-virtual-scroller）。
- **图片**：使用 WebP/AVIF 格式、响应式 `srcset`、懒加载 `loading="lazy"`。
- **打包体积**：定期检查 bundle analyzer 输出；避免全量导入（`import _ from 'lodash'` → `import debounce from 'lodash/debounce'`）。
- **防抖 / 节流**：搜索输入用 debounce（300ms+）、滚动/resize 事件用 throttle。

## 6. 安全

- **XSS 防护**：
  - 禁止使用 `dangerouslySetInnerHTML`（React）或 `v-html`（Vue）渲染用户输入。
  - 如确需渲染 HTML，必须先用 DOMPurify 等库消毒。
- **敏感数据**：token、密钥、用户隐私数据不得出现在 URL 参数、localStorage 明文、console.log 或前端源码中。
- **依赖安全**：定期运行 `npm audit` / `pnpm audit`；不引入长期无维护的依赖。
- **CSRF**：表单提交和状态变更请求需携带 CSRF token（如后端要求）。
- **Content Security Policy**：了解并配合后端 CSP 头，避免内联脚本。

## 7. 无障碍（a11y）

- **语义化 HTML**：`<button>` 而非 `<div onClick>`、`<nav>` 而非 `<div class="nav">`、`<main>` / `<article>` / `<section>` 等。
- **ARIA 属性**：自定义交互组件必须有正确的 `role`、`aria-label`、`aria-expanded` 等。
- **键盘导航**：所有可交互元素必须可通过 Tab 聚焦、Enter/Space 触发。
- **焦点管理**：模态框打开时焦点进入、关闭时焦点恢复；路由切换后焦点回到页面顶部。
- **颜色对比**：文字与背景的对比度不低于 WCAG AA 标准（4.5:1）。
- **替代文本**：`<img>` 必须有 `alt`；装饰性图片用 `alt=""`。

## 8. 代码风格

- **命名规范**：
  - 组件：PascalCase（`UserProfile.tsx` / `UserProfile.vue`）
  - 函数/变量：camelCase
  - 常量：UPPER_SNAKE_CASE
  - 类型/接口：PascalCase，接口不加 `I` 前缀
  - CSS 类名：kebab-case 或项目约定的 BEM/Tailwind
- **文件组织**：按功能模块（feature-based）而非按类型（type-based）组织。

```
# 推荐：按功能模块
features/
  user/
    components/
    hooks/ (或 composables/)
    api/
    types/
    index.ts

# 避免：按类型平铺
components/
  UserList.tsx
  OrderList.tsx
hooks/
  useUser.ts
  useOrder.ts
```

- **导入排序**：外部依赖 → 内部绝对路径 → 相对路径，各组之间空行分隔。
- **TypeScript**：
  - 优先使用 `interface` 定义对象形状，`type` 用于联合/交叉/工具类型。
  - 禁止 `any`，确需时用 `unknown` + 类型守卫。
  - 开启 `strict` 模式。

## 9. Hooks / Composables

- **提取时机**：当组件内一段包含状态 + 副作用的逻辑可复用或使组件过于复杂时，提取为自定义 Hook / Composable。
- **命名**：统一 `use` 前缀（`useAuth`、`useDebounce`、`usePagination`）。
- **单一职责**：一个 Hook 只做一件事，避免出现 "上帝 Hook"。
- **返回值**：返回明确的对象或元组，不返回多余内部实现细节。
- **副作用清理**：定时器、事件监听、WebSocket 连接等必须在卸载时清理。
- **依赖声明**：确保依赖数组完整且正确，避免闭包陈旧值问题。

## 10. 错误处理

- **统一错误边界**：页面级或功能区块必须有错误边界 / 错误捕获机制，防止局部崩溃导致整页白屏。
- **异步错误**：所有 API 调用必须 try/catch 或 `.catch()`，提供用户友好的错误提示（Toast / Alert / 内联提示），禁止静默吞掉错误或仅 `console.error`。
- **兜底 UI**：加载失败、数据为空、网络异常等场景必须有对应的 Fallback UI（错误提示 / 重试按钮 / 空状态插图），不能出现空白页。
- **错误日志上报**：生产环境的未捕获异常和 Promise rejection 应上报监控平台（Sentry / 自建），不依赖用户反馈。
- **运行时校验**：对后端返回数据做运行时类型校验（如 Zod / valibot），不盲信响应结构，解析失败时走兜底逻辑。
- **错误信息脱敏**：展示给用户的错误信息不得包含堆栈、SQL、内部路径等技术细节。

## 11. 测试

- **覆盖优先级**：关键业务流程 > 共享组件 > 工具函数 > 边界条件。
- **测试内容**：测试用户行为和输出结果，而非内部实现细节。
- **组件测试**：使用 Testing Library（`@testing-library/react` / `@vue/test-utils`）模拟用户交互。
- **Mock 策略**：只 mock 外部依赖（API、路由、第三方服务），不 mock 被测组件的内部方法。
- **快照测试**：谨慎使用，仅用于稳定的 UI 组件；频繁变更的组件会导致快照噪音。
- **测试命名**：`it('should show error message when login fails')` — 描述行为和期望结果。

## 12. CSS / 样式

- **方案选型**：项目统一一种样式方案，不混用。常见选择：
  - **CSS Modules**：组件级作用域，零运行时，适合大多数项目。
  - **Tailwind CSS**：原子化工具类，适合快速开发、设计系统一致性强的项目。
  - **CSS-in-JS**（styled-components / Emotion）：动态样式能力强，但有运行时开销，SSR 需额外配置。
- **避免全局污染**：禁止在组件中写无作用域的全局样式。全局样式仅限 reset/normalize、字体、CSS 变量。
- **CSS 变量（主题）**：颜色、间距、字号等设计 token 统一用 CSS 自定义属性管理，集中定义在 `:root` 或主题文件中。

```css
:root {
  --color-primary: #1677ff;
  --color-error: #ff4d4f;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --radius-base: 6px;
}
```

- **响应式设计**：
  - 使用统一的断点变量（如 `sm: 640px`、`md: 768px`、`lg: 1024px`）。
  - 移动优先（`min-width`）或桌面优先（`max-width`）二选一，全项目统一。
  - 优先使用 Flexbox / Grid 布局，避免浮动和固定像素定位。
- **避免魔法数字**：间距、字号、颜色不得硬编码，使用 CSS 变量或设计系统 token。
- **z-index 管理**：定义统一的 z-index 层级（如 dropdown: 1000、modal: 2000、toast: 3000），禁止随意写 `z-index: 9999`。
