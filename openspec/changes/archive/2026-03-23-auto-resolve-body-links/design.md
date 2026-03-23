## Context

当前 `SkillLoader.loadFull()` 解析 SKILL.md 后，仅发现技能自身目录下 `scripts/`、`references/`、`assets/` 三个约定子目录中的文件。技能 body 中的 markdown 链接（如 `[text](../other-skill/file.md)`）作为纯文本传递给 LLM，但 LLM 无法通过 `read_resource` 工具读取这些文件——路径穿越防护会拦截任何 `../` 路径。

技能作者已经通过 markdown 链接表达了文件引用意图，引擎应当识别并尊重这一意图。

## Goals / Non-Goals

**Goals:**

- 在 `loadFull()` 阶段自动提取 body 中的本地 markdown 链接，无需技能作者额外声明
- 将链接文件的绝对路径存入 `SkillContent.linkedFiles`，作为 `read_resource` 的扩展白名单
- 保持现有安全模型不退化——白名单仅覆盖技能作者在 body 中明确写出的路径

**Non-Goals:**

- 不解析 HTTP/HTTPS 远程链接
- 不自动将链接文件内容内联到 system prompt
- 不修改 SKILL.md frontmatter 格式或 `x-hive` 扩展字段

## Decisions

### Decision 1: 在 Loader 层提取链接 vs 在 Engine 层提取

**选择**: 在 `SkillLoader.loadFull()` 中提取。

**理由**: 链接提取本质是"内容解析"职责，属于 Loader 层。如果放在 Engine 层，会让 Engine 侵入 Loader 的关注点，且 `SkillContent` 作为两层之间的数据契约，自然应该在 Loader 填充完毕后就包含完整的文件引用信息。

**备选方案**: 在 `engine.ts` 的 `resolveSkillContents()` 中提取——被否决，因为违反职责分离。

### Decision 2: 正则提取 vs Markdown AST 解析

**选择**: 正则提取 `\[([^\]]*)\]\(([^)]+)\)`。

**理由**: SKILL.md 的 body 结构简单，不涉及嵌套 markdown 或复杂语法。正则零依赖、性能好、代码量极小。引入完整的 markdown AST 解析器（如 remark）为一个简单需求引入新 peerDependency 不值得。

**备选方案**: 使用 `remark` + `unist-util-visit` 解析 AST——被否决，因为引入额外依赖且过度工程化。

### Decision 3: 链接文件按需读取 vs 自动内联

**选择**: 按需读取（通过 `read_resource` 工具）。

**理由**: 自动内联会将所有链接文件内容拼入 system prompt，对于框架特定的规则文件（如 `vue-rules.md` 在 React 项目中无用）会浪费 token。按需读取让 LLM 根据 body 中的工作流指示决定读取哪些文件，兼顾可靠性和 token 效率。

**备选方案**: 全量内联——被否决，因为 token 成本不可控。

### Decision 4: `read_resource` 注入条件扩展

**选择**: 当 `skill.references.length > 0 || skill.linkedFiles.length > 0` 时注入 `read_resource` 工具。

**理由**: 现有逻辑仅在 `references.length > 0` 时注入。如果技能没有 `references/` 目录但 body 中有链接文件，LLM 需要 `read_resource` 来读取这些文件。

## 架构流程图

```
┌─ SkillLoader.loadFull() ──────────────────────────────────┐
│                                                            │
│  1. parser.parse(skillPath)   → frontmatter + body         │
│  2. discoverFiles('scripts')  → scripts[]                  │
│  3. discoverFiles('references') → references[]             │
│  4. discoverFiles('assets')   → assets[]                   │
│  5. extractLinkedFiles(body, skillDir)  ← 【新增步骤】       │
│     │                                                      │
│     ├─ 正则提取: [text](path)                               │
│     ├─ 过滤: 排除 http(s)://、#anchor、绝对路径              │
│     ├─ 解析: path.resolve(skillDir, relativePath)          │
│     ├─ 验证: fs.access(absolutePath) 文件存在性             │
│     └─ 输出: linkedFiles: string[]                         │
│                                                            │
│  6. 组装 SkillContent（含 linkedFiles）                     │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ engine.ts → buildToolsForSkills() ───────────────────────┐
│  注入条件:                                                  │
│    scripts.length > 0 || references.length > 0             │
│    → 改为:                                                  │
│    scripts.length > 0 || references.length > 0             │
│    || linkedFiles.length > 0                               │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─ tools.ts → read_resource ────────────────────────────────┐
│  路径校验逻辑:                                              │
│    ✓ absolute.startsWith(resolvedDir)  ← 现有：目录内       │
│    ✓ linkedFiles.includes(absolute)    ← 【新增】白名单     │
│    ✗ 其他 → "Path traversal detected"                      │
└────────────────────────────────────────────────────────────┘
```

## 浏览器兼容性影响

本次改动涉及 `node:path`（`path.resolve`）和 `node:fs/promises`（`fs.access`），均为 Node.js API。但这与现有 `loadFull()` 中的 `discoverFiles()` 一致——该方法已使用同样的 API（动态 import）。浏览器环境下 `loadFull()` 本就不可直接运行（参照 architecture.md 3.5 节），本次改动不引入新的浏览器兼容性问题。

## 对三级安全模型的影响

| 安全级别 | 影响 |
|---------|------|
| basic   | `read_resource` 路径校验扩展白名单，仅允许 body 中明确写出的链接路径。不影响 `run_script` 的路径穿越防护。 |
| strict  | 同 basic。`read_resource` 不涉及运行时白名单、环境变量隔离等 strict 层特性。 |
| sandbox | 同 basic。`read_resource` 是纯文件读取，不经过 V8 沙盒执行路径。 |

白名单内容由技能作者在 body 中显式写出的 markdown 链接决定，不可被 LLM 动态扩展，安全边界可控。

## Risks / Trade-offs

- **[风险] LLM 可能不主动调用 `read_resource`** → 缓解：SKILL.md body 的工作流步骤（如"加载规则 → 读取 common-rules.md"）已明确指示 LLM 何时读取哪些文件，这比泛泛的"你可以读"可靠得多。
- **[风险] markdown 链接正则可能误匹配** → 缓解：通过 `fs.access` 验证文件存在性过滤误匹配；仅处理相对路径并排除 URL 和锚点链接。
- **[Trade-off] 按需读取 vs 可靠性** → 选择 token 效率优先。如果未来需要更高可靠性，可增加 `x-hive.includes.required` 字段支持强制内联，作为增量迭代。
