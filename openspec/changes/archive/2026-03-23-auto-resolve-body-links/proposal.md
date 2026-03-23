## Why

当前 SKILL.md 的 body 中可以通过 markdown 链接引用外部文件（如 `[common-rules.md](../frontend-standards/common-rules.md)`），但引擎不会识别这些链接——`SkillLoader` 仅发现技能自身目录下 `scripts/`、`references/`、`assets/` 三个子目录的文件，且 `read_resource` 工具对 `../` 路径执行穿越拦截。结果是：技能作者在 body 中写的跨目录链接对 LLM 不可操作，成为"死链接"。

典型案例：`frontend-coding-standards` 技能引用了 `../frontend-standards/` 下的 4 个规则文件，LLM 看得到链接文本却无法读取内容。

## What Changes

- `SkillLoader.loadFull()` 在解析 body 后，自动提取其中的 markdown 链接（`[text](path)` 格式），过滤出指向本地文件的相对路径，解析为绝对路径并验证文件存在性，存入 `SkillContent.linkedFiles`。
- `read_resource` 工具的路径校验扩展：除了允许技能自身目录内的文件，也允许 `linkedFiles` 白名单中的路径。
- 当技能没有 `references/` 目录但有 `linkedFiles` 时，也注入 `read_resource` 工具，使 LLM 可以按需读取链接文件。
- `SkillContent` 类型新增 `linkedFiles: string[]` 字段。

## 非目标 (Non-goals)

- **不自动内联链接文件内容到 body** — 为控制 token 消耗，链接文件按需读取而非全量注入 system prompt。
- **不修改 SKILL.md frontmatter 格式** — 不引入新的 frontmatter 字段（如 `includes` 或 `dependencies`），保持技能作者的写作习惯不变。
- **不支持 HTTP/HTTPS 远程链接解析** — 仅处理本地相对路径，远程文件获取超出本次范围。
- **不改变现有安全模型层级** — 路径白名单仅针对 `read_resource` 的读取校验，不影响 `run_script` 的脚本执行安全边界。

## Capabilities

### New Capabilities

（无新增独立能力，所有变更通过修改现有能力实现）

### Modified Capabilities

- `skill-md-compat`: `SkillLoader.loadFull()` 新增 markdown 链接提取步骤，`SkillContent` 增加 `linkedFiles` 字段。
- `script-execution`: `read_resource` 工具的注入条件和路径校验逻辑扩展，支持 `linkedFiles` 白名单。

## Impact

- **受影响代码**: `src/types.ts`、`src/loader/index.ts`、`src/executor/tools.ts`
- **对现有 73 个测试用例的影响**: 无破坏性影响。`linkedFiles` 默认为空数组，现有技能（body 中无跨目录链接）行为完全不变。需新增测试用例覆盖链接提取和白名单校验。
- **API 变更**: `SkillContent` 接口新增可选字段 `linkedFiles`，属于非破坏性扩展。
- **依赖变更**: 无新增依赖，markdown 链接提取使用正则实现。
