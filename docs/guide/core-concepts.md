# 核心概念

## 三阶段渐进式加载

Hive-Mind 的核心创新是将技能加载拆分为三个阶段，避免在每次请求中将所有技能内容塞入 system prompt。

```
阶段 1: 发现 (Discovery)   → 仅加载 name + description（~100 tokens/技能）
阶段 2: 激活 (Activation)  → 路由匹配，仅加载 Top-K 技能完整内容
阶段 3: 执行 (Execution)   → LLM 驱动，按需调用脚本工具
```

### 阶段 1 — 发现

启动时扫描所有技能目录，仅解析 SKILL.md 的 frontmatter（name、description、tags），构建轻量索引并常驻内存。

- 50 个技能仅消耗 ~5,000 tokens
- 索引带 LRU 缓存，热路径无 IO

### 阶段 2 — 激活

用户消息到达时，关键词路由器在 **LLM 调用之前**匹配 Top-K 技能（<10ms，零 token 开销），仅对匹配到的 1-5 个技能加载完整 SKILL.md 内容。

- 路由纯本地计算，不消耗 LLM token
- 同时发现 `scripts/`、`references/`、`assets/` 目录

### 阶段 3 — 执行

将匹配技能的指令注入 system prompt，调用 LLM。LLM 可以调用 `run_script`、`call_skill` 等工具完成任务。

## Token 节省效果

| 注册技能数 | 传统方式 prompt/请求 | 渐进式 prompt/请求 | 节省 |
|-----------|--------------------|--------------------|------|
| 10 | ~1,700 | ~340 | **80%** |
| 20 | ~3,400 | ~340 | **90%** |
| 50 | ~8,500 | ~340 | **96%** |
| 100 | ~17,000 | ~340 | **98%** |

实测数据（6 技能，OpenRouter）：传统模式 prompt 3,249 tokens → 渐进式 836 tokens，**节省 74.3%**。

## 技能目录结构

```
my-skill/
├── SKILL.md              # 必需：元数据 + LLM 指令
├── scripts/              # 可选：可执行脚本
│   ├── run.sh
│   └── analyze.py
├── references/           # 可选：参考文档
│   └── guide.md
└── assets/               # 可选：模板和静态资源
    └── config.json
```

### 跨技能文件引用

技能的 SKILL.md body 中可以通过 markdown 链接引用其他目录的文件：

```markdown
## 工作流

1. 加载通用规则 → [common-rules.md](../shared-standards/common-rules.md)
2. 加载框架规则 → [react-rules.md](../shared-standards/react-rules.md)
```

引擎在加载技能时自动提取这些链接，将目标文件加入 `read_resource` 工具的访问白名单。LLM 按照 body 中的工作流指示按需读取。无需额外配置，技能作者只需正常写 markdown 链接即可。

- 仅识别相对路径的本地文件链接（排除 `http://`、`#anchor` 等）
- 自动验证文件存在性，不存在的链接静默忽略
- 安全可控——只有 body 中明确写出的路径才被放行

## 技能路由

当前使用 `KeywordAdapter`（关键词匹配），支持：

- 完全匹配 / 部分匹配 / CJK 子串匹配
- 技能的 `name`、`description`、`tags` 均参与评分
- 中文、日文、韩文字符逐字提取 + 双字组合分词

架构预留了 BM25 路由接口（通过 `@skill-tools/router` 适配器），可在需要时启用。

## 技能链调用

技能在执行过程中可以通过 `call_skill` 工具调用其他技能：

```
用户输入 "翻译并总结这段文字"
  → smart-assistant 技能被激活
    → call_skill(translator, "翻译...")
    → call_skill(summarizer, "总结...")
  → 返回组合结果
```

内置防护：
- **递归深度限制**（默认 5 层，可配置 `maxCallDepth`）
- **调用去重缓存**（相同技能 + 相同消息自动返回缓存）
- **调用序号追踪**（日志中 `call_skill #N` 便于排查）
