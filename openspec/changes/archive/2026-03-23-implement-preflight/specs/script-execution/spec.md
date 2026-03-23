# script-execution Specification (Delta)

## MODIFIED Requirements

### Requirement: preflight 运行时预检
系统 SHALL 支持在引擎启动时预检运行时可用性。当 `scripts.preflight` 为 `true` 时，系统 SHALL 在首次 `run()`/`stream()` 调用时自动执行一次惰性预检。

#### Scenario: 启动预检
- **GIVEN** `scripts.enabled` 为 `true` 且 `scripts.preflight` 为 `true`
- **WHEN** 首次调用 `run()` 或 `stream()`
- **THEN** 系统自动执行 `executor.preflight(allowedRuntimes)`，检测所有配置的运行时可用性，不可用的发出 warn 日志（不阻塞执行）

#### Scenario: 预检结果缓存
- **GIVEN** 预检已在首次 `run()` 时执行
- **WHEN** 后续再次调用 `run()` 或 `stream()`
- **THEN** 不重复执行预检，直接跳过

#### Scenario: preflight 默认禁用
- **GIVEN** `scripts.preflight` 未配置或配置为 `false`
- **WHEN** 调用 `run()` 或 `stream()`
- **THEN** 不执行预检

#### Scenario: runtimeStatus 查询
- **WHEN** 调用 `hive.runtimeStatus()`
- **THEN** 返回各运行时的可用性、版本号和命令路径
