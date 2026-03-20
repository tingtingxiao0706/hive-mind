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
  loading?: LoadingConfig;
  scripts?: ScriptConfig;
  /** Choose adapter: 'auto' tries @skill-tools first, falls back to builtin */
  parser?: 'auto' | 'builtin';
  router?: 'auto' | 'builtin';
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'warn') */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** Max nesting depth for skill-to-skill calls (default: 5) */
  maxCallDepth?: number;
}

export type ModelConfig = Record<string, LanguageModel>;

export type SkillSource =
  | { type: 'local'; path: string }
  | { type: 'remote'; url: string }
  | { type: 'git'; url: string; branch?: string };

export interface LoadingConfig {
  strategy?: 'eager' | 'progressive' | 'lazy';
  maxActivatedSkills?: number;
  cacheSize?: number;
}

export interface ScriptConfig {
  enabled?: boolean;
  securityLevel?: SecurityLevel;
  allowedRuntimes?: string[];
  timeout?: number;
  maxOutputSize?: number;
  requireApproval?: boolean;
  /** Called before script execution when approval is required */
  onApproval?: (script: string, args: string[]) => Promise<boolean>;
  /** Whether to run runtime preflight checks on init */
  preflight?: boolean;
  /** Sandbox-specific configuration (only used when securityLevel is 'sandbox') */
  sandbox?: SandboxConfig;
}

export interface SandboxConfig {
  /** CPU time limit in milliseconds (default: 10000) */
  cpuTimeLimitMs?: number;
  /** Memory limit in MB (default: 128) */
  memoryLimitMb?: number;
  /** Deny-by-default permission declarations */
  permissions?: SandboxPermissions;
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
  message: string;
  model?: string;
  skills?: string[];
  /** Additional system prompt content */
  systemPrompt?: string;
  /** Max tokens for response */
  maxTokens?: number;
}

export interface RunResult {
  text: string;
  /** Skills that were activated for this run */
  activatedSkills: string[];
  /** Tool calls made during execution */
  toolCalls: ToolCallRecord[];
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RuntimeInfo {
  name: string;
  command: string;
  version: string;
  available: boolean;
}

export interface RuntimeStatus {
  [runtime: string]: RuntimeInfo & {
    tools?: Record<string, boolean>;
  };
}

export interface ExecutionStrategy {
  command: string;
  args: string[];
  runtime: string;
  isolated: boolean;
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
