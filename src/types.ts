import type { LanguageModel } from 'ai';

// ---------------------------------------------------------------------------
// Skill metadata & content
// ---------------------------------------------------------------------------

/** Lightweight skill index entry (Phase 1: Discovery) */
export interface SkillMeta {
  name: string;
  description: string;
  /** Absolute path to SKILL.md or the skill directory */
  path: string;
  /** Tags / keywords for routing (from metadata.tags) */
  tags?: string[];
  /** Parsed x-hive extension fields */
  xHive?: XHiveConfig;
}

/** Full skill content (Phase 2: Activation) */
export interface SkillContent extends SkillMeta {
  /** Raw markdown body (instructions for LLM) */
  body: string;
  /** Standard SKILL.md frontmatter fields */
  frontmatter: SkillFrontmatter;
  /** Discovered script files in scripts/ directory */
  scripts: ScriptFile[];
  /** Discovered reference files in references/ directory */
  references: string[];
  /** Discovered asset files in assets/ directory */
  assets: string[];
  /** Absolute paths of local files linked in the body via markdown syntax */
  linkedFiles: string[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  compatibility?: string;
  'allowed-tools'?: string;
  metadata?: Record<string, unknown>;
  license?: string;
  /** Raw x-hive block (pre-parse) */
  'x-hive'?: Record<string, unknown>;
  /** Pass-through for any other standard fields */
  [key: string]: unknown;
}

export interface ScriptFile {
  /** Relative path from skill root, e.g. "scripts/format.sh" */
  relativePath: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** File extension without dot, e.g. "sh", "py" */
  extension: string;
}

// ---------------------------------------------------------------------------
// x-hive extension config
// ---------------------------------------------------------------------------

export interface XHiveConfig {
  agent?: boolean;
  maxSteps?: number;
  scripts?: XHiveScriptsConfig;
  models?: XHiveModelsConfig;
  workspace?: string;
}

export interface XHiveScriptsConfig {
  approval?: boolean;
  timeout?: number;
  runtimes?: string[];
}

export interface XHiveModelsConfig {
  preferred?: string;
  fallback?: string;
}

// ---------------------------------------------------------------------------
// HiveMind configuration
// ---------------------------------------------------------------------------

export interface HiveMindConfig {
  models: ModelConfig;
  skills: SkillSource[];
  workspace?: string;
  loading?: LoadingConfig; // 加载配置 (strategy: 加载策略, maxActivatedSkills: 最大激活技能数, cacheSize: 缓存大小)
  scripts?: ScriptConfig; // 脚本配置 (enabled: 是否启用, securityLevel: 安全级别, allowedRuntimes: 允许的运行时, timeout: 超时时间, maxOutputSize: 最大输出大小, requireApproval: 是否需要审批, onApproval: 审批回调, preflight: 是否需要预检, sandbox: 沙盒配置)
  /** Choose adapter: 'auto' tries @skill-tools first, falls back to builtin */
  parser?: 'auto' | 'builtin'; // 解析器 (auto: 自动选择, builtin: 内置解析器)
  router?: 'auto' | 'builtin'; // 路由器 (auto: 自动选择, builtin: 内置路由器)
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'warn') */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'; // 日志级别 (debug: 调试, info: 信息, warn: 警告, error: 错误, silent: 静默)
  /** Max nesting depth for skill-to-skill calls (default: 5) */
  maxCallDepth?: number; // 技能调用最大嵌套深度 (default: 5)
}

export type ModelConfig = Record<string, LanguageModel>;

export type SkillSource =
  | { type: 'local'; path: string } // 本地技能源 (path: 技能目录路径)
  | { type: 'remote'; url: string } // 远程技能源 (url: 技能源URL)
  | { type: 'git'; url: string; branch?: string } // 远程技能源 (url: 技能源URL, branch: 分支名称)

export interface LoadingConfig {
  strategy?: 'eager' | 'progressive' | 'lazy' | 'llm-routed'; // 加载策略 (eager: 立即加载, progressive: 渐进式加载, lazy: 懒加载, llm-routed: LLM 驱动路由)
  maxActivatedSkills?: number; // 引擎层截断：注入 system prompt 的技能数 (default: 5)
  routerTopK?: number; // 路由层截断：匹配返回的候选技能数 (default: 5)
  cacheSize?: number; // 缓存大小 (default: 50)
  catalogueTokenBudget?: number; // llm-routed 模式下技能目录最大 token 预算（超出截断）
}

