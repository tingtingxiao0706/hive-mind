## MODIFIED Requirements

### Requirement: 脚本工具注入
系统 SHALL 在技能包含脚本、引用文件或链接文件时自动为 LLM 注入相应工具。

#### Scenario: 工具注册（含脚本）
- **WHEN** 激活的技能包含 `scripts/` 目录且 `scripts.enabled: true`
- **THEN** 注入 `run_script`、`list_skill_files`、`read_resource` 三个工具

#### Scenario: 工具注册（仅链接文件）
- **WHEN** 激活的技能没有 `scripts/` 和 `references/` 目录，但 body 中包含本地 markdown 链接（`linkedFiles` 非空）
- **THEN** 注入 `read_resource` 工具，使 LLM 可以读取链接文件

#### Scenario: read_resource 路径安全 — 技能目录内
- **WHEN** LLM 通过 `read_resource` 读取技能目录内的文件
- **THEN** 校验通过，返回文件内容

#### Scenario: read_resource 路径安全 — linkedFiles 白名单
- **WHEN** LLM 通过 `read_resource` 读取的路径在 `SkillContent.linkedFiles` 白名单中
- **THEN** 校验通过，返回文件内容

#### Scenario: read_resource 路径安全 — 未授权路径
- **WHEN** LLM 通过 `read_resource` 读取的路径既不在技能目录内、也不在 `linkedFiles` 白名单中
- **THEN** 返回 "Path traversal detected" 错误

> 受影响模块: `src/executor/tools.ts`, `src/engine.ts`
> 无需新增 peerDependencies
