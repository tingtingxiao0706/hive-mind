# Hive-Mind 架构方案

## 一、项目定位

Hive-Mind 是一个 TypeScript 库（npm 包），为 AI Agent 提供按需技能加载与脚本执行能力。兼容 SKILL.md 标准，基于 Vercel AI SDK 构建，复用 @skill-tools 生态，支持模型切换、工作区隔离、技能脚本执行、技能共享，以及 Agent 即技能模式。

**核心价值主张**：通过 `npm install @ai-hivemind/core` 就可以在任意 Node.js 应用中获得 OpenClaw 级别的技能系统能力，同时不绑定任何特定编辑器或模型供应商。

---

## 二、问题背景

当前的 AI 技能系统（OpenClaw、Cursor Skills）都绑定在特定的编辑器或客户端上。如果要构建一个用户可以直接使用 AI 技能的平台，传统做法是在服务端将技能作为 prompt 注入，但这会严重膨胀上下文窗口：

- 20 个技能 × 每个 ~1,250 tokens = **25,000 tokens 基线开销**
- 即使大部分技能根本没被使用，每轮对话都要付这个代价
- 上下文窗口被占满后，LLM 的推理能力显著下降

Hive-Mind 通过**三阶段渐进式技能加载**解决这个问题，将每轮基线开销从 ~25,000 tokens 降低到 ~500 tokens。

---

## 三、核心设计决策

### 3.1 适配器模式 + 内置实现

架构设计了 `SkillParser` 和 `SkillMatcher` 适配器接口，预留了对接 `@skill-tools/core`（SKILL.md 解析）和 `@skill-tools/router`（BM25 路由）的能力。但当前版本（v0.1.0）**全部使用内置实现**，不依赖 @skill-tools：

- **SKILL.md 解析**：`BuiltinAdapter`（基于 `gray-matter`），覆盖 frontmatter 解析、x-hive 扩展提取、文件发现
- **技能路由**：`KeywordAdapter`（关键词匹配 + CJK 分词 + tags 参与评分），<10ms 响应

这一决策基于实测考量：@skill-tools 处于 v0.2.x 阶段，API 可能发生破坏性变更。内置实现已满足核心需求，未来可通过配置 `parser: 'auto'` 和 `router: 'auto'` 切换到 @skill-tools 适配器（仅需实现适配器层，~100-200 行）。

### 3.2 基于 Vercel AI SDK

通过 `ai` 包实现模型抽象，天然支持 OpenAI/Anthropic/Google 等 30+ 供应商切换。

### 3.3 SKILL.md 兼容 + x-hive 扩展

完全兼容 Agent Skills 标准，通过 `x-hive` 命名空间添加扩展字段，不影响其他工具的解析。

### 3.4 分层安全架构

三级安全模型（basic/strict/sandbox），用户按场景选择安全级别。

### 3.5 架构预留浏览器兼容性

当前版本仅支持 Node.js 运行时。但在架构上做以下预留，使未来拆分为浏览器兼容版本的成本最小化：

- **核心逻辑与 I/O 分离**：SkillEngine、SkillRouter、LRU 缓存等核心模块不直接调用 `fs`、`child_process` 等 Node.js API，而是通过注入的 Registry / Executor 接口间接访问
- **条件导出预留**：`package.json` 的 `exports` 字段预留 `browser` 条件，未来可映射到不含 Node.js API 的入口
- **Node.js API 集中隔离**：所有 `fs`、`child_process`、`path` 调用集中在 `registry/local.ts`、`executor/` 目录和适配器层，不散布在核心逻辑中

未来如需浏览器支持，只需新增 `src/index.browser.ts` 入口，排除 LocalRegistry 和 ScriptExecutor，仅导出 SkillEngine + RemoteRegistry + SkillRouter。约 60% 的代码可直接复用。

---

## 四、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      用户应用                                │
│              （Web 平台 / CLI / API 服务）                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    hive-mind 库                              │
│                                                             │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  │
│  │SkillEngine│  │SkillLoader│  │SkillRouter│  │Workspace │  │
│  │  引擎核心  │  │ 技能加载  │  │ 技能路由  │  │Manager   │  │
│  └─────┬────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  │
│        │             │              │              │        │
│  ┌─────┴────┐  ┌─────┴─────┐  ┌─────┴─────┐              │
│  │  Agent   │  │  Script   │  │ Registry  │               │
│  │  Runner  │  │ Executor  │  │ (多源)    │               │
│  └──────────┘  └───────────┘  └───────────┘               │
│                                                             │
│  适配器层：                                                   │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ @skill-tools     │  │ 内置回退适配器    │                  │
│  │ 适配器           │  │ (gray-matter)    │                  │
│  └─────────────────┘  └─────────────────┘                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │ 本地技能    │ │ 远程注册    │ │  Git 仓库  │
     │ (文件系统)  │ │  (HTTP)    │ │            │
     └────────────┘ └────────────┘ └────────────┘
```

### 4.1 引擎编排逻辑（`src/engine.ts`）

`createHiveMind(config)` 是整个库的入口，采用**闭包工厂模式**（非 class），所有状态封在闭包内：

```
createHiveMind(config)
    │
    ├── 子系统初始化
    │   ├── parser    = BuiltinAdapter       ← SkillParser 适配器
    │   ├── matcher   = KeywordAdapter       ← SkillMatcher 适配器
    │   ├── loader    = SkillLoader(LRU)     ← 技能加载 + 缓存
    │   ├── router    = SkillRouter          ← 包装 matcher
    │   ├── executor  = ScriptExecutor?      ← 仅 scripts.enabled 时创建
    │   └── registry  = CompositeRegistry    ← 合并 Local/Remote 注册表
    │
    ├── 闭包状态
    │   ├── skillIndex    : SkillMeta[]      ← Phase 1 扫描结果缓存
    │   ├── callDepth     : number           ← call_skill 递归深度
    │   ├── callSeq       : number           ← call_skill 调用序号
    │   └── callCache     : Map              ← call_skill 去重缓存
    │
    └── 返回 HiveMind 对象
        ├── run(options)       → 非流式执行
        ├── stream(options)    → 流式执行
        ├── list()             → 列出所有技能
        ├── search(query)      → 搜索技能
        ├── install(source)    → 安装远程技能
        └── runtimeStatus()    → 运行时预检状态
```

#### run() / stream() 的三阶段管线

```
用户消息
    │
    ▼  ensureIndex()（惰性单次执行）
Phase 1: registry.scan() → router.buildIndex()
    │    仅加载 name + description，构建路由索引
    │
    ▼  路由或显式指定
Phase 2: router.route(message) → loader.loadFull()
    │    匹配 Top-K 技能 → 加载完整内容（body + scripts）
    │    受 maxActivatedSkills 限制（默认 5）
    │
    ▼  组装 system prompt + tools
Phase 3: generateText() / streamText()
    │    system = 用户 systemPrompt + 各技能的 "## Skill: {name}\n\n{body}"
    │    tools = scriptTools + call_skill
    │    maxSteps = 10（允许多轮工具调用）
    │
    ▼
返回 { text, activatedSkills, toolCalls, usage }
```

#### call_skill 工具的三层保护

`call_skill` 是技能链调用的核心，LLM 可通过它在运行时调用其他技能：

1. **深度限制** — `callDepth >= maxCallDepth`（默认 5）时拒绝，防止递归死循环
2. **去重缓存** — 同一 `skill + message` 的重复调用直接返回缓存结果，应对弱模型重复调工具的问题
3. **序号追踪** — `callSeq` 递增，日志输出 `call_skill #1`, `#2`, `#3` 便于排查

