# 类型定义

Hive-Mind 导出的完整 TypeScript 类型。

## 技能相关

### SkillMeta

轻量级技能索引条目（阶段 1: 发现）。

```typescript
interface SkillMeta {
  name: string;
  description: string;
  path: string;
  tags?: string[];
  xHive?: XHiveConfig;
}
```

### SkillContent

完整技能内容（阶段 2: 激活）。

```typescript
interface SkillContent extends SkillMeta {
  body: string;
  frontmatter: SkillFrontmatter;
  scripts: ScriptFile[];
  references: string[];
  assets: string[];
}
```

### SkillFrontmatter

```typescript
interface SkillFrontmatter {
  name: string;
  description: string;
  compatibility?: string;
  'allowed-tools'?: string;
  metadata?: Record<string, unknown>;
  license?: string;
  'x-hive'?: Record<string, unknown>;
  [key: string]: unknown;
}
```

### ScriptFile

```typescript
interface ScriptFile {
  relativePath: string;   // e.g. "scripts/format.sh"
  absolutePath: string;
  extension: string;      // e.g. "sh", "py"
}
```

## x-hive 扩展

### XHiveConfig

```typescript
interface XHiveConfig {
  agent?: boolean;
  maxSteps?: number;
  scripts?: XHiveScriptsConfig;
  models?: XHiveModelsConfig;
  workspace?: string;
}

interface XHiveScriptsConfig {
  approval?: boolean;
  timeout?: number;
  runtimes?: string[];
}

interface XHiveModelsConfig {
  preferred?: string;
  fallback?: string;
}
```

## 执行相关

### RunOptions / RunResult

```typescript
interface RunOptions {
  message: string;
  model?: string;
  skills?: string[];
  systemPrompt?: string;
  maxTokens?: number;
}

interface RunResult {
  text: string;
  activatedSkills: string[];
  toolCalls: ToolCallRecord[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### StreamOptions

```typescript
interface StreamOptions extends RunOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onScriptOutput?: (output: ScriptOutput) => void;
}
```

### ToolCallRecord

```typescript
interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}
```

## 脚本执行

### ScriptOutput

```typescript
interface ScriptOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

### RuntimeInfo / RuntimeStatus

```typescript
interface RuntimeInfo {
  name: string;
  command: string;
  version: string;
  available: boolean;
}

interface RuntimeStatus {
  [runtime: string]: RuntimeInfo & {
    tools?: Record<string, boolean>;
  };
}
```

## 安全

### SecurityLevel

```typescript
type SecurityLevel = 'basic' | 'strict' | 'sandbox';
```

### SandboxPermissions

```typescript
interface SandboxPermissions {
  fs?: { read?: string[]; write?: string[] };
  net?: boolean;
  env?: string[];
  childProcess?: boolean;
}
```

## Logger

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```
