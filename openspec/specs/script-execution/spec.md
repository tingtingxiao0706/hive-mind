# script-execution Specification

## Purpose

在安全边界内执行技能目录中的跨语言脚本（Python/Bash/Node/Deno/Go），通过 RuntimeResolver 自动探测运行时并选择最优执行策略。

> 模块: `src/executor/index.ts`, `src/executor/runtime.ts`, `src/executor/tools.ts` | 测试: `test/executor.test.ts` (13 个用例) | 状态: 已实现

## Requirements

### Requirement: ScriptExecutor 脚本执行器
系统 SHALL 提供 ScriptExecutor 在安全边界内执行技能目录中的脚本文件。

#### Scenario: 基本执行
- **WHEN** LLM 调用 `run_script` 工具
- **THEN** 验证路径安全性 → 检查 allowed-tools → 解析运行时 → 执行脚本 → 返回 stdout/stderr

#### Scenario: 路径穿越防护
- **WHEN** 脚本路径包含 `../` 试图逃逸技能目录
- **THEN** 抛出 `PathTraversalError`，阻止执行

#### Scenario: allowed-tools 白名单
- **WHEN** 请求执行的脚本不在 SKILL.md 的 `allowed-tools` 声明中
- **THEN** 抛出 `ScriptNotAllowedError`

#### Scenario: 超时控制
- **WHEN** 脚本执行超过配置的 `timeout`（默认 30 秒）
- **THEN** 终止进程，返回超时错误

#### Scenario: 输出截断
- **WHEN** 脚本输出超过 `maxOutputSize`（默认 30,000 字符）
- **THEN** 截断输出并附加截断标记

### Requirement: RuntimeResolver 跨语言运行时解析
系统 SHALL 通过 RuntimeResolver 自动探测系统中的运行时并选择最优执行策略。

#### Scenario: Python 执行策略链
- **WHEN** 执行 `.py` 脚本
- **THEN** 按优先级尝试: `uv run` → `pipx run` → `python3` → 报错并给出安装指引

#### Scenario: Shell 执行策略
- **WHEN** 执行 `.sh` 脚本
- **THEN** 按优先级尝试: `bash` → `sh` → 报错

#### Scenario: TypeScript 执行策略
- **WHEN** 执行 `.ts` 脚本
- **THEN** 按优先级尝试: `deno run` → `bun run` → `npx tsx` → 报错

#### Scenario: 跨平台命令检测
- **WHEN** 在 Windows 上检测运行时
- **THEN** 使用 `where` 代替 `which`，Python 候选顺序为 `py` > `python` > `python3`

#### Scenario: 版本校验
- **WHEN** 技能声明 `compatibility: Requires Python 3.10+`
- **THEN** 校验系统 Python 版本，不满足时抛出 `RuntimeVersionError`

### Requirement: PEP 723 内联依赖检测
系统 SHALL 支持解析 Python 脚本中的 PEP 723 依赖声明。

#### Scenario: 检测内联依赖
- **WHEN** Python 脚本包含 `# /// script` 块声明了 `dependencies`
- **THEN** `parsePEP723Deps()` 正确提取依赖列表

#### Scenario: 无依赖声明
- **WHEN** Python 脚本不包含 PEP 723 块
- **THEN** 返回空数组

### Requirement: preflight 运行时预检
系统 SHALL 支持在引擎启动时预检运行时可用性。

#### Scenario: 启动预检
- **WHEN** 配置 `scripts.preflight: true`
- **THEN** 初始化时检测所有 allowedRuntimes，不可用的发出 warning（不阻塞启动）

#### Scenario: runtimeStatus 查询
- **WHEN** 调用 `hive.runtimeStatus()`
- **THEN** 返回各运行时的可用性、版本号和命令路径

### Requirement: 脚本工具注入
系统 SHALL 在技能包含脚本时自动为 LLM 注入脚本相关工具。

#### Scenario: 工具注册
- **WHEN** 激活的技能包含 `scripts/` 目录且 `scripts.enabled: true`
- **THEN** 注入 `run_script`、`list_skill_files`、`read_resource` 三个工具

#### Scenario: read_resource 路径安全
- **WHEN** LLM 通过 `read_resource` 读取文件
- **THEN** 路径穿越检查同样生效，只允许读取技能目录内的文件
