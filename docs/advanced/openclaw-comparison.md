# Hive-Mind 与 OpenClaw (Claude Code) 对比分析

## 一、本质区别

| | OpenClaw (Claude Code) | Hive-Mind |
|---|---|---|
| **是什么** | 一个完整的 AI 终端应用（CLI Agent） | 一个可嵌入的 TypeScript 库（npm 包） |
| **谁用** | 开发者在终端中直接交互 | 开发者把它集成到自己的应用中 |
| **运行方式** | `claude` 命令启动，独立进程 | `import { createHiveMind }` 嵌入代码 |
| **类比** | 像浏览器（Chrome） | 像浏览器引擎（Chromium 内核） |

核心区别一句话总结：**OpenClaw 是产品，Hive-Mind 是引擎。**

---

## 二、逐层对比

### 2.1 模型绑定

**OpenClaw**：
- 绑定 Claude 模型（Anthropic API）
- SDK 支持自定义 provider，但核心为 Claude 优化
- 切换模型需要修改 provider 配置

**Hive-Mind**：
- 模型无关（通过 Vercel AI SDK 抽象）
- 同一套技能可以用 GPT-4o、Claude、Gemini、本地模型运行
- 同一次会话中不同技能可以用不同模型
- 技能可在 SKILL.md 中声明首选模型和备选模型

**场景差异**：如果你在做一个平台，用户 A 想用 GPT-4o，用户 B 想用 Claude，OpenClaw 做不到，Hive-Mind 天然支持。

---

### 2.2 技能加载方式

**OpenClaw**：
- 启动时加载所有技能的 name + description 到 system prompt
- Claude 自己判断该用哪个技能（消耗 token）
- 用户确认后加载完整 SKILL.md
- 技能指令作为 prompt 的一部分发给 Claude

**Hive-Mind**：
- 同样的三阶段渐进式加载（发现 -> 激活 -> 执行）
- 额外提供 BM25 自动路由（用户不需要手动激活）
- 技能路由可以不经过 LLM（<10ms，零 token 开销）
- 在 LLM 调用之前就完成了技能匹配

**关键差异**：OpenClaw 需要 Claude 消耗 token 来判断使用哪个技能，Hive-Mind 的 BM25 路由在 LLM 调用之前就完成了匹配，节省上下文。

---

### 2.3 技能执行架构

**OpenClaw 执行流**：

```
用户输入 → Claude 判断技能 → 加载 SKILL.md 到 prompt → Claude 调用 Tool → 执行内置工具 → 结果返回 Claude → 可能 spawn Subagent
```

**Hive-Mind 执行流**：

```
用户输入 → BM25 路由匹配（无 LLM） → 加载 SKILL.md + 发现 scripts/ → 注入技能指令 + 脚本工具 → 任意 LLM 调用工具 → ScriptExecutor 执行脚本 → 结果返回 LLM → 如果是 Agent 技能则循环
```

---

### 2.4 工具系统

**OpenClaw** 有一套固定的内置工具集：

| 工具 | 说明 |
|------|------|
| `Bash` | 执行 shell 命令 |
| `Read` / `Write` | 文件读写 |
| `Edit` | 文件编辑 |
| `Glob` / `Grep` | 文件搜索 |
| `Agent` (Subagent) | 子 Agent 调用 |
| `Skill` | 技能执行 |
| MCP 工具 | 通过 MCP Server 扩展 |

**Hive-Mind** 的工具是动态注入的：

| 工具类型 | 说明 |
|---------|------|
| 基础工具 | `run_script`、`read_resource`、`list_skill_files` |
| 技能自带工具 | 每个技能可以通过 `x-hive.tools` 声明额外工具 |
| Agent 工具 | Agent 技能拥有自己的工具链 |
| 自定义工具 | 用户通过配置注入自定义工具 |

---

### 2.5 Subagent / Agent-as-Skill

| 维度 | OpenClaw | Hive-Mind |
|------|---------|-----------|
| 子 Agent | 原生支持（`Agent` 工具） | 通过 `x-hive.agent: true` 声明 |
| 上下文隔离 | 子 Agent 有独立对话，仅返回最终结果 | Agent 技能在独立执行循环中运行 |
| 并行执行 | 支持多个 Subagent 并行 | 阶段 1 串行，后续可扩展并行 |
| 工具限制 | Subagent 可限定 `allowedTools` | Agent 技能通过 `x-hive.tools` 限定 |
| 创建方式 | 内置通用 / 文件系统 / 编程式 | SKILL.md 声明式 |

OpenClaw 的 Subagent 系统更成熟（上下文隔离、并行执行），Hive-Mind 的 AgentRunner 需要在阶段 2 逐步追赶。

---

