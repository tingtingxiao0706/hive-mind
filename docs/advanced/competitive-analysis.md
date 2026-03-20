# Hive-Mind 竞品分析报告

## 一、市场概览

2025 年 12 月 Anthropic 发布 SKILL.md 标准后，AI Agent 技能生态在 2026 年快速发展。目前市面上已有多个相关实现，但各有侧重和局限。以下是与 Hive-Mind 定位最相关的 7 个竞品。

---

## 二、竞品详细分析

### 1. Bluebag（`@bluebag/ai-sdk`）

**定位**：基于 Vercel AI SDK 的技能增强层，商业 SaaS 产品。

**核心能力**：
- 三级渐进式加载（元数据 -> 完整文档 -> 执行）
- 两行代码集成 Vercel AI SDK（`bluebag.enhance({ model, messages })`）
- 云端沙盒工具：`bluebag_bash`、`bluebag_code_execution`、`bluebag_computer_use` 等
- 支持所有 AI SDK 模型（OpenAI、Google、Claude、Mistral 等）

**优点**：
- 开箱即用，集成极简
- 沙盒执行更安全（WASM 隔离环境）
- 50+ 预置技能无需额外安装
- 已经历生产环境验证

**局限**：
- 需要 API Key 和云服务，数据经过 Bluebag 服务器
- 闭源商业产品，按执行次数收费
- 无工作区隔离概念（仅 `activeSkills` 过滤）
- 技能不能作为 Agent 运行

---

### 2. OpenSkills（`openskills`，9K+ Stars）

**定位**：通用技能加载器，跨编辑器使用，npm 包。

**核心能力**：
- 兼容 Anthropic SKILL.md 格式
- `npx openskills install` 安装技能
- `npx openskills sync` 生成 AGENTS.md
- `npx openskills read <skill>` 按需读取
- 支持从 Anthropic 官方仓库、本地路径、私有 Git 仓库安装

**优点**：
- 社区活跃（9K Stars，3.1K 周下载）
- 极其简单的使用方式
- 兼容 27+ AI 编辑器

**局限**：
- 面向编辑器场景，不是运行时引擎
- 不提供 LLM 调用能力，只做技能文件管理
- 没有技能路由（依赖编辑器自行匹配）
- 无脚本执行、工作区、Agent 概念

---

### 3. @skill-tools 生态（`@skill-tools/core` + `@skill-tools/router`）

**定位**：SKILL.md 解析和路由的 TypeScript 工具库。

**核心能力**：
- `@skill-tools/core`：SKILL.md 解析（20+ 校验规则、token 计数、路径安全防护）
- `@skill-tools/router`：BM25 关键词技能路由（无需 LLM，<10ms）
- 支持冲突检测、快照持久化、Boost/Exclude 调参

**优点**：
- 解析器严谨可靠
- BM25 路由零 LLM 开销
- 职责单一，可组合性强
- 开源，MIT 协议

**局限**：
- 纯工具库，不提供引擎、模型调用、执行循环
- 无 Agent 能力、工作区、模型切换
- 项目较新（2026-02 创建，v0.2.2），API 稳定性待验证

---

### 4. Skill（`skill-ai.dev`，Rust 实现）

**定位**：通用技能运行时，单二进制文件，本地语义搜索。

**核心能力**：
- 本地向量搜索发现工具（<50ms，完全离线）
- WASM 沙盒安全隔离（能力声明制）
- 支持 CLI 模式和 MCP Server 模式
- ~100ms 冷启动，<10ms 热启动

**优点**：
- 性能极致（Rust 编写）
- WASM 沙盒安全性最强
- 完全离线，零 API 依赖
- 单二进制文件，部署极简

**局限**：
- Rust 实现，不能作为 JS/TS 依赖 `import`
- 只能作为外部进程或 MCP Server 调用
- 无内置模型调用能力
- 无工作区隔离、Agent 循环