每次顶层 `run()` 调用时（`callDepth === 0`），`callSeq` 和 `callCache` 被重置。

#### resolveParser / resolveMatcher

当前 `resolveParser` 和 `resolveMatcher` 始终返回 `BuiltinAdapter` / `KeywordAdapter`——`'auto'` 分支没有实际区分逻辑，是为未来对接 @skill-tools 预留的空壳。

---

## 五、渐进式加载策略

### 5.1 三阶段加载

不在启动时加载所有技能的完整内容，而是分三个阶段按需加载：

**阶段 1 - 发现（~100 tokens/技能）**：
- 仅加载所有技能的 `name` + `description`
- 构建轻量索引，常驻内存
- 50 个技能仅消耗 ~5,000 tokens

**阶段 2 - 激活（仅匹配的技能加载完整内容）**：
- 关键词路由在 LLM 调用之前匹配 Top-K 技能（<10ms，零 token 消耗）
- 仅对匹配的 1-5 个技能加载完整 SKILL.md
- 同时发现 `scripts/`、`references/`、`assets/` 目录

**阶段 3 - 执行（LLM 驱动）**：
- LLM 按技能指令调用工具（`run_script`、`read_resource` 等）
- ScriptExecutor 在安全边界内执行脚本
- Agent 技能进入多步骤执行循环

### 5.2 技能路由算法

路由的核心任务是：给定用户消息，从所有技能中选出最相关的 Top-K 个。此过程发生在 LLM 调用之前，纯本地计算，零 token 成本。

#### BM25 算法（设计预留）

BM25（Best Matching 25）是经典的信息检索排序算法，广泛用于搜索引擎。对每个技能的 name + description 计算相关性分数，考虑三个因素：

1. **词频（TF）**：查询中的关键词在技能描述中出现越多次，分数越高，但有饱和上限（避免某个词出现 100 次与 10 次差距过大）
2. **逆文档频率（IDF）**：如果一个词在所有技能描述中都很常见（如 "代码"），权重就低；如果只在少数技能中出现（如 "kubernetes"），权重就高
3. **文档长度归一化**：短描述中出现一次关键词，比长描述中出现一次更有意义

BM25 路由可通过 `@skill-tools/router` 包获得（见 3.1 节适配器设计），当前版本未引入。

#### KeywordAdapter（当前实现）

当前使用的是内置 `KeywordAdapter`，它是一种简化的关键词匹配算法：

```
score = 命中的查询 token 数 / 总查询 token 数
```

匹配文本包含技能的 `name`、`description` 和 `tags`。命中方式：
- 完全匹配（token 相同）：+1 分
- 部分匹配（token 互相包含）：+0.5 分
- CJK 子串匹配（中文字符在文本中出现）：+0.3 分

CJK 支持：中文、日文、韩文字符逐字提取 + 相邻双字组合（如 "翻译" 拆为 "翻" + "译" + "翻译"）。

示例：用户输入 "翻译成英文：今天天气真好"，技能 `translator`（tags: `翻译, 英文`）：

```
查询 tokens: [翻, 译, 翻译, 成, 英, 文, 英文, 今, 天, 今天, 天, 气, 天气, 真, 好, 真好]
技能文本 tokens: [translator, translate, i18n, multilingual, 翻, 译, 翻译, 英, 文, 英文, ...]

命中: 翻(1) + 译(1) + 翻译(1) + 英(1) + 文(1) + 英文(1) = 6
score = 6 / 16 = 0.375 → 匹配成功
```

#### KeywordAdapter 实现逻辑（`src/router/adapters/keyword.ts`）

KeywordAdapter 的核心处理流程：

```
用户消息
    │
    ▼ tokenize()
混合分词
    ├── 拉丁文字：按空格/标点分割，过滤单字符
    │   "Deploy to AWS" → ["deploy", "aws"]
    │
    └── CJK 字符：逐字提取 + 相邻双字组合（bigram）
        "翻译成英文" → 单字 [翻, 译, 成, 英, 文]
                      + 双字 [翻译, 译成, 成英, 英文]
    │
    ▼ computeScore() — 对每个查询 token 依次尝试三级匹配
技能的可搜索文本 = name + description + tags（拼接后 tokenize）

  优先级 1: 完全匹配 — textTokens.has(queryToken)           → +1.0
  优先级 2: 部分包含 — token 互相 includes                   → +0.5
            例如 "deploy" ↔ "deployment"
  优先级 3: CJK 子串兜底 — 整段文本 text.includes(cjkToken)  → +0.3
            例如单字 "翻" 在 "翻译文本" 中存在
    │
    ▼
score = 总 hits / 查询 token 数    → 归一化到 [0, 1]
    │
    ▼ match()
按 score 降序排序 → filter(score > 0) → slice(0, topK)
```

**分词设计取舍**：没有引入 jieba 等分词库，而是用逐字 + 双字组合模拟 bigram 分词。对短文本（技能 name + description 通常 10-30 字）效果足够好，避免了额外依赖。

#### 两种算法对比

| | BM25（@skill-tools/router） | KeywordAdapter（当前内置） |
|---|---|---|
| 算法 | 完整 BM25 公式（TF 饱和 + IDF + 长度归一化） | 关键词命中率（hits / totalTokens） |
| 精度 | 更高，技能数量多时区分度更好 | 够用，技能数量少时表现良好 |
| CJK 支持 | 未知 | 已实现（逐字 + 双字组合） |
| Tags 参与评分 | 需确认 | 是（SkillMeta.tags 纳入匹配文本） |
| 额外依赖 | `@skill-tools/router` | 无 |
| 性能 | <10ms | <10ms |

### 5.3 加载策略配置

```typescript
loading: {
  strategy: 'progressive',  // 'eager' | 'progressive' | 'lazy'
  maxActivatedSkills: 5,    // 单次最多激活技能数
  cacheSize: 50,            // LRU 缓存技能数量
}
```

三种策略均已在 `src/engine.ts` 的 `resolveSkillContents()` 中实现：

- **`progressive`**（默认）：三阶段按需加载——`ensureIndex()` 扫描元数据 → 路由匹配 Top-K → `loadFull()` 按需加载。适合通用场景。
- **`eager`**：首次 `ensureIndex()` 时预加载所有技能的完整内容到独立 `eagerContents` Map（不受 LRU cacheSize 限制），后续 `run()`/`stream()` 路由匹配后直接从缓存取值，跳过 `loadFull()` 调用。仍受 `maxActivatedSkills` 限制，不会把所有技能注入 system prompt。适合技能数量少（<10）的场景。
- **`lazy`**：当 `run({ skills: [...] })` 显式指定技能时，跳过 Phase 1 索引扫描和 Phase 2 路由匹配，直接通过 `registry.load(name)` 按名称加载。未指定 skills 时优雅回退到 progressive 行为（记录 warn 日志）。`list()` 和 `search()` 仍正常触发索引扫描。适合技能数量极大（100+）且调用方已知目标技能的场景。

### 5.4 Token 消耗对比验证

#### 测试方法

使用 `demo-hive-mind/src/benchmark.ts` 进行 A/B 对比测试，两种模式使用相同模型、相同查询，对比真实 API 返回的 token 消耗：

- **传统模式（Eager）**：每次请求通过 `skills: allSkillNames` 强制加载全部技能到 system prompt
- **渐进式（Progressive）**：不指定 skills，由 `KeywordAdapter` 路由器仅匹配相关技能
- **排除干扰**：设置 `maxCallDepth: 0` 禁用技能链调用，纯粹对比加载策略差异

#### 实测数据（6 个技能，OpenRouter 免费模型）

**技能 body 总量**：

