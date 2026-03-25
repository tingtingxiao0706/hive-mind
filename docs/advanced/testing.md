# 测试与验证

## 自动化测试

108 个测试全部通过，覆盖核心模块：

| 测试文件 | 测试数 | 覆盖模块 |
|---------|-------|---------|
| loader.test.ts | 16 | BuiltinAdapter 解析、SkillLoader 加载/缓存、linkedFiles 提取（相对路径/HTTP 过滤/不存在文件/去重/e2e） |
| router.test.ts | 8 | KeywordAdapter 关键词匹配、SkillRouter 路由 |
| executor.test.ts | 20 | PEP 723 解析、路径穿越防护、allowed-tools 校验、runtime 白名单、输出截断、strict 环境隔离、read_resource linkedFiles 白名单 |
| sandbox.test.ts | 11 | V8 沙箱执行、CPU 超时、require 阻断、定时器阻断、env 权限控制、网络权限、错误处理 |
| registry.test.ts | 7 | LocalRegistry 扫描/缓存、CompositeRegistry 合并/加载 |
| remote-registry.test.ts | 5 | RemoteRegistry 创建、网络不可达降级、本地缓存回退 |
| extensions.test.ts | 6 | x-hive 扩展解析、部分配置、类型过滤 |
| integration.test.ts | 24 | createHiveMind 集成、技能列表/搜索、远程注册表配置、工作区、加载策略、运行时预检、适配器切换 |
| llm-routed.test.ts | 11 | llm-routed 策略创建、技能目录注入、activate_skill 工具、两阶段调用、去重/数量限制、catalogueTokenBudget |

运行测试：

```bash
npm test              # 运行全部测试
npm run test:watch    # 监听模式
```

## Demo 实测

使用 Express + OpenRouter 免费模型进行的端到端验证：

| 功能 | 状态 |
|------|------|
| 渐进式三阶段加载 | ✅ debug 日志观测 Phase 1→2→3 |
| 关键词路由（中文） | ✅ 中文查询匹配对应技能 |
| call_skill 技能链 | ✅ smart-assistant 编排 translator + summarizer |
| 调用去重缓存 | ✅ `[DEDUP]` 标记，节省 token |
| 多租户模型切换 | ✅ 3 用户 × 3 模型 |
| Node.js 脚本执行 | ✅ text-analyzer → analyze.js |
| Python 脚本执行 | ✅ json-tools → json_tool.py |
| Token 消耗对比 | ✅ prompt 节省 74.3% |
| LLM 驱动路由 | ✅ llm-routed 策略两阶段调用、无技能时直接回答 |

## Token 消耗 Benchmark

使用 `demo-hive-mind/src/benchmark.ts` 对比传统模式与渐进式加载的真实 token 消耗：

```bash
cd demo-hive-mind
npx tsx src/benchmark.ts
```

实测结果（6 技能，OpenRouter 免费模型）：

| 指标 | 传统模式 | 渐进式 | 节省 |
|------|---------|--------|------|
| Prompt tokens | 3,249 | 836 | **74.3%** |
| Total tokens | 3,642 | 1,263 | **65.3%** |

## 待端到端验证

以下功能代码已实现并有单元测试，但尚未在 Demo 中做端到端集成测试：

| 功能 | 单元测试 | 缺少的验证 |
|------|---------|-----------|
| 三级安全隔离切换 | ✅ | Demo 中演示 basic→strict→sandbox 行为差异 |
| Sandbox 文件系统权限 | ✅ | 实际文件读写的权限拦截 |
| Sandbox 网络权限 | ✅ | 真实 HTTP 请求的拦截 |
| AgentRunner 多步执行 | 无 | Agent 即技能的多步工具调用循环 |
| RemoteRegistry Git 安装 | 部分 | 实际 git clone 远程技能仓库 |
| PEP 723 依赖自动安装 | ✅ 解析 | `uv run` 实际安装依赖并执行 |
| 脚本审批流程 | 无 | Demo 中接入审批 UI 回调 |
