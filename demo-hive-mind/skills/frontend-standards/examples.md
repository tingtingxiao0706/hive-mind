# 前端代码示例（Bad vs Good）

按规则类别提供典型对比，帮助理解规则的实际应用。

---

## 1. 组件设计 — 职责拆分

**Bad**：一个组件同时处理数据获取、过滤逻辑和 UI 渲染。

```tsx
function UserPage() {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/users?page=${page}&sort=${sortField}&order=${sortOrder}`)
      .then(r => r.json())
      .then(data => { setUsers(data.list); setLoading(false) })
  }, [page, sortField, sortOrder])

  const filtered = users.filter(u =>
    u.name.includes(search) || u.email.includes(search)
  )

  const handleBatchDelete = async () => {
    await fetch('/api/users/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds }),
    })
    // 刷新...
  }

  return (
    <div>
      {/* 200+ 行的搜索栏、表格、分页、批量操作混在一起 */}
    </div>
  )
}
```

**Good**：拆分为数据层 Hook + 展示组件。

```tsx
// hooks/useUsers.ts — 数据获取与状态
function useUsers() {
  const [params, setParams] = useState({ page: 1, sort: 'name', order: 'asc' })
  const { data, isLoading } = useQuery({
    queryKey: ['users', params],
    queryFn: () => getUserList(params),
  })
  return { users: data?.list ?? [], total: data?.total ?? 0, isLoading, params, setParams }
}

// components/UserTable.tsx — 纯展示
function UserTable({ users, onSelect }: { users: User[]; onSelect: (ids: string[]) => void }) {
  return <Table dataSource={users} rowSelection={{ onChange: onSelect }} />
}