| 技能 | Body 字符数 | 估算 Tokens |
|------|-----------|------------|
| code-reviewer | 776 | 194 |
| json-tools | 777 | 195 |
| smart-assistant | 803 | 201 |
| summarizer | 643 | 161 |
| text-analyzer | 568 | 142 |
| translator | 541 | 136 |
| **合计** | **4,108** | **~1,027** |

**典型查询对比**（查询："总结以下内容的核心要点：Kubernetes 是一个开源容器编排平台…"）：

| 指标 | 传统模式 | 渐进式 | 节省 |
|------|---------|--------|------|
| Prompt tokens | 3,249 | 836 | **74.3%** |
| Total tokens | 3,642 | 1,263 | **65.3%** |
| 加载技能数 | 6（全部） | 2（summarizer, json-tools） | -4 |

#### Token 消耗的数学模型

```
传统模式：  prompt_tokens = Σ(all_skills_body) + user_message  → O(N)
渐进式：    prompt_tokens = Σ(matched_skills_body) + user_message → O(k)

其中 N = 注册技能总数，k = 路由匹配数（通常 1-3，不随 N 增长）
```

#### 规模化预测

假设每个技能 body 平均 ~170 tokens，渐进式每次请求激活 1-3 个技能：

| 注册技能数 | 传统 prompt/请求 | 渐进 prompt/请求 | 节省 |
|-----------|----------------|----------------|------|
| 10 | 1,712 | ~342 | **80%** |
| 20 | 3,423 | ~342 | **90%** |
| 50 | 8,558 | ~342 | **96%** |
| 100 | 17,117 | ~342 | **98%** |
| 200 | 34,233 | ~342 | **99%** |

**核心结论**：渐进式加载的节省随技能数量线性增长。技能注册越多，每次请求节省越大。在 50+ 技能的生产场景下，单次请求可节省 **8,000+ prompt tokens**。

#### 运行 benchmark

```bash
cd demo-hive-mind
npx tsx src/benchmark.ts
```

修改 `src/benchmark.ts` 中的 `MODEL` 常量可切换到不同模型测试。在 `skills/` 下添加更多技能可验证规模化效果。

---

## 六、技能脚本执行机制

### 6.1 技能目录结构（遵循 SKILL.md 标准）

```
code-formatter/
├── SKILL.md                  # 必需：元数据 + 指令
├── scripts/                  # 可选：可执行脚本
│   ├── format.sh             # Shell 脚本
│   ├── lint.py               # Python 脚本（支持 PEP 723 内联依赖）
│   └── analyze.ts            # Deno/Bun 脚本
├── references/               # 可选：参考文档（按需读取）
│   └── style-guide.md
└── assets/                   # 可选：模板和静态资源
    └── .prettierrc.json
```

### 6.2 ScriptExecutor 设计

技能中包含脚本时，引擎自动为 LLM 注入脚本相关工具：

- `run_script` -- 执行技能目录中的脚本
- `read_resource` -- 读取技能目录中的参考文档或资源文件
- `list_skill_files` -- 列出当前技能目录中的脚本和资源文件

LLM 根据技能指令决定何时、如何调用这些工具。

#### ScriptExecutor 执行管线（`src/executor/index.ts`）

`ScriptExecutor.execute()` 实现了一个 **9 步安全管线**，根据安全级别决定走哪些步骤：

```
LLM 调用 run_script 工具
    │
    ▼  Step 1-3（所有安全级别都执行）
┌─────────────────────────────────────────────────┐
│ Step 1: validatePath()        路径穿越防护       │
│         将相对路径解析为绝对路径，拒绝 "../"     │
│ Step 2: validateAllowedTools() 白名单校验        │
│         检查脚本是否在 allowed-tools 声明中      │
│ Step 3: getExtension()        解析扩展名         │
└─────────────────────────────────────────────────┘
    │
    ▼  Step 4（strict / sandbox）
┌─────────────────────────────────────────────────┐
│ Step 4: onApproval()          用户审批回调        │
│         回调返回 false → 返回 exitCode=-1        │
└─────────────────────────────────────────────────┘
    │
    ├─── sandbox + JS 脚本 ──────────────────┐
    │                                         ▼
    │                                   ┌───────────┐
    │                                   │ Step 5:   │
    │                                   │ Sandbox   │ → V8 vm 沙盒执行
    │                                   │ Executor  │   不启动子进程
    │                                   └───────────┘   直接返回结果
    │
    ▼  basic / strict（或 sandbox 非 JS 回退）
┌─────────────────────────────────────────────────┐
│ Step 6: RuntimeResolver.resolve()               │
│         根据扩展名选择策略链：                    │
│         .py → uv > pipx > python3 > 报错        │
│         .sh → bash > sh > 报错                   │
│         .ts → deno > bun > npx tsx > 报错        │
│         .js → node > 报错                        │
│ Step 7: validateRuntime()     运行时白名单        │
│         strict/sandbox 检查 strategy.runtime     │
│ Step 8: buildEnv()            环境变量构建        │
│         basic: 继承全部 + 覆盖                    │
│         strict: 仅 PATH/HOME/LANG + 显式传入     │
│ Step 9: execa()               子进程执行          │
│         参数以数组传递，不经 shell 解析            │
│         reject: false → 非零退出码不抛异常        │
│         输出经 truncateOutput() 截断              │
└─────────────────────────────────────────────────┘
    │
    ▼
返回 { exitCode, stdout, stderr }
```

**三级安全的步骤覆盖对比**：

| 步骤 | basic | strict | sandbox |
|------|-------|--------|---------|
| Step 1-3: 路径/白名单/扩展名 | ✓ | ✓ | ✓ |
| Step 4: 用户审批 | — | 可选 | 可选 |
| Step 5: V8 沙盒 | — | — | JS 走沙盒 |
| Step 7: 运行时白名单 | — | ✓ | ✓ |
| Step 8: 环境变量隔离 | 继承全部 | 最小集 | 最小集 |

**协作关系**：engine.ts 的 `buildToolsForSkills()` 调用 `createSkillTools(executor, skill)` 生成 LLM 可调用的 tool 定义，tool handler 内部调用 `ScriptExecutor.execute()`。

### 6.3 跨语言运行时解析（RuntimeResolver）

Hive-Mind 是 TypeScript 库运行在 Node.js 环境中，但技能脚本可能是 Python、Bash、Go 等任意语言。这带来四个子问题：

1. **运行时在不在？** -- 目标语言的解释器是否已安装
2. **版本对不对？** -- 版本是否满足技能声明的 `compatibility` 要求
3. **依赖有没有？** -- 脚本所需的第三方包是否已安装
4. **跨平台兼容吗？** -- Windows / macOS / Linux 的命令差异

通过 `RuntimeResolver` 模块统一解决，核心流程如下：

```
脚本文件（如 lint.py）
    │
    ▼
RuntimeResolver 探测
    ├── 1. 根据扩展名 / shebang 确定目标运行时
    ├── 2. 跨平台检测系统中是否安装（Windows: where / Unix: which）
    ├── 3. 版本校验（与 SKILL.md compatibility 字段比对）
    ├── 4. 分析脚本内联依赖（PEP 723 等）
    └── 5. 选择最优执行策略（策略链逐级回退）
            │
            ▼
    执行策略链（按优先级尝试）
    ┌─────────────────────────────────────────────────────┐
    │ 策略 1: uv run scripts/lint.py                      │ ← 最优：自动隔离环境 + 安装依赖
    │ 策略 2: pipx run scripts/lint.py                    │ ← 备选：传统隔离执行
    │ 策略 3: python3 scripts/lint.py                     │ ← 回退：直接执行（无依赖管理）
    │ 策略 4: 报错 → 告知用户需要安装 Python + 安装指引   │ ← 兜底：清晰错误信息
    └─────────────────────────────────────────────────────┘
```

