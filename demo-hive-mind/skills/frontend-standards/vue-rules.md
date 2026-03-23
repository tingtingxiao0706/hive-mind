# Vue 专项规则

配合 [common-rules.md](common-rules.md) 使用。

---

## 1. 组件模式

- **Composition API 优先**：新代码统一使用 `<script setup>` + Composition API；Options API 仅在维护遗留代码时保留。
- **Props 定义**：使用 `defineProps` 的 TypeScript 类型声明方式。

```vue
<script setup lang="ts">
interface Props {
  title: string
  count?: number
  items: Item[]
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
})
</script>
```

- **Emits 定义**：使用 `defineEmits` 的类型声明，事件名统一 camelCase。

```vue
<script setup lang="ts">
const emit = defineEmits<{
  update: [value: string]
  delete: [id: number]
}>()
</script>
```

- **v-model**：多个双向绑定使用具名 v-model（`v-model:title`、`v-model:visible`）。
- **组件注册**：`<script setup>` 中导入即注册，无需 `components` 选项。

## 2. Composables

- **命名规范**：统一 `use` 前缀，文件放在 `composables/` 目录。
- **返回值**：返回 `ref` / `reactive` 包裹的响应式数据和操作方法。

```typescript
// composables/useCounter.ts
export function useCounter(initial = 0) {
  const count = ref(initial)
  const increment = () => count.value++
  const reset = () => { count.value = initial }
  return { count, increment, reset }
}
```

- **响应式管理**：
  - 简单值用 `ref`，复杂对象用 `reactive`。
  - 解构 `reactive` 对象时用 `toRefs()` 保持响应式。
  - 不要在 composable 内直接修改传入的 props。
- **生命周期**：composable 内可使用 `onMounted`、`onUnmounted` 等，但要确保在 `setup()` 同步调用栈中注册。
- **清理**：`onUnmounted` 中清理定时器、事件监听、WebSocket。

## 3. 模板规范

- **模板表达式**：保持简单 — 复杂逻辑用 `computed` 而非内联表达式。

```vue
<!-- BAD -->
<span>{{ items.filter(i => i.active).map(i => i.name).join(', ') }}</span>

<!-- GOOD -->
<span>{{ activeNames }}</span>
```

```typescript
const activeNames = computed(() =>
  items.value.filter(i => i.active).map(i => i.name).join(', ')
)
```

- **v-for + key**：`v-for` 必须搭配稳定的 `:key`（id），禁止用 index。
- **v-if vs v-show**：频繁切换用 `v-show`；条件不常变或初始为 false 的用 `v-if`。
- **v-if 和 v-for**：不要在同一元素上同时使用 — 用 `<template v-for>` 包裹或用 `computed` 过滤。

## 4. 模板安全

- **v-html**：禁止用 `v-html` 渲染用户输入。如确需，必须先用 DOMPurify 消毒。
- **动态组件**：`<component :is>` 不得接受用户输入的组件名 — 使用白名单映射。

```typescript
// 推荐：组件白名单
const componentMap: Record<string, Component> = {
  text: TextWidget,
  chart: ChartWidget,
}
const resolvedComponent = computed(() => componentMap[props.type])
```

- **URL 处理**：用户输入的 URL 需校验协议（仅允许 `http:` / `https:`），防止 `javascript:` 注入。

## 5. 性能模式

- **computed vs watch**：
  - 能用 `computed` 派生的值不用 `watch` + 手动赋值。
  - `watch` 用于副作用（API 调用、DOM 操作、日志）。
  - `watchEffect` 适合依赖自动收集的简单副作用。
- **shallowRef / shallowReactive**：大型对象或列表（如表格数据）使用 shallow 变体避免深度响应式的性能开销。
- **v-once**：静态内容用 `v-once` 跳过后续渲染。
- **v-memo**：大列表中条件性跳过子树更新（Vue 3.2+）。
- **异步组件**：`defineAsyncComponent` 实现路由级和功能级懒加载。
- **KeepAlive**：需要缓存状态的组件（如 Tab 切换）使用 `<KeepAlive>`，搭配 `include` / `max` 控制缓存范围。

## 6. Vue Router

- **懒加载**：路由组件一律使用动态导入。

```typescript
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/views/Dashboard.vue'),
  },
]
```

- **导航守卫**：
  - 全局守卫处理认证 / 权限。
  - 组件内守卫（`onBeforeRouteLeave`）处理未保存数据提示。
- **路由元信息**：通过 `meta` 字段声明页面权限、标题等，守卫统一读取。
- **命名路由**：使用命名路由而非硬编码路径字符串，便于重构。

## 7. Pinia（状态管理）

- **Setup Store 优先**：使用函数式（Setup）写法而非 Options 写法，与 Composition API 一致。
- **Store 粒度**：按功能域拆分（`useUserStore`、`useCartStore`），避免单一巨型 store。
- **Actions 中封装副作用**：API 调用、本地存储操作放在 actions 中，组件不直接操作 store 内部。
- **storeToRefs**：在组件中解构 store 时使用 `storeToRefs()` 保持响应式。

## 8. 错误处理

- **全局错误**：通过 `app.config.errorHandler` 捕获未处理的组件错误。
- **组件级**：使用 `onErrorCaptured` 生命周期钩子处理子组件错误。
- **异步错误**：API 调用 try/catch 中提供用户友好的错误提示，配合全局 Toast/Notification。
- **类型校验**：对后端返回数据做运行时校验（如 Zod），不盲信响应结构。