// pages/UserPage.tsx — 组合
function UserPage() {
  const { users, isLoading, params, setParams } = useUsers()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  return (
    <>
      <SearchBar value={params.keyword} onChange={k => setParams(p => ({ ...p, keyword: k }))} />
      <UserTable users={users} onSelect={setSelectedIds} />
      <Pagination current={params.page} onChange={p => setParams(prev => ({ ...prev, page: p }))} />
    </>
  )
}
```

---

## 2. API 封装 — 禁止裸调用

**Bad**：组件内直接写 fetch，URL 硬编码，无类型，无错误处理。

```tsx
function UserProfile({ id }: { id: string }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetch(`http://api.example.com/users/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(data => setUser(data))
  }, [id])

  return <div>{user?.name}</div>
}
```

**Good**：统一请求实例 + 类型化接口函数。

```typescript
// utils/request.ts
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
  timeout: 10000,
})
request.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
request.interceptors.response.use(
  res => res.data,
  error => {
    if (error.response?.status === 401) redirectToLogin()
    return Promise.reject(error)
  },
)
export default request
```

```typescript
// api/user.ts
export function getUser(id: string): Promise<User> {
  return request.get(`/users/${id}`)
}
```

```tsx
// components/UserProfile.tsx
function UserProfile({ id }: { id: string }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => getUser(id),
  })
  if (isLoading) return <Skeleton />
  return <div>{user?.name}</div>
}
```

---

## 3. 注释规范

**Bad**：冗余叙述 + 裸 TODO。

```typescript
// 定义用户接口
interface User {
  // 用户ID
  id: string
  // 用户名
  name: string
  // 邮箱
  email: string
}

// 获取用户
async function getUser(id: string) {
  // 发送请求
  const res = await request.get(`/users/${id}`)
  // 返回数据
  return res.data
}

// TODO: 优化这个
function calculateDiscount(price: number) {
  return price * 0.8
}
```

**Good**：只注释非显而易见的逻辑 + 规范的 TODO。

```typescript
interface User {
  id: string
  name: string
  email: string
}

async function getUser(id: string): Promise<User> {
  return request.get(`/users/${id}`)
}

/**
 * 折扣率 0.8 是 2024-Q1 促销活动的固定折扣，
 * 活动结束后需替换为后端动态配置。
 */
// TODO(@zhangsan): 迁移到后端动态折扣配置 #PROJ-456
function calculateDiscount(price: number): number {
  return price * 0.8
}
```

---

## 4. 状态管理 — 避免不必要的全局状态

**Bad**：将表单临时状态放入全局 store。

```typescript
// store/formStore.ts
export const useFormStore = defineStore('form', () => {
  const username = ref('')
  const email = ref('')
  const phone = ref('')
  const errors = ref({})
  return { username, email, phone, errors }
})
```

**Good**：表单状态保留在组件内，仅提交结果触发全局更新。

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate'

const { handleSubmit, errors } = useForm({
  validationSchema: userSchema,
})

const onSubmit = handleSubmit(async (values) => {
  await createUser(values)
  userStore.refreshList()
})
</script>
```

---

## 5. 性能 — memo 的正确使用

**Bad**：对所有组件无脑 memo。

```tsx
const Button = React.memo(({ onClick, children }: ButtonProps) => (
  <button onClick={onClick}>{children}</button>
))

const Icon = React.memo(({ name }: { name: string }) => (
  <i className={`icon-${name}`} />
))

const Divider = React.memo(() => <hr />)
```

**Good**：仅在确认渲染瓶颈时 memo，并配合稳定引用。

```tsx
// 只有 ExpensiveChart 渲染成本高且父组件频繁更新，才值得 memo
const ExpensiveChart = React.memo(({ data, config }: ChartProps) => {
  // 复杂的图表渲染逻辑...
  return <canvas ref={bindChart} />
})

function Dashboard() {
  const [filter, setFilter] = useState('')
  const chartConfig = useMemo(() => buildChartConfig(theme), [theme])

  return (
    <>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      <ExpensiveChart data={chartData} config={chartConfig} />
    </>
  )
}
```

---

## 6. 安全 — XSS 防护

**Bad**：直接渲染用户输入的 HTML。

```tsx
// React
function Comment({ content }: { content: string }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />
}
```

```vue
<!-- Vue -->
<template>
  <div v-html="comment.content" />
</template>
```

**Good**：消毒后再渲染。

```tsx
import DOMPurify from 'dompurify'

function Comment({ content }: { content: string }) {
  const clean = DOMPurify.sanitize(content, { ALLOWED_TAGS: ['b', 'i', 'a', 'p'] })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

```vue
<script setup lang="ts">
import DOMPurify from 'dompurify'

const safeContent = computed(() =>
  DOMPurify.sanitize(props.content, { ALLOWED_TAGS: ['b', 'i', 'a', 'p'] })
)
</script>

<template>
  <div v-html="safeContent" />
</template>
```

---

## 7. 组件设计（Vue）— Composable 提取

**Bad**：Vue 组件内混合数据获取与展示逻辑。

```vue
<script setup lang="ts">
const users = ref<User[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)

watch(page, async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/users?page=${page.value}`)
    users.value = res.data.list
  } catch (e) {
    error.value = '加载失败'
  } finally {
    loading.value = false
  }
})

onMounted(() => { /* 同样的 fetch 逻辑再写一遍... */ })
</script>

<template>
  <div v-if="loading">加载中...</div>
  <div v-else-if="error">{{ error }}</div>
  <ul v-else>
    <li v-for="u in users" :key="u.id">{{ u.name }}</li>
  </ul>
  <!-- 200+ 行模板 -->
</template>
```

**Good**：提取 composable + 类型化接口函数。

```typescript
// composables/useUsers.ts
export function useUsers() {
  const page = ref(1)
  const { data, isLoading, error } = useQuery({
    queryKey: computed(() => ['users', page.value]),
    queryFn: () => getUserList({ page: page.value }),
  })
  return {
    users: computed(() => data.value?.list ?? []),
    total: computed(() => data.value?.total ?? 0),
    isLoading,
    error,
    page,
  }
}
```

```vue
<script setup lang="ts">
const { users, isLoading, error, page } = useUsers()
</script>