#### 6.3.1 运行时探测

```typescript
// src/executor/runtime.ts

interface RuntimeInfo {
  name: string;           // 'python' | 'node' | 'bash' | 'deno' | ...
  command: string;        // 实际可执行命令路径
  version: string;        // 版本号
  available: boolean;
}

interface ExecutionStrategy {
  command: string;        // 最终执行的完整命令
  args: string[];
  runtime: string;        // 使用的运行时工具名
  isolated: boolean;      // 是否在隔离环境中执行
}

class RuntimeResolver {

  // 跨平台探测系统中的运行时
  async detectRuntime(name: string): Promise<RuntimeInfo> {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';

    // 同一运行时在不同平台的命令名可能不同
    const candidates = this.getCandidates(name);
    // 'python' -> ['python3', 'python', 'py']  (Windows 有 py launcher)
    // 'bash'   -> ['bash', 'sh']               (某些系统只有 sh)
    // 'node'   -> ['node']
    // 'deno'   -> ['deno']

    for (const cmd of candidates) {
      try {
        await execa(whichCmd, [cmd]);
        const { stdout } = await execa(cmd, ['--version']);
        return {
          name,
          command: cmd,
          version: this.parseVersion(stdout),  // "Python 3.12.1" -> "3.12.1"
          available: true,
        };
      } catch {
        continue;  // 该命令不存在，尝试下一个
      }
    }

    return { name, command: '', version: '', available: false };
  }

  // 运行时探测结果缓存（同一进程生命周期内只探测一次）
  private cache = new Map<string, RuntimeInfo>();

  async detect(name: string): Promise<RuntimeInfo> {
    if (!this.cache.has(name)) {
      this.cache.set(name, await this.detectRuntime(name));
    }
    return this.cache.get(name)!;
  }
}
```

#### 6.3.2 Python 脚本执行策略链

Python 是最典型的跨语言场景（Node.js 宿主中执行 Python 脚本），执行策略链设计如下：

