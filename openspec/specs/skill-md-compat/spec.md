# skill-md-compat Specification

## Purpose

完全兼容 Agent Skills 标准（agentskills.io/specification）的 SKILL.md 格式，通过 `x-hive` 命名空间添加 Hive-Mind 特有的扩展字段，支持技能目录结构自动发现。

> 模块: `src/loader/adapters/builtin.ts`, `src/loader/extensions.ts`, `src/types.ts` | 测试: `test/loader.test.ts` (5), `test/extensions.test.ts` (6) | 状态: 已实现
## Requirements
### Requirement: SKILL.md 标准兼容
系统 SHALL 完全兼容 Agent Skills 标准的 frontmatter 格式。

#### Scenario: 标准字段解析
- **WHEN** SKILL.md 包含标准 frontmatter 字段（name, description, compatibility, allowed-tools, metadata）
- **THEN** BuiltinAdapter 正确解析所有字段到 `SkillMeta`

#### Scenario: metadata.tags 提取
- **WHEN** frontmatter 包含 `metadata.tags: [翻译, 英文]`
- **THEN** tags 被提取到 `SkillMeta.tags`，参与路由匹配

#### Scenario: allowed-tools 解析
- **WHEN** frontmatter 包含 `allowed-tools: Bash(scripts/run.sh) Bash(scripts/lint.py)`
- **THEN** 解析为脚本路径白名单，用于安全校验

### Requirement: x-hive 扩展命名空间
系统 SHALL 通过 `x-hive` 前缀支持 Hive-Mind 特有的扩展字段。

#### Scenario: 完整 x-hive 解析
- **WHEN** frontmatter 包含 `x-hive:` 块（agent, maxSteps, scripts, models, workspace）
- **THEN** `parseXHive()` 正确解析为 `XHiveConfig` 类型

#### Scenario: 部分 x-hive 配置
- **WHEN** frontmatter 仅包含部分 x-hive 字段
- **THEN** 未声明的字段使用默认值

#### Scenario: 无 x-hive 字段
- **WHEN** SKILL.md 不包含 x-hive 块
- **THEN** `xHive` 为 undefined，技能按普通模式运行

#### Scenario: agent 声明
- **WHEN** `x-hive.agent: true`
- **THEN** 技能被标记为 Agent 技能，启用多步执行循环

#### Scenario: scripts 配置
- **WHEN** `x-hive.scripts: { approval: true, timeout: 60000, runtimes: [bash, python] }`
- **THEN** 脚本执行使用指定的审批策略、超时和运行时

#### Scenario: models 偏好
- **WHEN** `x-hive.models: { preferred: reasoning, fallback: default }`
- **THEN** 引擎优先使用 reasoning 模型，不可用时回退

### Requirement: SkillParser 适配器模式
系统 SHALL 提供 SkillParser 抽象接口，支持替换解析实现。

#### Scenario: BuiltinAdapter 默认使用
- **WHEN** 不配置 parser 或配置为默认
- **THEN** 使用基于 gray-matter 的 BuiltinAdapter

#### Scenario: 预留 @skill-tools 适配器
- **WHEN** 配置 `parser: 'auto'`（预留）
- **THEN** 可切换到 @skill-tools/core 适配器

### Requirement: 技能目录结构发现
系统 SHALL 在加载技能时自动发现 scripts/、references/、assets/ 子目录，并提取 body 中的 markdown 链接文件。

#### Scenario: scripts 目录
- **WHEN** 技能目录包含 `scripts/` 子目录
- **THEN** 列出所有脚本文件，包含路径和推断的运行时类型

#### Scenario: references 目录
- **WHEN** 技能目录包含 `references/` 子目录
- **THEN** 文件路径记录在 `SkillContent.references`，可通过 `read_resource` 按需读取

#### Scenario: assets 目录
- **WHEN** 技能目录包含 `assets/` 子目录
- **THEN** 文件路径记录在 `SkillContent.assets`

#### Scenario: linkedFiles 提取
- **WHEN** 技能的 SKILL.md body 包含指向本地文件的 markdown 链接
- **THEN** 链接文件的绝对路径记录在 `SkillContent.linkedFiles`，可通过 `read_resource` 按需读取

### Requirement: Body 内 Markdown 链接自动提取
系统 SHALL 在 `SkillLoader.loadFull()` 阶段自动提取 SKILL.md body 中的 markdown 链接，将指向本地文件的相对路径解析为绝对路径并存入 `SkillContent.linkedFiles`。

#### Scenario: 提取 body 中的相对路径链接
- **WHEN** SKILL.md body 包含 markdown 链接 `[common-rules.md](../frontend-standards/common-rules.md)` 且该文件在磁盘上存在
- **THEN** `SkillContent.linkedFiles` 包含该文件的绝对路径

#### Scenario: 提取多个链接
- **WHEN** SKILL.md body 包含多个 markdown 链接指向不同的本地文件
- **THEN** `SkillContent.linkedFiles` 包含所有存在的文件的绝对路径，不含重复项

#### Scenario: 忽略 HTTP/HTTPS 链接
- **WHEN** SKILL.md body 包含 `[docs](https://example.com/docs)` 等远程 URL
- **THEN** 该链接不出现在 `linkedFiles` 中

#### Scenario: 忽略锚点链接
- **WHEN** SKILL.md body 包含 `[section](#some-heading)` 等页内锚点
- **THEN** 该链接不出现在 `linkedFiles` 中

#### Scenario: 忽略不存在的文件
- **WHEN** SKILL.md body 包含 `[missing](../nonexistent/file.md)` 但该文件不存在
- **THEN** 该链接不出现在 `linkedFiles`，不抛出错误

#### Scenario: body 无链接
- **WHEN** SKILL.md body 不包含任何 markdown 链接
- **THEN** `SkillContent.linkedFiles` 为空数组

### Requirement: @skill-tools/core 适配器
系统 SHALL 提供 SkillToolsParserAdapter 实现 SkillParser 接口，对接 @skill-tools/core（v0.2.2）的解析能力。

#### Scenario: auto 模式启用 @skill-tools/core
- **GIVEN** `parser: 'auto'` 配置且 `@skill-tools/core` 已安装
- **WHEN** 首次 ensureIndex() 或 resolveSkillContents() 触发 ensureAdapters()
- **THEN** 动态 import @skill-tools/core 并使用 SkillToolsParserAdapter 替换内置解析器

#### Scenario: auto 模式回退到内置解析器
- **GIVEN** `parser: 'auto'` 配置但 `@skill-tools/core` 未安装
- **WHEN** ensureAdapters() 尝试动态 import 失败
- **THEN** 输出 warn 日志，继续使用 BuiltinAdapter

#### Scenario: builtin 模式跳过 @skill-tools/core
- **GIVEN** `parser: 'builtin'`（默认值）
- **WHEN** 创建 HiveMind 实例
- **THEN** 始终使用 BuiltinAdapter，不尝试 import @skill-tools/core

