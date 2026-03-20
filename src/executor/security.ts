import * as path from 'node:path';
import type { ScriptConfig, SecurityLevel } from '../types.js';

export interface SecurityContext {
  level: SecurityLevel;
  allowedRuntimes: string[];
  maxOutputSize: number;
  timeout: number;
  requireApproval: boolean;
  onApproval?: (script: string, args: string[]) => Promise<boolean>;
}

export function createSecurityContext(config?: ScriptConfig): SecurityContext {
  return {
    level: config?.securityLevel ?? 'strict',
    allowedRuntimes: config?.allowedRuntimes ?? ['bash', 'python', 'node'],
    maxOutputSize: config?.maxOutputSize ?? 30_000,
    timeout: config?.timeout ?? 30_000,
    requireApproval: config?.requireApproval ?? false,
    onApproval: config?.onApproval,
  };
}

/**
 * Validate that a script path does not escape the skill directory.
 * Throws on path traversal attempts.
 */
export function validatePath(
  scriptRelative: string,
  skillDir: string,
): string {
  const normalized = path.normalize(scriptRelative);

  if (
    normalized.startsWith('..') ||
    path.isAbsolute(normalized) ||
    normalized.includes('..' + path.sep)
  ) {
    throw new PathTraversalError(
      `Path traversal detected: "${scriptRelative}" escapes skill directory`,
    );
  }

  const absolutePath = path.resolve(skillDir, normalized);
  const resolvedSkillDir = path.resolve(skillDir);

  if (!absolutePath.startsWith(resolvedSkillDir)) {
    throw new PathTraversalError(
      `Resolved path "${absolutePath}" is outside skill directory "${resolvedSkillDir}"`,
    );
  }

  return absolutePath;
}

/**
 * Check if a script is listed in the skill's allowed-tools declaration.
 */
export function validateAllowedTools(
  scriptRelative: string,
  allowedTools?: string,
): void {
  if (!allowedTools) return;

  const normalized = scriptRelative.replace(/\\/g, '/');
  if (!allowedTools.includes(normalized)) {
    throw new ScriptNotAllowedError(
      `Script "${scriptRelative}" is not declared in allowed-tools: "${allowedTools}"`,
    );
  }
}

/**
 * Validate the runtime is in the whitelist (strict + sandbox levels).
 */
export function validateRuntime(
  runtime: string,
  allowed: string[],
): void {
  if (allowed.length === 0) return;
  if (!allowed.includes(runtime)) {
    throw new RuntimeNotAllowedError(
      `Runtime "${runtime}" is not in allowed list: [${allowed.join(', ')}]`,
    );
  }
}

/**
 * Truncate output to maxOutputSize to prevent context window explosion.
 */
export function truncateOutput(output: string, maxSize: number): string {
  if (output.length <= maxSize) return output;
  const truncated = output.slice(0, maxSize);
  return truncated + `\n... [truncated, ${output.length - maxSize} chars omitted]`;
}

/**
 * Build a sanitized environment for strict mode.
 * Only explicitly passed env vars are included.
 */
export function buildStrictEnv(
  userEnv?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: process.env['HOME'] ?? process.env['USERPROFILE'] ?? '',
    LANG: process.env['LANG'] ?? 'en_US.UTF-8',
  };

  if (process.platform === 'win32') {
    env['SYSTEMROOT'] = process.env['SYSTEMROOT'] ?? '';
    env['COMSPEC'] = process.env['COMSPEC'] ?? '';
  }

  if (userEnv) {
    Object.assign(env, userEnv);
  }

  return env;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

export class ScriptNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptNotAllowedError';
  }
}

export class RuntimeNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeNotAllowedError';
  }
}
