# skill-registry Specification

## Purpose

提供统一的技能注册表接口，支持本地文件系统（LocalRegistry）、远程 HTTP（RemoteRegistry）和组合多源（CompositeRegistry）三种技能来源。

> 模块: `src/registry/index.ts`, `src/registry/local.ts`, `src/registry/remote.ts`, `src/registry/composite.ts` | 测试: `test/registry.test.ts` (5), `test/remote-registry.test.ts` (4) | 状态: 已实现

## Requirements

### Requirement: SkillRegistry 统一接口
系统 SHALL 提供 SkillRegistry 接口，定义 `scan()` 和 `load(name)` 方法。

#### Scenario: scan 扫描
- **WHEN** 调用 `registry.scan()`
- **THEN** 返回该注册表下所有技能的 `SkillMeta[]`

#### Scenario: load 加载
- **WHEN** 调用 `registry.load(name)`
- **THEN** 返回指定技能的 `SkillContent`，或 null

### Requirement: LocalRegistry 本地注册表
系统 SHALL 支持从本地文件系统目录扫描和加载技能。

#### Scenario: 目录扫描
- **WHEN** 配置 `{ type: 'local', path: './skills' }`
- **THEN** 递归扫描目录下所有 SKILL.md 文件，解析元数据并缓存

#### Scenario: 技能加载
- **WHEN** 调用 `load('translator')`
- **THEN** 返回该技能的完整 SKILL.md 内容 + scripts/ 目录中的脚本文件列表

### Requirement: RemoteRegistry 远程注册表
系统 SHALL 支持从 HTTP 远程源获取技能索引和内容。

#### Scenario: 远程索引获取
- **WHEN** 配置 `{ type: 'remote', url: 'https://registry.example.com/skills' }`
- **THEN** 通过 `GET {url}/index.json` 获取技能列表

#### Scenario: 网络不可达降级
- **WHEN** 远程注册表不可达
- **THEN** 回退到本地 cacheDir 中缓存的 SKILL.md 文件

#### Scenario: install 安装
- **WHEN** 调用 `install('https://github.com/user/skill.git')`
- **THEN** 通过 git clone 将技能仓库克隆到本地缓存目录

### Requirement: CompositeRegistry 组合注册表
系统 SHALL 支持合并多个注册表来源，按顺序优先。

#### Scenario: 多源合并
- **WHEN** 配置多个 skills 来源（local + remote）
- **THEN** scan 返回所有来源的技能，同名技能以第一个注册表为准

#### Scenario: 扫描结果缓存
- **WHEN** 多次调用 scan()
- **THEN** 使用缓存，不重复扫描