```typescript
class RuntimeResolver {

  async resolvePython(
    scriptPath: string,
    skillMeta: SkillMeta,
  ): Promise<ExecutionStrategy> {

    // 分析脚本是否声明了 PEP 723 内联依赖
    const inlineDeps = await this.detectPEP723Deps(scriptPath);
    const hasDeps = inlineDeps.length > 0;

    // 策略 1：uv run（最优）
    // - 自动创建临时隔离虚拟环境
    // - 自动安装 PEP 723 声明的依赖
    // - 执行完毕后自动清理
    // - 跨平台：Windows / macOS / Linux 均支持
    const uv = await this.detect('uv');
    if (uv.available) {
      return {
        command: uv.command,
        args: ['run', scriptPath],
        runtime: 'uv',
        isolated: true,
      };
    }

    // 策略 2：pipx run（备选隔离方案）
    // 仅在脚本有依赖时才需要 pipx
    if (hasDeps) {
      const pipx = await this.detect('pipx');
      if (pipx.available) {
        return {
          command: pipx.command,
          args: ['run', scriptPath],
          runtime: 'pipx',
          isolated: true,
        };
      }
    }

    // 策略 3：直接 python3 执行（无依赖管理）
    const python = await this.detect('python');
    if (python.available) {
      // 版本校验
      const required = this.parseVersionRequirement(skillMeta.compatibility);
      if (required && !semver.satisfies(python.version, required)) {
        throw new RuntimeVersionError(
          `技能 "${skillMeta.name}" 需要 Python ${required}，` +
          `但系统安装的是 Python ${python.version}`
        );
      }

      // 有依赖但没有包管理工具，发出警告
      if (hasDeps) {
        this.logger.warn(
          `脚本 ${scriptPath} 声明了 PEP 723 依赖 [${inlineDeps.join(', ')}]，` +
          `但未检测到 uv 或 pipx，依赖可能缺失。\n` +
          `建议安装 uv: https://docs.astral.sh/uv/`
        );
      }

      return {
        command: python.command,
        args: [scriptPath],
        runtime: 'python',
        isolated: false,
      };
    }

    // 策略 4：运行时不可用，给出详细安装指引
    throw new RuntimeNotFoundError(
      `技能 "${skillMeta.name}" 需要 Python 运行时，但系统中未检测到。\n` +
      `安装方式：\n` +
      `  - Python: https://www.python.org/downloads/\n` +
      `  - uv（推荐，自动管理依赖）: https://docs.astral.sh/uv/\n` +
      `    macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh\n` +
      `    Windows: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`
    );
  }

  // 检测 PEP 723 内联依赖声明
  private async detectPEP723Deps(scriptPath: string): Promise<string[]> {
    const content = await fs.readFile(scriptPath, 'utf-8');
    const match = content.match(/# \/\/\/ script\n([\s\S]*?)# \/\/\//);
    if (!match) return [];
    const depsMatch = match[1].match(/# dependencies = \[([\s\S]*?)\]/);
    if (!depsMatch) return [];
    return depsMatch[1]
      .split('\n')
      .map(line => line.replace(/^#\s*"/, '').replace(/".*$/, '').trim())
      .filter(Boolean);
  }
}
```

#### 6.3.3 全运行时策略对照表

| 脚本类型 | 执行策略优先级 | 依赖管理 | 隔离性 |
|---------|---------------|---------|--------|
| `.py`（有 PEP 723 依赖） | `uv run` > `pipx run` > `python3`（警告缺依赖）> 报错 | uv/pipx 自动安装 | uv/pipx 自动隔离 |
| `.py`（无依赖） | `uv run` > `python3` > 报错 | 无需 | 可选 |
| `.sh` | `bash` > `sh` > 报错 | N/A | 无 |
| `.js` | `node` > 报错 | 需要已安装 node_modules | 无 |
| `.ts` | `deno run` > `bun run` > `npx tsx` > 报错 | deno 自动解析 npm: 导入 | deno 自动隔离 |
| `.rb` | `ruby` > 报错 | bundler/inline 内联 | 无 |
| `.go` | `go run` > 报错 | 自动下载模块 | 无 |

#### 6.3.4 跨平台差异处理

| 操作 | Windows | macOS / Linux |
|------|---------|---------------|
| 检测命令是否存在 | `where python` | `which python3` |
| Python 命令名 | `py` > `python` > `python3` | `python3` > `python` |
| Shell 脚本 | 需要 Git Bash 或 WSL | 原生 `bash` / `sh` |
| 路径分隔符 | `\`（内部统一转 `/`） | `/` |
| 换行符 | `\r\n`（脚本输出统一处理） | `\n` |

RuntimeResolver 在内部统一处理这些差异，对上层（ScriptExecutor 和 SkillEngine）透明。

#### 6.3.5 引擎启动时的运行时预检

在 `createHiveMind()` 初始化时，RuntimeResolver 可选地执行预检，提前发现运行时缺失：

```typescript
const hive = createHiveMind({
  scripts: {
    enabled: true,
    allowedRuntimes: ['bash', 'python', 'node'],
    // 启动时预检运行时是否可用（默认 true）
    preflight: true,
  },
  // ...
});

// 如果 preflight: true，初始化时会：
// 1. 检测 bash、python、node 是否可用
// 2. 不可用的运行时发出 warning（不阻塞启动）
// 3. 使用该运行时的脚本在执行时才报错
//
// 预检结果可通过 API 查询：
const status = await hive.runtimeStatus();
// {
//   bash:   { available: true,  version: '5.2.15', command: 'bash' },
//   python: { available: true,  version: '3.12.1', command: 'python3', tools: { uv: true, pipx: false } },
//   node:   { available: true,  version: '20.11.0', command: 'node' },
//   deno:   { available: false, version: '',        command: '' },
// }
```

### 6.4 技能作者：如何编写可靠的跨环境脚本

#### Python 脚本最佳实践

使用 PEP 723 内联依赖，让脚本自包含、可移植：

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.31.0",
#     "rich>=13.0.0",
# ]
# ///

"""API 测试工具 - 无需预装任何 pip 包，uv run 自动处理依赖"""

import sys
import requests
from rich.console import Console

console = Console()

def main():
    if len(sys.argv) < 2:
        console.print("[red]Error: --url is required[/red]")
        console.print("Usage: python scripts/test.py --url https://api.example.com/health")
        sys.exit(1)
    # ... 脚本逻辑

if __name__ == "__main__":
    main()
```

#### 脚本设计原则（遵循 Agent Skills 规范）

1. **禁止交互式输入** -- Agent 在非交互 shell 中运行，不能响应 TTY 提示。所有输入通过参数/环境变量/stdin
2. **提供 `--help`** -- 这是 Agent 学习脚本接口的主要方式，应包含说明、参数、示例
3. **结构化输出** -- 优先 JSON/CSV，避免自由文本。数据发 stdout，诊断信息发 stderr
4. **有意义的退出码** -- 0 成功、1 参数错误、2 运行时错误等，在 `--help` 中说明
5. **幂等性** -- Agent 可能重试命令，"创建如果不存在" 优于 "创建并在重复时失败"
6. **控制输出大小** -- Agent 工具输出通常有截断阈值（10-30K 字符），大输出应支持 `--output FILE`

### 6.5 SKILL.md 中声明脚本和运行时要求

```markdown
---
name: code-formatter
description: 格式化和 lint 检查代码，支持多种语言
compatibility: 需要 Node.js 18+ 和 Python 3.10+，推荐安装 uv
allowed-tools: Bash(scripts/format.sh) Bash(scripts/lint.py)

x-hive:
  scripts:
    approval: false             # 脚本执行是否需要用户审批
    timeout: 60000              # 脚本超时时间（毫秒）
    runtimes: [bash, python]    # 此技能使用的运行时
---

# Code Formatter

## 可用脚本

- **`scripts/format.sh`** — 使用 Prettier 格式化代码
- **`scripts/lint.py`** — 使用 Ruff 检查 Python 代码风格（PEP 723 内联依赖，无需预装）

## 工作流程

1. 先运行 lint 检查：`python3 scripts/lint.py --check .`
2. 再运行格式化：`bash scripts/format.sh --write .`
```

`compatibility` 字段声明的运行时要求会被 RuntimeResolver 解析并校验。`x-hive.scripts.runtimes` 字段告知引擎该技能需要哪些运行时，用于 preflight 预检。

---

## 七、分层安全架构

### 7.1 三级安全模型

**Level 1 - basic（基础防护，适合信任环境）**：
- 路径穿越防护（禁止 `../` 逃逸出技能目录）
- `allowed-tools` 白名单校验
- 超时控制 + 输出截断
- 实现方式：`execa`，零额外依赖

**Level 2 - strict（严格模式，推荐默认）**：
- 包含 Level 1 全部防护
- 运行时白名单（仅允许配置中声明的 bash/python/node 等）
- 环境变量隔离（脚本只能读取显式传入的环境变量）
- 文件系统限制（脚本只能访问技能目录和显式声明的工作目录）
- 网络访问控制（可配置是否允许网络请求）
- 用户审批回调（`onApproval` 钩子，执行前拦截）
- 实现方式：`execa` + 自定义安全层

**Level 3 - sandbox（沙盒模式，适合多租户/不信任场景）**：
- 包含 Level 2 全部防护
- V8 Isolate 隔离执行（Node.js/TS 脚本）
- CPU 时间预算 + 内存上限
- 权限声明制（deny-by-default）
- 实现方式：`secure-exec`（冷启动 ~17ms，单次执行仅 ~3.4MB 开销）
- 非 JS 脚本回退到 strict 模式

### 7.2 安全配置示例

```typescript
const hive = createHiveMind({
  scripts: {
    securityLevel: 'sandbox',
    sandbox: {
      cpuTimeLimitMs: 10_000,
      memoryLimitMb: 128,
      permissions: {
        fs: { read: ['./data/'], write: [] },
        net: false,
        env: ['NODE_ENV', 'API_KEY'],
        childProcess: false,
      },
    },
  },
});
```

---

## 八、模型 API Key 配置

Hive-Mind 本身不管理 API Key，而是通过 Vercel AI SDK 的 Provider 层处理。API Key 的流转路径如下：

```
用户设置环境变量 → Vercel AI SDK Provider 自动读取 → Hive-Mind 调用模型
```

### 8.1 API Key 配置方式

**方式一：环境变量（推荐，适合服务端部署）**

各 Provider 默认从对应的环境变量中读取 API Key，无需在代码中硬编码：

```bash
# .env 文件（不要提交到 Git）
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
GOOGLE_GENERATIVE_AI_API_KEY=AIzaXXXXXXXXXX
```

```typescript
import { openai } from '@ai-sdk/openai';       // 自动读取 OPENAI_API_KEY
import { anthropic } from '@ai-sdk/anthropic';   // 自动读取 ANTHROPIC_API_KEY
import { google } from '@ai-sdk/google';         // 自动读取 GOOGLE_GENERATIVE_AI_API_KEY

const hive = createHiveMind({
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
  },
  // ...
});
```

**方式二：显式传入 API Key（适合多租户平台）**

在多租户场景下，不同用户可能使用不同的 API Key。Vercel AI SDK 支持在创建 Provider 时显式传入：

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

// 为每个用户/租户创建独立的 Provider 实例
function createUserHive(userApiKeys: { openai?: string; anthropic?: string }) {
  const userOpenAI = createOpenAI({ apiKey: userApiKeys.openai });
  const userAnthropic = createAnthropic({ apiKey: userApiKeys.anthropic });

  return createHiveMind({
    models: {
      default: userOpenAI('gpt-4o'),
      reasoning: userAnthropic('claude-sonnet-4-20250514'),
    },
    // ...
  });
}

// 用户 A 使用自己的 Key
const hiveA = createUserHive({ openai: 'sk-proj-userA-xxx' });

// 用户 B 使用自己的 Key
const hiveB = createUserHive({ anthropic: 'sk-ant-userB-xxx' });
```

**方式三：自定义 Provider（适合私有部署/代理）**

对于使用私有模型或 API 代理的场景：

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const customProvider = createOpenAI({
  apiKey: process.env.CUSTOM_API_KEY,
  baseURL: 'https://your-proxy.example.com/v1',  // 自定义 API 地址
});

const hive = createHiveMind({
  models: {
    default: customProvider('your-model-name'),
  },
  // ...
});
```

### 8.2 支持的 Provider 及环境变量

| Provider | npm 包 | 环境变量 | 安装命令 |
|----------|--------|---------|---------|
| OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` | `npm i @ai-sdk/openai` |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` | `npm i @ai-sdk/anthropic` |
| Google | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `npm i @ai-sdk/google` |
| Azure OpenAI | `@ai-sdk/azure` | `AZURE_OPENAI_API_KEY` | `npm i @ai-sdk/azure` |
| Amazon Bedrock | `@ai-sdk/amazon-bedrock` | AWS 凭证链 | `npm i @ai-sdk/amazon-bedrock` |
| Mistral | `@ai-sdk/mistral` | `MISTRAL_API_KEY` | `npm i @ai-sdk/mistral` |
| DeepSeek | `@ai-sdk/deepseek` | `DEEPSEEK_API_KEY` | `npm i @ai-sdk/deepseek` |
| Groq | `@ai-sdk/groq` | `GROQ_API_KEY` | `npm i @ai-sdk/groq` |

所有 Provider 作为 Hive-Mind 的 **peerDependencies**，用户按需安装自己使用的 Provider 即可，不会引入不需要的依赖。

### 8.3 安全注意事项

- **不要在代码中硬编码 API Key**，使用环境变量或密钥管理服务
- **`.env` 文件加入 `.gitignore`**，避免泄露到版本控制
- **多租户场景**：API Key 应存储在加密数据库中，运行时注入
- **Hive-Mind 不中转 Key**：模型调用直接从用户应用到 LLM 供应商，库本身不存储、不传输、不记录 API Key

---

## 九、核心 API 设计

### 9.1 创建实例

```typescript
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

const hive = createHiveMind({
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
  },
  skills: [
    { type: 'local', path: './skills' },
    { type: 'local', path: '~/.hive-mind/skills' },
    { type: 'remote', url: 'https://registry.example.com/skills' },
  ],
  workspace: 'my-project',
  loading: {
    strategy: 'progressive',
    maxActivatedSkills: 5,
    cacheSize: 50,
  },
  scripts: {
    enabled: true,
    securityLevel: 'strict',
    allowedRuntimes: ['bash', 'python', 'node'],
    timeout: 30_000,
    maxOutputSize: 30_000,
  },
});
```

### 9.2 使用技能

```typescript
// 自动路由
const result = await hive.run({
  message: "部署我的应用到 AWS ECS",
  model: 'default',
});

// 显式指定技能
const result = await hive.run({
  message: "编写单元测试",
  skills: ['testing', 'jest-config'],
  model: 'fast',
});

// 流式输出
const stream = await hive.stream({
  message: "重构这段代码",
  skills: ['refactoring'],
  onToolCall: (toolName, args) => {
    console.log(`正在执行: ${toolName}`, args);
  },
  onScriptOutput: (output) => {
    console.log(`脚本输出: ${output.stdout}`);
  },
});
```

### 9.3 技能作为 Agent

```typescript
const result = await hive.run({
  message: "搭建 CI/CD 流水线",
  skills: ['devops-agent'],
});
```

### 9.4 工作区管理

```typescript
const frontendHive = createHiveMind({
  workspace: 'frontend',
  skills: [{ type: 'local', path: './skills/frontend' }],
  models: { default: openai('gpt-4o-mini') },
  scripts: { enabled: true, allowedRuntimes: ['node'] },
});

const backendHive = createHiveMind({
  workspace: 'backend',
  skills: [{ type: 'local', path: './skills/backend' }],
  models: { default: anthropic('claude-sonnet-4-20250514') },
  scripts: { enabled: true, requireApproval: true },
});
```

### 9.5 技能共享

```typescript
await hive.install('awesome-org/react-skills');
await hive.install('https://github.com/user/my-skill.git');

const skills = await hive.list();
const matched = await hive.search('kubernetes deployment');
```

---

## 十、SKILL.md 兼容性

完全支持 [SKILL.md 标准](https://agentskills.io/specification)，扩展字段放在 `x-hive` 命名空间下：

```markdown
---
name: aws-deploy
description: Deploy applications to AWS ECS with proper configuration
compatibility: Requires AWS CLI, Docker, and Node.js 18+
allowed-tools: Bash(scripts/deploy.sh) Bash(scripts/validate.sh)
metadata:
  category: devops
  tags: [aws, ecs, docker, deployment]

x-hive:
  agent: true                    # 此技能作为 Agent 运行
  maxSteps: 15                   # Agent 最大执行步数
  scripts:
    approval: true               # 脚本需要审批
    timeout: 120000              # 超时 120 秒
  models:
    preferred: reasoning         # 首选模型
    fallback: default            # 备选模型
  workspace: backend             # 绑定工作区
---
```

---

## 十一、适配器模式（依赖风险隔离）

### 11.1 SkillParser 适配器

```typescript
// 接口定义
export interface SkillParser {
  parse(filePath: string): Promise<ParseResult>;
  parseContent(content: string, meta: FileMeta): ParseResult;
  resolveFiles(searchPath: string): Promise<string[]>;
  countTokens(text: string): number;
}

// 内置适配器（当前默认，基于 gray-matter）
export class BuiltinAdapter implements SkillParser { ... }

// 预留：@skill-tools 适配器（未实现，未来可通过 parser: 'auto' 启用）
// export class SkillToolsAdapter implements SkillParser { ... }
```

#### BuiltinAdapter 解析逻辑（`src/loader/adapters/builtin.ts`）

BuiltinAdapter 是 SkillParser 接口的唯一实际实现，被整个加载链条的上游调用：

```
LocalRegistry.scan()
    └─ parser.resolveFiles(path)      递归扫描目录找所有 SKILL.md
SkillLoader.loadMeta(path)
    └─ parser.parse(path)             解析 frontmatter → SkillMeta
SkillLoader.loadFull(path)
    └─ parser.parse(path)             解析完整内容 → body + x-hive
```

**四个方法的数据流**：

```
SKILL.md 文件内容
    │
    ├── parse(filePath)         读文件 → 调 parseContent
    │       动态 import('node:fs/promises')
    │       为浏览器兼容预留（见 3.5 节）
    │
    ▼  parseContent(content)    纯逻辑，不涉及 I/O
gray-matter 拆分
    │
    ├── data (YAML frontmatter)          ├── content (Markdown body)
    │   name, description,               │   去掉 frontmatter 的
    │   allowed-tools, metadata,          │   纯 Markdown 正文
    │   x-hive: { ... }                  │   （注入 system prompt）
    │       │                             │
    │       ▼  parseXHive()               │
    │   XHiveConfig                       │
    │   { agent, maxSteps,                │
    │     scripts, models }               │
    │       │                             │
    └───────┴─────────────────────────────┘
                    │
                    ▼
              ParseResult {
                frontmatter,  ← 标准字段 + 透传的额外字段
                body,         ← LLM 指令正文
                xHive,        ← Hive-Mind 扩展配置
              }
```

- `resolveFiles(searchPath)` — 递归 walk 目录，返回所有 `SKILL.md`/`skill.md` 的绝对路径，静默忽略不可读的目录
- `countTokens(text)` — 按 `text.length / 4` 粗估 token 数，仅用于日志

### 11.2 SkillMatcher 适配器

```typescript
// 接口定义
export interface SkillMatcher {
  index(skills: SkillMeta[]): Promise<void>;
  match(query: string, topK?: number): Promise<MatchResult[]>;
}

// 内置关键词匹配适配器（当前默认，支持 CJK 分词 + tags 匹配）
export class KeywordAdapter implements SkillMatcher { ... }

// 预留：@skill-tools/router BM25 适配器（未实现，未来可通过 router: 'auto' 启用）
// export class BM25Adapter implements SkillMatcher { ... }
```

---

## 十二、项目结构

```
hive-mind/
├── package.json
├── tsconfig.json
├── tsup.config.ts              # ESM + CJS 双输出
├── src/
│   ├── index.ts                # 公共 API 导出
│   ├── engine.ts               # SkillEngine 主入口
│   ├── types.ts                # 核心类型定义
│   ├── loader/
│   │   ├── index.ts            # SkillLoader
│   │   ├── extensions.ts       # x-hive 扩展字段解析
│   │   ├── cache.ts            # 内存 LRU 缓存
│   │   └── adapters/
│   │       ├── skill-tools.ts  # @skill-tools/core 适配器
│   │       └── builtin.ts      # 内置 gray-matter 回退
│   ├── registry/
│   │   ├── index.ts            # SkillRegistry 接口
│   │   ├── local.ts            # LocalRegistry
│   │   ├── remote.ts           # RemoteRegistry
│   │   └── composite.ts       # CompositeRegistry
│   ├── router/
│   │   ├── index.ts            # SkillRouter
│   │   ├── semantic.ts         # 可选语义匹配
│   │   └── adapters/
│   │       ├── bm25.ts         # @skill-tools/router 适配器
│   │       └── keyword.ts      # 内置关键词匹配回退
│   ├── executor/
│   │   ├── index.ts            # ScriptExecutor
│   │   ├── runtime.ts          # RuntimeResolver - 跨语言运行时探测 + 策略链
│   │   ├── strategies/
│   │   │   ├── python.ts       # Python 执行策略（uv > pipx > python3）
│   │   │   ├── shell.ts        # Shell 执行策略（bash > sh）
│   │   │   ├── typescript.ts   # TypeScript 执行策略（deno > bun > tsx）
│   │   │   └── generic.ts      # 通用策略（node / ruby / go）
│   │   ├── security.ts         # 安全策略实现（basic / strict / sandbox）
│   │   └── tools.ts            # 注入给 LLM 的脚本工具定义
│   ├── workspace/
│   │   ├── index.ts            # WorkspaceManager
│   │   └── config.ts           # 工作区配置 Schema
│   ├── agent/
│   │   ├── index.ts            # AgentRunner
│   │   ├── loop.ts             # Agent 执行循环
│   │   └── builtin-tools.ts    # 内置 Agent 工具集
│   └── utils/
│       └── logger.ts           # 结构化日志
├── skills/                     # 内置示例技能
│   ├── list-skills/
│   │   └── SKILL.md
│   ├── help/
│   │   └── SKILL.md
│   ├── code-formatter/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── format.sh
│   ├── git-commit/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── analyze.sh
│   ├── api-tester/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── test.py
│   └── project-scaffold/
│       └── SKILL.md            # Agent 技能示例
└── test/
    ├── engine.test.ts
    ├── loader.test.ts
    ├── router.test.ts
    ├── executor.test.ts
    └── integration.test.ts
```

---

## 十三、核心依赖

**核心框架**：
- `ai`（Vercel AI SDK Core）-- 模型抽象、generateText/streamText、工具调用
- `@ai-sdk/openai`、`@ai-sdk/anthropic` 等 -- peerDependencies

**功能依赖**：
- `zod` -- Schema 验证 + tool 参数定义
- `lru-cache` -- 技能缓存
- `execa` -- 子进程执行（脚本调用）
- `gray-matter` -- YAML frontmatter 解析（SKILL.md 解析核心）

**预留（未引入，适配器接口已就绪）**：
- `@skill-tools/core` -- SKILL.md 解析（更严格的 20+ 校验规则）
- `@skill-tools/router` -- BM25 关键词技能路由（比内置 KeywordAdapter 更精准）

**开发依赖**：
- `tsup` -- ESM + CJS 构建
- `vitest` -- 测试
- `typescript` -- 类型系统

---

## 十四、风险分析与解决方案

### 风险 1：脚本安全隔离

**风险**：子进程执行脚本，安全性不如 WASM 沙盒。

**解决**：分层安全架构（basic/strict/sandbox）。阶段 1 实现 basic + strict，阶段 2 引入 secure-exec 实现 sandbox。sandbox 级别使用 V8 Isolate，冷启动 ~17ms，内存 ~3.4MB，支持 CPU/内存限制和 deny-by-default 权限声明。

### 风险 2：缺乏生产验证

**风险**：新项目，用户选型时倾向已验证方案。

**解决**：
1. 5-8 个开箱即用示例技能
2. 测试覆盖率 > 90%
3. 3 行代码最小启动的渐进式采用路径
4. 详细文档 + 集成示例 + 迁移指南

### 风险 3：@skill-tools 依赖不稳定

**风险**：v0.2.2，API 可能发生破坏性变更。

**当前策略**：v0.1.0 版本**未引入 @skill-tools**，全部使用内置实现（`BuiltinAdapter` + `KeywordAdapter`），从根源上规避了依赖风险。

**未来引入路径**：
1. 适配器模式已就绪（`SkillParser` / `SkillMatcher` 接口已定义）
2. 需要时只需实现适配器层（~100-200 行），用户通过 `parser: 'auto'` / `router: 'auto'` 配置启用
3. 内置实现始终作为回退，确保无 @skill-tools 时库仍可正常工作

---

## 十五、实测问题与解决方案

以下为 Demo 项目（Express + OpenRouter 免费模型）实测中暴露的问题及对应修复，供后续开发和使用者参考。

### 15.1 ESM 模块中 `require()` 不可用

**问题**：`buildCallSkillTool` 和 `AgentRunner` 内部使用 `require('zod')` / `require('ai')` 动态加载模块。在 ESM 模式下运行时抛出 `Dynamic require of "zod" is not supported`。

**根因**：`tsup` 同时构建 ESM 和 CJS 两种格式，ESM bundle 中不支持 `require()`。

**解决**：将 `require()` 改为顶层 `import`（`import { z } from 'zod'`、`import { tool } from 'ai'`），在模块加载时静态导入，而非运行时动态加载。

**教训**：库代码中应避免使用 `require()`，即使是延迟加载场景，也应使用 `await import()` 或顶层 `import`。

### 15.2 中文查询无法匹配技能（CJK 分词缺陷）

**问题**：输入 "翻译成英文：今天天气真好" 时，路由器返回 0 个匹配技能。

**根因**：`KeywordAdapter.tokenize()` 按空格拆分文本，对中文完全失效。"翻译成英文今天天气真好" 变成一个超长 token，无法匹配英文的 `translate`、`translator`。

**解决**：重写分词器，增加 CJK 支持：
- 拉丁文字照常按空格分词
- CJK 字符逐字提取 + 相邻双字组合（如 "翻" + "译" + "翻译"）
- 评分时增加 CJK 子串匹配（`text.includes(token)` 兜底）

**同步修复**：`SkillMeta` 新增 `tags?: string[]` 字段，`loadMeta` 从 `frontmatter.metadata.tags` 提取并填入，`KeywordAdapter` 将 tags 纳入匹配文本。之前 tags 只存在 frontmatter 中，路由器完全不可见。

### 15.3 `stream()` 缺少 `call_skill` 工具

**问题**：通过 `/api/stream` 端点使用 `smart-assistant` 编排技能时，流式响应中模型直接回复文字，不调用 `call_skill`。

**根因**：`call_skill` 工具只在 `run()` 方法中注入，`stream()` 方法使用 `buildToolsForSkills()` 但未包含 `call_skill`。Demo 页面使用的是 `/api/stream`。

**解决**：在 `stream()` 中也注入 `call_skill` 工具，与 `run()` 保持一致。

### 15.4 Demo 页面重复请求

**问题**：每次发送消息，日志中出现两套完整的 Phase 1→2→3 流程，技能链被执行两遍。

**根因**：HTML 页面先调 `/api/stream` 流式展示结果，完成后又调 `/api/chat` 获取元数据（activatedSkills、usage），导致整个技能链跑了两次。

**解决**：移除第二次 `/api/chat` 请求，页面改为只使用 `/api/chat`（`generateText` 对多步 tool call 的处理比 `streamText` 更可靠）。

### 15.5 免费模型 tool calling 能力不足

**问题**：使用 `stepfun/step-3.5-flash:free` 模型时：
1. 调了 3 次 `translator` 才调 1 次 `summarizer`（指令说 "EXACTLY ONCE" 无效）
2. `stream()` 模式下模型直接回复文字问用户要更多信息，而不是调用工具
3. 模型将 "..." 结尾的内容误判为不完整，拒绝执行

**根因**：免费模型的 tool calling / function calling 能力弱，无法可靠执行多步工具调用。

**解决**（库层面缓解）：
1. **call_skill 去重缓存**：同一技能 + 相同消息的重复调用自动返回缓存结果，不再实际执行。每次顶层 `run()` 调用重置缓存。
2. **调用序号日志**：`call_skill #1`、`call_skill #2` 序号追踪，方便排查。`[DEDUP]` 标记去重命中。
3. **精简 prompt 约束**：强调 "NEVER ask for clarification"、"Call each skill EXACTLY ONCE"。

**建议**：生产环境使用 tool calling 能力更强的模型（如 GPT-4o-mini、Claude Sonnet），免费模型仅适合基础功能演示。

### 15.6 `callDepth` 日志歧义

**问题**：日志显示 `depth=1` 对所有顺序调用都一样，用户以为 depth 应该递增。

**根因**：`callDepth` 是嵌套深度（用于防止递归死循环），每次 call 完成后 `callDepth--` 回到 0，下次调用又变为 1。顺序调用（非嵌套）depth 始终为 1，这是正确行为。

**解决**：增加 `callSeq` 调用序号计数器，日志改为 `call_skill #N: depth=D, target=xxx`，同时展示序号和深度：
```
call_skill #1: depth=1, target=translator     ← 第 1 次调用，嵌套 1 层
call_skill #2: [DEDUP] skill="translator"     ← 第 2 次调用，去重命中
call_skill #3: depth=1, target=summarizer     ← 第 3 次调用，嵌套 1 层
```

### 15.7 PowerShell 下 JSON 参数转义

**问题**：在 PowerShell 中直接运行 `python json_tool.py validate '{"name":"test"}'` 时，JSON 中的引号被 shell 吞掉，脚本收到无效 JSON。

**根因**：PowerShell 对单引号和双引号的处理与 Bash 不同，嵌套 JSON 的引号转义规则不一致。

**影响范围**：仅影响手动命令行测试，不影响库的 `ScriptExecutor`（通过 `execa` 传参数数组，不经 shell 解析）。

**解决**：测试时使用 Python 测试脚本间接调用，或使用 `execa` 的参数数组模式。

### 15.8 问题汇总表

| 编号 | 问题 | 层级 | 严重性 | 状态 |
|------|------|------|--------|------|
| 15.1 | ESM 中 `require()` 崩溃 | 构建 | 致命 | 已修复 |
| 15.2 | CJK 分词 + tags 不参与匹配 | 路由 | 严重 | 已修复 |
| 15.3 | `stream()` 缺少 `call_skill` | 引擎 | 严重 | 已修复 |
| 15.4 | Demo 重复请求 | Demo | 中等 | 已修复 |
| 15.5 | 免费模型 tool calling 弱 | 外部 | 中等 | 已缓解（去重） |
| 15.6 | depth 日志歧义 | 日志 | 低 | 已修复 |
| 15.7 | PowerShell JSON 转义 | 环境 | 低 | 已说明 |

---

## 十六、实施阶段

### 阶段 1（核心库） — 已完成

初始化项目 → 类型定义 → SkillParser 接口 + 双适配器 → ScriptExecutor (basic + strict) → LocalRegistry → CompositeRegistry → SkillMatcher 接口 + 双适配器 → SkillEngine → WorkspaceManager

交付物：可 `npm install` 使用的基础库。

### 阶段 2（高级特性 + 信任建设） — 已完成

AgentRunner → sandbox 安全级别 → RemoteRegistry → 技能共享 → 5-8 个示例技能 → 测试（覆盖率 > 90%）→ 文档

交付物：功能完整、有示例和文档的 v1.0。

### 阶段 3（远程服务，未来规划）

技能注册中心服务端 → 技能版本管理 → 技能市场 → Docker/gVisor 隔离 → Subagent 并行执行

---

## 十七、测试与验证状态

### 17.1 自动化测试（73/73 通过）

| 测试文件 | 测试数 | 覆盖模块 |
|---------|-------|---------|
| loader.test.ts | 5 | BuiltinAdapter 解析、SkillLoader 加载/缓存 |
| router.test.ts | 8 | KeywordAdapter 关键词匹配、SkillRouter 路由 |
| executor.test.ts | 13 | PEP 723 解析、路径穿越防护、allowed-tools 校验、runtime 白名单、输出截断、strict 环境隔离 |
| sandbox.test.ts | 10 | V8 沙箱执行、CPU 超时、require 阻断、定时器阻断、env 权限控制、网络权限、错误处理 |
| registry.test.ts | 5 | LocalRegistry 扫描/缓存、CompositeRegistry 合并/加载 |
| remote-registry.test.ts | 4 | RemoteRegistry 创建、网络不可达降级、本地缓存回退 |
| extensions.test.ts | 6 | x-hive 扩展解析、部分配置、类型过滤 |
| integration.test.ts | 8 | createHiveMind 集成、技能列表/搜索、远程注册表配置、工作区 |
| **合计** | **73** | |

### 17.2 Demo 实测（Express + OpenRouter）

| 功能 | 验证方式 | 状态 |
|------|---------|------|
| 渐进式三阶段加载 | debug 日志观测 Phase 1→2→3 | ✅ 已验证 |
| 关键词路由（中文） | 中文查询匹配对应技能 | ✅ 已验证 |
| call_skill 技能链 | smart-assistant 编排调用 translator + summarizer | ✅ 已验证 |
| 调用去重缓存 | 日志中 `[DEDUP]` 标记，token 节省 | ✅ 已验证 |
| 多租户模型切换 | 3 用户 × 3 模型（GPT-4o-mini / Claude Haiku / Gemini Flash） | ✅ 已验证 |
| Node.js 脚本执行 | text-analyzer 技能调用 analyze.js | ✅ 已验证 |
| Python 脚本执行 | json-tools 技能调用 json_tool.py | ✅ 已验证 |
| Token 消耗对比 | benchmark.ts A/B 测试，prompt 节省 74.3% | ✅ 已验证 |

### 17.3 待端到端验证（代码已实现，有单元测试，缺少 Demo 集成测试）

| 功能 | 代码位置 | 单元测试 | 缺少的验证 |
|------|---------|---------|-----------|
| 三级安全隔离切换 | executor/security.ts, executor/sandbox.ts | ✅ | Demo 中演示 basic→strict→sandbox 的行为差异 |
| Sandbox 文件系统权限 | sandbox.ts `buildFsProxy` | ✅ | Demo 中实际文件读写的权限拦截 |
| Sandbox 网络权限 | sandbox.ts `permissions.net` | ✅ | Demo 中真实 HTTP 请求的拦截 |
| AgentRunner 多步执行 | agent/index.ts | 无 | Agent 即技能的多步工具调用循环 |
| RemoteRegistry Git 安装 | registry/remote.ts `install()` | 部分 | 实际 git clone 远程技能仓库 |
| PEP 723 依赖自动安装 | executor/runtime.ts | ✅ 解析 | `uv run` 或 `pipx` 实际安装依赖并执行 |
| 脚本审批流程 | security.ts `onApproval` | 无 | Demo 中接入审批 UI 回调 |
