import { execa } from 'execa';
import type {
  ScriptConfig,
  ScriptOutput,
  SkillContent,
  Logger,
} from '../types.js';
import { RuntimeResolver } from './runtime.js';
import { SandboxExecutor } from './sandbox.js';
import {
  createSecurityContext,
  validatePath,
  validateAllowedTools,
  validateRuntime,
  truncateOutput,
  buildStrictEnv,
} from './security.js';
import type { SecurityContext } from './security.js';
import { createLogger } from '../utils/logger.js';

export interface ScriptExecutorOptions {
  config?: ScriptConfig;
  logger?: Logger;
}

export interface ExecuteOptions {
  script: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  skill: SkillContent;
}

/**
 * Executes scripts within security boundaries.
 * Supports basic, strict, and sandbox security levels.
 */
export class ScriptExecutor {
  private resolver: RuntimeResolver;
  private sandbox: SandboxExecutor;
  private security: SecurityContext;
  private config: ScriptConfig | undefined;
  private logger: Logger;

  constructor(options?: ScriptExecutorOptions) {
    this.logger = options?.logger ?? createLogger();
    this.resolver = new RuntimeResolver(this.logger);
    this.sandbox = new SandboxExecutor(this.logger);
    this.security = createSecurityContext(options?.config);
    this.config = options?.config;
  }

  async execute(options: ExecuteOptions): Promise<ScriptOutput> {
    const { script, args = [], env, timeout, skill } = options;

    const skillDir = this.resolveSkillDir(skill.path);

    // Step 1: path traversal guard (all levels)
    const absoluteScript = validatePath(script, skillDir);

    // Step 2: allowed-tools whitelist check (all levels)
    validateAllowedTools(script, skill.frontmatter['allowed-tools'] as string | undefined);

    // Step 3: resolve extension
    const ext = this.getExtension(script);

    // Step 4: approval check (strict + sandbox)
    if (this.security.requireApproval && this.security.onApproval) {
      const approved = await this.security.onApproval(script, args);
      if (!approved) {
        return {
          exitCode: -1,
          stdout: '',
          stderr: 'Script execution was denied by approval callback',
        };
      }
    }

    // Step 5: sandbox path for JS scripts at sandbox level
    if (this.security.level === 'sandbox' && this.sandbox.canSandbox(ext)) {
      this.logger.info(`Sandbox executing: ${script}`);
      return this.sandbox.execute({
        scriptPath: absoluteScript,
        args,
        env,
        skillDir,
        config: this.config?.sandbox,
        maxOutputSize: this.security.maxOutputSize,
      });
    }

    // Step 6: resolve execution strategy (basic / strict, or sandbox fallback for non-JS)
    const compatibility = skill.frontmatter.compatibility as string | undefined;
    const strategy = await this.resolver.resolve(absoluteScript, ext, compatibility);

    // Step 7: runtime whitelist check (strict + sandbox)
    if (this.security.level !== 'basic') {
      validateRuntime(strategy.runtime, this.security.allowedRuntimes);
    }

    // Step 8: build env
    const execEnv = this.security.level === 'basic'
      ? { ...process.env, ...env }
      : buildStrictEnv(env);

    // Step 9: execute via child process
    const execTimeout = timeout ?? this.security.timeout;
    this.logger.info(
      `Executing [${this.security.level}]: ${strategy.command} ${[...strategy.args, ...args].join(' ')}`,
    );

    try {
      const result = await execa(strategy.command, [...strategy.args, ...args], {
        cwd: skillDir,
        env: execEnv,
        timeout: execTimeout,
        reject: false,
        stripFinalNewline: true,
      });

      return {
        exitCode: result.exitCode ?? 0,
        stdout: truncateOutput(result.stdout, this.security.maxOutputSize),
        stderr: truncateOutput(result.stderr, this.security.maxOutputSize),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: '',
        stderr: truncateOutput(message, this.security.maxOutputSize),
      };
    }
  }

  async preflight(runtimes: string[]) {
    return this.resolver.preflight(runtimes);
  }

  private resolveSkillDir(skillPath: string): string {
    if (
      skillPath.endsWith('SKILL.md') ||
      skillPath.endsWith('skill.md')
    ) {
      const idx = Math.max(
        skillPath.lastIndexOf('/'),
        skillPath.lastIndexOf('\\'),
      );
      return idx > 0 ? skillPath.slice(0, idx) : '.';
    }
    return skillPath;
  }

  private getExtension(scriptPath: string): string {
    const lastDot = scriptPath.lastIndexOf('.');
    return lastDot > 0 ? scriptPath.slice(lastDot + 1) : '';
  }
}
