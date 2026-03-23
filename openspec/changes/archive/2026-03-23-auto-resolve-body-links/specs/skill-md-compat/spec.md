## ADDED Requirements

### Requirement: Body 内 Markdown 链接自动提取
系统 SHALL 在 `SkillLoader.loadFull()` 阶段自动提取 SKILL.md body 中的 markdown 链接，将指向本地文件的相对路径解析为绝对路径并存入 `SkillContent.linkedFiles`。

> 受影响模块: `src/loader/index.ts`, `src/types.ts`
> 无需新增 peerDependencies

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

## MODIFIED Requirements

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