<template>
  <LoadingSpinner v-if="isLoading" />
  <ErrorFallback v-else-if="error" :error="error" />
  <UserTable v-else :users="users" />
  <Pagination v-model:current="page" />
</template>
```

---

## 8. Hooks / Composables — 副作用清理

**Bad**：未清理定时器和事件监听，组件卸载后仍在执行。

```tsx
// React
function useAutoRefresh(fetchFn: () => void) {
  useEffect(() => {
    const id = setInterval(fetchFn, 5000)
    // 缺少清理！组件卸载后定时器仍在运行
  }, [])
}

function useWindowResize(callback: () => void) {
  useEffect(() => {
    window.addEventListener('resize', callback)
    // 缺少清理！事件监听泄漏
  }, [callback])
}
```

**Good**：始终返回清理函数。

```tsx
// React
function useAutoRefresh(fetchFn: () => void, interval = 5000) {
  useEffect(() => {
    const id = setInterval(fetchFn, interval)
    return () => clearInterval(id)
  }, [fetchFn, interval])
}

function useWindowResize(callback: () => void) {
  useEffect(() => {
    window.addEventListener('resize', callback)
    return () => window.removeEventListener('resize', callback)
  }, [callback])
}
```

```typescript
// Vue
function useAutoRefresh(fetchFn: () => void, interval = 5000) {
  let id: ReturnType<typeof setInterval>
  onMounted(() => { id = setInterval(fetchFn, interval) })
  onUnmounted(() => clearInterval(id))
}
```

---

## 9. 错误处理 — 兜底 UI

**Bad**：API 失败时空白页，无任何提示。

```tsx
function OrderDetail({ id }: { id: string }) {
  const { data: order } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
  })
  return (
    <div>
      <h1>{order.title}</h1>    {/* order 可能为 undefined → 崩溃 */}
      <p>{order.description}</p>
    </div>
  )
}
```

**Good**：处理加载、错误、空数据三种状态。

```tsx
function OrderDetail({ id }: { id: string }) {
  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
  })

  if (isLoading) return <Skeleton />
  if (error) return <ErrorFallback message="订单加载失败" onRetry={refetch} />
  if (!order) return <EmptyState description="订单不存在" />

  return (
    <div>
      <h1>{order.title}</h1>
      <p>{order.description}</p>
    </div>
  )
}
```

---

## 10. 测试 — 测试行为而非实现

**Bad**：测试内部状态和方法调用，耦合实现细节。

```tsx
it('should update state when clicking button', () => {
  const wrapper = shallow(<Counter />)
  // 直接检查内部 state — 耦合实现
  expect(wrapper.state('count')).toBe(0)
  wrapper.instance().handleIncrement()
  expect(wrapper.state('count')).toBe(1)
})
```

**Good**：测试用户行为和可见结果。

```tsx
it('should display incremented count after clicking the button', () => {
  render(<Counter />)

  expect(screen.getByText('Count: 0')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '增加' }))

  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})
```

---

## 11. 无障碍 — 语义化与键盘支持

**Bad**：用 div 模拟按钮，无键盘支持。

```tsx
<div className="btn" onClick={handleClick}>
  提交
</div>

<div className="nav">
  <div onClick={() => goto('/home')}>首页</div>
  <div onClick={() => goto('/about')}>关于</div>
</div>
```

**Good**：语义化元素 + ARIA。

```tsx
<button type="submit" onClick={handleClick}>
  提交
</button>

<nav aria-label="主导航">
  <a href="/home">首页</a>
  <a href="/about">关于</a>
</nav>

{/* 自定义交互组件必须补充 role 和键盘事件 */}
<div
  role="button"
  tabIndex={0}
  aria-label="展开详情"
  onClick={handleToggle}
  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleToggle() }}
>
  详情
</div>
```