---

### 5. SkillsRouter（`skillsrouter.sh`）

**定位**：云端 Serverless 技能执行平台。

**核心能力**：
- 50+ 预置技能（图像生成、视频创建、LLM、搜索等）
- 无服务器执行，自动扩缩容
- 兼容 30+ Agent 平台
- 一键安装：`npx skills add skillsrouter/skills@nano-banana`

**优点**：
- 无需本地 GPU，按执行付费
- 覆盖多媒体生成等计算密集型技能

**局限**：
- 纯云服务，不是可嵌入的库
- 依赖外部基础设施
- 无本地运行能力
- 不适合数据敏感场景

---

### 6. ClawSkills（`clawskills.me`）

**定位**：类 npm 的技能注册中心，5500+ 技能。

**核心能力**：
- 向量搜索发现技能
- 版本管理 + 回滚支持
- `npx clawskills@latest install [skill-name]` 一键安装
- Agent Registry 实现惰性加载（减少 ~95% 上下文占用）

**优点**：
- 技能数量最大（5500+）
- 向量搜索发现能力
- 版本化管理

**局限**：
- 只是注册中心，不提供运行时或 SDK
- 面向编辑器生态
- 无引擎、执行、模型抽象

---

### 7. pydantic-ai-skills（Python 生态）

**定位**：Pydantic AI 生态的技能框架，渐进式披露。

**核心能力**：
- 4 个工具函数：`run_skill_script()`、`read_skill_resource()`、`load_skill()`、`list_skills()`
- 渐进式披露（按需加载技能指令）
- 兼容 Agent Skills 规范
- 类型安全（Python dataclasses）

**优点**：
- 设计理念与 Hive-Mind 最一致
- 验证了渐进式披露在 Python 生态的可行性
- 多目录技能加载

**局限**：
- Python 生态，非 TypeScript/npm
- 强绑定 Pydantic AI 框架
- Alpha 阶段（v0.5.1，173 Stars）

---

## 三、能力矩阵对比

| 能力 | Hive-Mind | Bluebag | OpenSkills | skill-tools | Skill | SkillsRouter | ClawSkills | pydantic-ai-skills |
|------|:---------:|:-------:|:----------:|:-----------:|:-----:|:------------:|:----------:|:-----------------:|
| npm 包可嵌入 | ✅ | ✅ | ✅ | ✅ | ❌ (Rust) | ❌ (SaaS) | ❌ | ❌ (Python) |
| 渐进式加载 | ✅ | ✅ | ✅ | 部分 | ✅ | ❌ | 部分 | ✅ |
| 模型切换 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Vercel AI SDK 集成 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 工作区隔离 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 技能作为 Agent | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 脚本执行 | ✅ | ✅ (云) | ❌ | ❌ | ✅ (WASM) | ✅ (云) | ❌ | ✅ |
| 本地运行 | ✅ | ❌ (云) | ✅ | ✅ | ✅ | ❌ (云) | ✅ | ✅ |
| SKILL.md 兼容 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 开源 | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 不绑定编辑器 | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 分层安全模型 | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | 部分 |

---

## 四、结论

**没有一个现有方案完整覆盖 Hive-Mind 的设计目标。**

- **Bluebag** 最接近但是闭源云服务，缺少工作区和 Agent 技能
- **@skill-tools** 解析和路由能力优秀，Hive-Mind 直接复用作为底层依赖
- **OpenSkills** 社区最大但仅是文件管理器，无运行时引擎
- **Skill** 性能和安全性最强但是 Rust 实现，不能作为 JS/TS 依赖
- **pydantic-ai-skills** 设计理念最一致，验证了这条路径在 Python 生态的可行性

Hive-Mind 的独特价值：**市面上唯一同时满足「完整运行时引擎 + 独立于编辑器 + 工作区隔离 + 技能即 Agent + 开源本地运行」的 TypeScript 库。**