### 2.6 平台与分发

**OpenClaw**：

```
┌─────────────────────────┐
│ Claude Code CLI (终端)    │ ← 唯一入口
│ + SDK (可编程调用)        │
│ + MCP Server (工具扩展)   │
└─────────────────────────┘
技能只能在 Claude Code 或兼容编辑器中使用
```

**Hive-Mind**：

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Web 平台后端   │ │ CLI 工具      │ │ API 服务      │ ← 任意入口
│ (Next.js等)   │ │ (自定义)      │ │ (Express等)   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┴────────────────┘
                        │
                 ┌──────┴──────┐
                 │  hive-mind   │ ← npm install
                 │  (库)        │
                 └─────────────┘
同一套技能在任何 Node.js 应用中复用
```

---

### 2.7 工作区隔离

**OpenClaw**：
- 一个 session 一个上下文
- 没有工作区概念
- `CLAUDE.md` 提供项目级配置，但不能做多租户隔离
- 不适合 SaaS 场景

**Hive-Mind**：
- 原生工作区隔离
- 不同工作区有独立的技能集、模型配置、脚本安全策略
- 每个工作区可以限制运行时（如前端工作区只允许 Node 脚本）
- 适合多租户 SaaS 场景

---

### 2.8 安全模型

| 维度 | OpenClaw | Hive-Mind |
|------|---------|-----------|
| 权限控制 | `allowed-tools` 白名单 + 用户审批弹窗 | 三级安全（basic/strict/sandbox） |
| 脚本沙盒 | 无（直接执行 Bash） | strict 级环境隔离 + sandbox 级 V8 Isolate |
| 网络控制 | 无限制 | sandbox 级可禁止网络 |
| 多租户安全 | 不适用（单用户 CLI） | 设计目标场景 |
| CPU/内存限制 | 无 | sandbox 级支持 CPU 时间预算和内存上限 |

---

### 2.9 MCP 集成

**OpenClaw**：
- 原生支持 MCP Server 连接
- `mcp__[server-name]__*` 命名约定
- 支持 STDIO、HTTP、SSE 传输
- MCP 工具自动发现

**Hive-Mind（阶段 1 暂不实现，可作为后续扩展）**：
- 技能可以通过 `x-hive.tools` 声明 MCP 工具依赖
- RemoteRegistry 可以对接 MCP 资源服务器
- 与 MCP 生态互补而非竞争

---

## 三、适用场景对比

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 开发者在终端中使用 AI 辅助编码 | **OpenClaw** | 开箱即用，与 Claude 深度集成 |
| 构建 Web 平台让用户直接使用 AI 技能 | **Hive-Mind** | 可嵌入库，多模型，工作区隔离 |
| 在现有 Node.js 应用中嵌入技能系统 | **Hive-Mind** | npm install 即用，API 简洁 |
| 需要支持多个 LLM 供应商 | **Hive-Mind** | 模型无关，Vercel AI SDK 抽象 |
| 多租户 SaaS 平台 | **Hive-Mind** | 工作区隔离 + 分层安全 |
| 对安全性要求极高（金融/医疗） | **Hive-Mind** (sandbox) | V8 Isolate + 权限声明制 |
| 快速原型验证 | **OpenClaw** | 零配置，即时使用 |
| 技能开发和测试 | **OpenClaw** | 技能生态成熟，调试方便 |

---

## 四、关系定位

Hive-Mind 不是要替代 OpenClaw。两者的关系是：

> **Hive-Mind 把 OpenClaw 的核心技能理念从产品中提取出来，变成一个可嵌入的、模型无关的引擎库。**

- OpenClaw 定义了技能标准（SKILL.md），Hive-Mind 遵循并扩展这个标准
- OpenClaw 的技能可以直接在 Hive-Mind 中使用（SKILL.md 兼容）
- Hive-Mind 扩展了 `x-hive` 字段，但不影响 OpenClaw 的解析
- 两者可以共享同一个技能生态

---

## 五、OpenClaw 的优势领域（Hive-Mind 需要追赶的）

1. **Subagent 并行执行**：OpenClaw 可以同时 spawn 多个子 Agent 并行工作，Hive-Mind 阶段 1 仅支持串行
2. **上下文隔离深度**：OpenClaw 的 Subagent 有完全独立的对话上下文，Hive-Mind 的 Agent 技能隔离还需完善
3. **MCP 生态集成**：OpenClaw 原生支持 MCP，Hive-Mind 需要后续扩展
4. **社区和生态**：OpenClaw 生态成熟（编辑器集成、技能市场、社区活跃），Hive-Mind 需要从零建设
5. **生产环境验证**：OpenClaw 已被大量开发者和企业验证，Hive-Mind 是新项目