export interface ScriptConfig {
  enabled?: boolean; // 是否启用脚本执行 (default: false)
  securityLevel?: SecurityLevel; // 安全级别 (basic: 基本, strict: 严格, sandbox: 沙盒)
  allowedRuntimes?: string[]; // 允许的运行时 (default: [])
  timeout?: number; // 超时时间 (default: 10000)
  maxOutputSize?: number; // 最大输出大小 (default: 10000)
  requireApproval?: boolean; // 是否需要审批 (default: false)
  onApproval?: (script: string, args: string[]) => Promise<boolean>; // 审批回调 (script: 脚本名称, args: 脚本参数)
  preflight?: boolean; // 是否需要预检 (default: false)
  sandbox?: SandboxConfig; // 沙盒配置 (cpuTimeLimitMs: CPU时间限制, memoryLimitMb: 内存限制, permissions: 权限配置)
}

export interface SandboxConfig {
  /** CPU time limit in milliseconds (default: 10000) */
  cpuTimeLimitMs?: number; // CPU时间限制 (default: 10000)
  /** Memory limit in MB (default: 128) */
  memoryLimitMb?: number; // 内存限制 (default: 128)
  /** Deny-by-default permission declarations */
  permissions?: SandboxPermissions; // 权限配置 (fs: 文件系统权限, net: 网络权限, env: 环境变量权限, childProcess: 子进程权限)
}

export interface SandboxPermissions {
  /** File system access: read/write path whitelists */
  fs?: { read?: string[]; write?: string[] };
  /** Network access (default: false) */
  net?: boolean;
  /** Allowed environment variables (default: none) */
  env?: string[];
  /** Allow spawning child processes (default: false) */
  childProcess?: boolean;
}

export type SecurityLevel = 'basic' | 'strict' | 'sandbox';

export interface WorkspaceConfig {
  name: string;
  skills: SkillSource[];
  models?: ModelConfig;
  scripts?: ScriptConfig;
}

// ---------------------------------------------------------------------------
// Run / Stream options and results
// ---------------------------------------------------------------------------

export interface RunOptions {
  message: string; // 消息 (message: 消息内容)
  model?: string; // 模型 (model: 模型名称)
  skills?: string[]; // 技能 (skills: 技能名称)
  /** Additional system prompt content */
  systemPrompt?: string; // 系统提示 (systemPrompt: 系统提示内容)
  /** Max tokens for response */
  maxTokens?: number; // 最大Token数 (maxTokens: 最大Token数)
}

export interface RunResult {
  text: string; // 文本 (text: 文本内容)
  /** Skills that were activated for this run */
  activatedSkills: string[]; // 激活的技能 (activatedSkills: 激活的技能名称)
  /** Tool calls made during execution */
  toolCalls: ToolCallRecord[]; // 工具调用 (toolCalls: 工具调用记录)
  /** Token usage statistics */
  usage?: { // 使用统计 (usage: 使用统计)
    promptTokens: number; // 提示Token数 (promptTokens: 提示Token数)
    completionTokens: number; // 完成Token数 (completionTokens: 完成Token数)
    totalTokens: number; // 总Token数 (totalTokens: 总Token数)
  };
}

export interface StreamOptions extends RunOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onScriptOutput?: (output: ScriptOutput) => void;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

// ---------------------------------------------------------------------------
// Script execution types
// ---------------------------------------------------------------------------

export interface ScriptOutput {
  exitCode: number; // 退出码 (exitCode: 退出码)
  stdout: string; // 标准输出 (stdout: 标准输出内容)
  stderr: string; // 标准错误 (stderr: 标准错误内容)
}

export interface RuntimeInfo {
  name: string; // 名称 (name: 名称)
  command: string; // 命令 (command: 命令)
  version: string; // 版本 (version: 版本)
  available: boolean; // 是否可用 (available: 是否可用)
}

export interface RuntimeStatus {
  [runtime: string]: RuntimeInfo & {
    tools?: Record<string, boolean>;
  };
}

export interface ExecutionStrategy {
  command: string; // 命令 (command: 命令)
  args: string[]; // 参数 (args: 参数)
  runtime: string; // 运行时 (runtime: 运行时)
  isolated: boolean; // 是否隔离 (isolated: 是否隔离)
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
