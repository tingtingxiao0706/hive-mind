# 简介

Hive-Mind 是一个 TypeScript 库（npm 包），为 AI Agent 提供**按需技能加载**与**脚本执行**能力。

## 它解决什么问题

当前的 AI 技能系统（OpenClaw、Cursor Skills）都绑定在特定的编辑器或客户端上。如果你要构建一个自己的平台让用户使用 AI 技能，传统做法是在服务端将技能作为 prompt 注入，但这会严重膨胀上下文窗口：

- 20 个技能 × 每个 ~1,250 tokens = **25,000 tokens 基线开销**
- 即使大部分技能根本没被使用，每轮对话都要付这个代价
- 上下文窗口被占满后，LLM 的推理能力显著下降

Hive-Mind 通过**三阶段渐进式技能加载**解决这个问题，将每轮基线开销从 ~25,000 tokens 降低到 ~500 tokens。

## 核心特性

| 特性 | 说明 |
|------|------|
| 渐进式加载 | 三阶段按需加载，50 个技能节省 96% prompt tokens |
| 模型切换 | 基于 Vercel AI SDK，支持 30+ LLM 供应商 |
| SKILL.md 兼容 | 遵循 [Agent Skills 标准](https://agentskills.io/specification) |
| 跨语言脚本 | 支持 Python / Bash / Node.js 脚本执行 |
| 分层安全 | basic / strict / sandbox 三级安全模型 |
| 工作区隔离 | 多租户场景下独立配置技能、模型、安全策略 |
| 技能即 Agent | 技能可声明为自主 Agent，拥有多步执行循环 |
| 技能链调用 | 技能之间可以互相调用（`call_skill`） |
| 跨技能文件引用 | body 中的 markdown 链接自动识别，LLM 按需读取 |
| LLM 驱动路由 | `llm-routed` 策略让 LLM 自主选择技能，语义理解优于关键词匹配 |
| MCP Client | 连接外部 MCP Server，将 MCP 工具自动注入 LLM 工具链 |

## 定位

**Hive-Mind 是引擎，不是产品。**

| | OpenClaw (Claude Code) | Hive-Mind |
|---|---|---|
| **是什么** | 完整的 AI 终端应用 | 可嵌入的 TypeScript 库 |
| **谁用** | 开发者在终端中交互 | 开发者集成到自己的应用 |
| **运行方式** | `claude` 命令启动 | `import { createHiveMind }` |
| **类比** | 像浏览器（Chrome） | 像浏览器引擎（Chromium） |

## 谁适合用

- 构建 **Web 平台**让用户直接使用 AI 技能
- 在现有 **Node.js 应用**中嵌入技能系统
- 需要支持**多个 LLM 供应商**的应用
- **多租户 SaaS** 平台
- 对**安全性**要求高的场景（金融/医疗）
