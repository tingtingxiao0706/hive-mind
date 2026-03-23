# Hive-Mind

AI Agent 按需技能加载引擎。通过 `npm install` 即可在任意 Node.js 应用中获得 OpenClaw 级别的技能系统能力，不绑定特定编辑器或模型供应商。

## 特性

- **渐进式加载** — 三阶段按需加载（发现 → 激活 → 执行），将 20 个技能的基线开销从 ~25,000 tokens 降到 ~500 tokens
- **模型切换** — 基于 Vercel AI SDK，支持 OpenAI / Anthropic / Google 等 30+ 供应商
- **SKILL.md 兼容** — 完全兼容 [Agent Skills 标准](https://agentskills.io/specification)，通过 `x-hive` 扩展添加高级功能
- **跨语言脚本执行** — 技能可包含 Python / Bash / Node.js / Deno / Go 脚本，自动探测运行时
- **分层安全** — basic / strict / sandbox 三级安全模型
- **工作区隔离** — 不同工作区独立配置技能集、模型和安全策略
- **技能即 Agent** — 技能可声明为自主 Agent，拥有工具链和多步执行循环
- **技能链调用** — 技能运行时可通过 `call_skill` 工具委托子任务给其他技能，支持深度限制和去重
- **跨技能文件引用** — SKILL.md body 中的 markdown 链接自动识别，LLM 可按需读取链接文件

## 快速开始

### 安装

```bash
npm install @ai-hivemind/core ai @ai-sdk/openai
```

### 5 分钟上手

```typescript
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

// 单次调用
const result = await hive.run({
  message: '帮我格式化代码',
});
console.log(result.text);

// 流式输出
const stream = await hive.stream({
  message: '分析这段代码的风格问题',
});
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### 环境变量

```bash
# .env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

Vercel AI SDK Provider 自动从对应的环境变量中读取 API Key，无需在代码中硬编码。

## 核心概念

### 渐进式加载

```
阶段 1: 发现    → 仅加载 name + description（~100 tokens/技能）
阶段 2: 激活    → BM25 路由匹配，仅加载 Top-K 技能的完整内容
阶段 3: 执行    → LLM 驱动，按需调用脚本工具
```

支持三种加载策略：

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| `progressive` (默认) | 路由匹配后按需加载 | 通用场景 |
| `eager` | 启动时预加载所有技能 | 技能少、要求低延迟 |
| `lazy` | 跳过索引，显式指定技能直接加载 | 已知使用哪个技能 |

### 技能目录结构

```
my-skill/
├── SKILL.md              # 必需：元数据 + LLM 指令
├── scripts/              # 可选：可执行脚本
│   ├── run.sh
│   └── analyze.py
├── references/           # 可选：参考文档（可通过 read_resource 读取）
│   └── guide.md
└── assets/               # 可选：模板和静态资源
    └── config.json
```

技能的 SKILL.md body 中可以通过 markdown 链接引用其他目录的文件（如 `[rules](../shared/rules.md)`），引擎会自动识别这些链接并允许 LLM 按需读取。

### SKILL.md 格式

```markdown
---
name: my-skill
description: What this skill does
compatibility: Requires Python 3.10+
allowed-tools: Bash(scripts/run.sh)

x-hive:
  agent: true
  maxSteps: 10
  scripts:
    approval: false
    timeout: 60000
    runtimes: [bash, python]
  models:
    preferred: reasoning
---

# My Skill

Instructions for the LLM...
```

### 跨技能文件引用

技能可以在 body 中通过 markdown 链接引用其他目录的文件：

```markdown
## 工作流

1. 加载通用规则 → [common-rules.md](../shared-standards/common-rules.md)
2. 加载框架规则 → [react-rules.md](../shared-standards/react-rules.md)
```

引擎在加载技能时自动提取这些链接，将目标文件加入 `read_resource` 的访问白名单。LLM 按照 body 中的工作流指示，在需要时调用 `read_resource` 读取文件内容。无需额外配置，技能作者只需正常写 markdown 链接即可。

## API 参考

### `createHiveMind(config)`

创建 HiveMind 实例。

```typescript
const hive = createHiveMind({
  // 模型配置（必需）
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
  },

  // 技能来源（必需）
  skills: [
    { type: 'local', path: './skills' },
  ],

  // 工作区名称（可选）
  workspace: 'my-project',

  // 加载策略（可选）
  loading: {
    strategy: 'progressive',   // 'eager' | 'progressive' | 'lazy'
    maxActivatedSkills: 5,     // 注入 system prompt 的最大技能数
    routerTopK: 5,             // 路由匹配返回的候选技能数
    cacheSize: 50,
  },

  // 脚本执行配置（可选）
  scripts: {
    enabled: true,
    securityLevel: 'strict',   // 'basic' | 'strict' | 'sandbox'
    allowedRuntimes: ['bash', 'python', 'node'],
    timeout: 30_000,
    maxOutputSize: 30_000,
    requireApproval: false,
    preflight: true,           // 首次执行前预检运行时可用性
  },

  // 解析器/路由器（可选）
  parser: 'auto',             // 'auto' | 'builtin'
  router: 'auto',             // 'auto' | 'builtin'

  // 技能链调用深度限制（可选，默认 5）
  maxCallDepth: 5,

  // 日志级别（可选，默认 'warn'）
  logLevel: 'info',           // 'debug' | 'info' | 'warn' | 'error' | 'silent'
});
```

### `hive.run(options)`

执行单次技能调用。

```typescript
const result = await hive.run({
  message: '部署应用到 AWS',
  model: 'reasoning',           // 使用 reasoning 模型
  skills: ['aws-deploy'],       // 显式指定技能（可选，默认自动路由）
  systemPrompt: '额外的系统指令',  // 可选
  maxTokens: 4096,
});

console.log(result.text);              // LLM 响应
console.log(result.activatedSkills);   // 激活的技能列表
console.log(result.toolCalls);         // 工具调用记录
console.log(result.usage);             // Token 用量
```

### `hive.stream(options)`

流式技能调用。

```typescript
const stream = await hive.stream({
  message: '重构代码',
  onToolCall: (name, args) => {
    console.log(`Tool: ${name}`, args);
  },
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### `hive.list()` / `hive.search(query)`

```typescript
const allSkills = await hive.list();
const matched = await hive.search('kubernetes deployment');
```

### `hive.install(source)`

从远程源安装技能。

```typescript
const result = await hive.install('https://github.com/user/my-skill.git');
```

### `hive.runtimeStatus()`

检查系统运行时状态（需要 `scripts.enabled: true`）。

```typescript
const status = await hive.runtimeStatus();
// {
//   bash:   { available: true,  version: '5.2.15', command: 'bash' },
//   python: { available: true,  version: '3.12.1', command: 'python3' },
//   node:   { available: true,  version: '20.11.0', command: 'node' },
// }
```

## 多模型切换

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const hive = createHiveMind({
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
    vision: google('gemini-2.0-flash'),
  },
  skills: [{ type: 'local', path: './skills' }],
});

await hive.run({ message: '快速回答', model: 'fast' });
await hive.run({ message: '深度分析', model: 'reasoning' });
```

## 工作区隔离

```typescript
const frontend = createHiveMind({
  workspace: 'frontend',
  models: { default: openai('gpt-4o-mini') },
  skills: [{ type: 'local', path: './skills/frontend' }],
  scripts: { enabled: true, allowedRuntimes: ['node'] },
});

const backend = createHiveMind({
  workspace: 'backend',
  models: { default: anthropic('claude-sonnet-4-20250514') },
  skills: [{ type: 'local', path: './skills/backend' }],
  scripts: { enabled: true, allowedRuntimes: ['bash', 'python', 'node'] },
});
```

## 安全模型

| 级别 | 防护措施 | 适用场景 |
|------|---------|---------|
| basic | 路径穿越防护 + 白名单 + 超时 | 受信任环境 |
| strict | + 运行时白名单 + 环境隔离 + 审批回调 | 推荐默认 |
| sandbox | + V8 Isolate + CPU/内存限制 + deny-by-default | 多租户 |

```typescript
const hive = createHiveMind({
  // ...
  scripts: {
    enabled: true,
    securityLevel: 'sandbox',
    requireApproval: true,
    onApproval: async (script, args) => {
      console.log(`即将执行: ${script} ${args.join(' ')}`);
      return true; // 或 false 拒绝
    },
    sandbox: {
      cpuTimeLimitMs: 10_000,
      memoryLimitMb: 128,
      permissions: {
        fs: { read: ['./data/'], write: [] },
        net: false,
        env: ['NODE_ENV'],
        childProcess: false,
      },
    },
  },
});
```

## 与 Express 集成

```typescript
import express from 'express';
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';

const app = express();
app.use(express.json());

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

app.post('/api/chat', async (req, res) => {
  const result = await hive.run({
    message: req.body.message,
  });
  res.json({ text: result.text, skills: result.activatedSkills });
});

app.listen(3000);
```

## 与 Next.js 集成

```typescript
// app/api/chat/route.ts
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

export async function POST(req: Request) {
  const { message } = await req.json();
  const stream = await hive.stream({ message });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
```

## 支持的 Provider

| Provider | 包名 | 环境变量 |
|----------|------|---------|
| OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| Google | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Azure OpenAI | `@ai-sdk/azure` | `AZURE_OPENAI_API_KEY` |
| Mistral | `@ai-sdk/mistral` | `MISTRAL_API_KEY` |
| DeepSeek | `@ai-sdk/deepseek` | `DEEPSEEK_API_KEY` |

所有 Provider 均为 `peerDependencies`，按需安装。

## 架构概览

```
createHiveMind(config)
    │
    ├─ SkillLoader        解析 SKILL.md（BuiltinAdapter / @skill-tools 适配器）
    ├─ SkillRouter        BM25 / 关键词路由匹配
    ├─ CompositeRegistry  本地 + 远程技能注册表
    ├─ ScriptExecutor     跨语言脚本执行（安全边界内）
    └─ AgentRunner        Agent 技能多步执行循环
         │
         └─ call_skill    技能链调用（深度限制 + 去重缓存）
```

## 开发

```bash
npm install          # 安装依赖
npm run build        # 构建（ESM + CJS）
npm test             # 运行测试（97 个用例）
npm run typecheck    # 类型检查
```

## 许可证

MIT
