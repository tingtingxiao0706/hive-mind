# 编写技能

## SKILL.md 格式

每个技能由一个 `SKILL.md` 文件定义，遵循 [Agent Skills 标准](https://agentskills.io/specification)。

### 基本结构

```markdown
---
name: my-skill
description: 一句话描述技能的用途
compatibility: 运行环境要求（如 Python 3.10+）
allowed-tools: Bash(scripts/run.sh) Bash(scripts/analyze.py)
metadata:
  tags: [关键词1, 关键词2, keyword3]
---

# 技能标题

给 LLM 的详细指令...
```

### Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 技能唯一标识，小写中划线命名 |
| `description` | 是 | 技能描述，用于路由匹配 |
| `compatibility` | 否 | 运行环境要求 |
| `allowed-tools` | 否 | 允许执行的脚本白名单 |
| `metadata.tags` | 否 | 标签数组，参与路由评分 |
| `license` | 否 | 许可证 |

### Body（指令部分）

frontmatter 之后的 markdown 内容是给 LLM 的指令。写好指令的要点：

- 清晰说明技能的职责边界
- 列出可用的工具和脚本
- 给出使用示例
- 指定输出格式

## x-hive 扩展

Hive-Mind 通过 `x-hive` 字段扩展标准 SKILL.md，添加高级功能：

```markdown
---
name: code-analyzer
description: 分析代码质量和安全性
allowed-tools: Bash(scripts/analyze.py)

x-hive:
  agent: true               # 声明为 Agent 技能
  maxSteps: 10               # Agent 最大执行步数
  scripts:
    approval: false          # 脚本执行是否需要审批
    timeout: 60000           # 脚本超时（毫秒）
    runtimes: [python, node] # 使用的运行时
  models:
    preferred: reasoning     # 首选模型
    fallback: default        # 备选模型
  workspace: backend         # 绑定工作区
---
```

### x-hive 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `agent` | boolean | 是否为 Agent 技能（多步执行循环） |
| `maxSteps` | number | Agent 最大执行步数 |
| `scripts.approval` | boolean | 脚本执行前是否需要审批 |
| `scripts.timeout` | number | 脚本超时时间（ms） |
| `scripts.runtimes` | string[] | 此技能使用的运行时 |
| `models.preferred` | string | 首选模型 key |
| `models.fallback` | string | 备选模型 key |
| `workspace` | string | 绑定工作区名称 |

## 带脚本的技能

技能可以包含可执行脚本，放在 `scripts/` 目录下：

```
text-analyzer/
├── SKILL.md
└── scripts/
    └── analyze.js
```

**SKILL.md：**

```markdown
---
name: text-analyzer
description: 分析文本的字数、词频和阅读时间
allowed-tools: Bash(scripts/analyze.js)
x-hive:
  scripts:
    runtimes: [node]
---

# Text Analyzer

使用 `scripts/analyze.js` 分析文本。
调用方式：`node scripts/analyze.js "要分析的文本"`
```

**scripts/analyze.js：**

```javascript
const text = process.argv[2] || '';
const words = text.split(/\s+/).filter(Boolean);
console.log(JSON.stringify({
  characters: text.length,
  words: words.length,
  readingTime: `${Math.ceil(words.length / 200)} min`,
}));
```

### 脚本设计原则

1. **禁止交互式输入** — Agent 在非交互环境运行，所有输入通过参数/环境变量
2. **提供 `--help`** — Agent 学习脚本接口的主要方式
3. **结构化输出** — 优先 JSON/CSV，数据发 stdout，诊断信息发 stderr
4. **有意义的退出码** — 0 成功、1 参数错误、2 运行时错误
5. **幂等性** — Agent 可能重试，"创建如果不存在" 优于 "创建并在重复时失败"

## Python 脚本与 PEP 723

Python 脚本可以使用 [PEP 723](https://peps.python.org/pep-0723/) 内联声明依赖：

```python
#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.31.0",
#     "rich>=13.0.0",
# ]
# ///

import requests
from rich.console import Console
# ...
```

Hive-Mind 的 `RuntimeResolver` 会自动检测 PEP 723 声明，并通过 `uv run`、`pipx` 等工具管理依赖。

## 跨技能文件引用

如果多个技能共享一套规范文件（如编码规则、模板等），可以将共享内容放在独立目录中，通过 markdown 链接引用：

```
skills/
├── frontend-coding-standards/
│   └── SKILL.md              # body 中链接 ../shared-standards/*.md
├── shared-standards/
│   ├── common-rules.md
│   ├── react-rules.md
│   └── vue-rules.md
```

**SKILL.md 中的引用方式：**

```markdown
## 工作流

1. 识别框架（检查 package.json）
2. 加载规则：
   - 通用规则 → [common-rules.md](../shared-standards/common-rules.md)
   - React → [react-rules.md](../shared-standards/react-rules.md)
   - Vue → [vue-rules.md](../shared-standards/vue-rules.md)
3. 按规则编码
```

引擎在加载技能时会自动：

1. 提取 body 中的 markdown 链接
2. 过滤出相对路径的本地文件（排除 HTTP、锚点链接）
3. 验证文件存在性
4. 将合法路径加入 `read_resource` 工具的白名单

LLM 会按照 body 中的工作流指示，在需要时调用 `read_resource` 读取对应文件。无需在 frontmatter 中额外声明依赖。

## 路由匹配技巧

让技能更容易被路由匹配到：

1. **描述准确** — `description` 应明确说明技能做什么
2. **添加 tags** — 在 `metadata.tags` 中加入关键词（支持中英文）
3. **避免泛化** — 不要写 "通用工具"，写 "JSON 格式化、校验和查询"
