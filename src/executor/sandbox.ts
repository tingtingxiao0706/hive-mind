import * as vm from 'node:vm';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  SandboxConfig,
  SandboxPermissions,
  ScriptOutput,
  Logger,
} from '../types.js';
import { truncateOutput } from './security.js';
import { createLogger } from '../utils/logger.js';

const DEFAULT_CPU_LIMIT_MS = 10_000;

export interface SandboxExecuteOptions {
  scriptPath: string;
  args?: string[];
  env?: Record<string, string>;
  skillDir: string;
  config?: SandboxConfig;
  maxOutputSize: number;
}

/**
 * Sandbox executor for JS/TS scripts using Node.js vm module.
 * Provides CPU time limits, restricted globals, and deny-by-default permissions.
 * Non-JS scripts (Python, Bash, etc.) are NOT handled here — they fall back
 * to strict mode in ScriptExecutor.
 */
export class SandboxExecutor {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger();
  }

  canSandbox(extension: string): boolean {
    return ['js', 'mjs', 'cjs'].includes(extension);
  }

  async execute(options: SandboxExecuteOptions): Promise<ScriptOutput> {
    const {
      scriptPath,
      args = [],
      env,
      skillDir,
      config,
      maxOutputSize,
    } = options;

    const cpuLimit = config?.cpuTimeLimitMs ?? DEFAULT_CPU_LIMIT_MS;
    const permissions = config?.permissions ?? {};

    this.logger.debug(`Sandbox: loading script ${scriptPath}`);

    let scriptContent: string;
    try {
      scriptContent = await fs.readFile(scriptPath, 'utf-8');
    } catch (err) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Failed to read script: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const stdout: string[] = [];
    const stderr: string[] = [];

    const sandboxGlobals = this.buildSandboxGlobals({
      args,
      env,
      skillDir,
      permissions,
      stdout,
      stderr,
    });

    const context = vm.createContext(sandboxGlobals, {
      name: `sandbox:${path.basename(scriptPath)}`,
    });

    try {
      const script = new vm.Script(scriptContent, {
        filename: path.basename(scriptPath),
      });

      script.runInContext(context, {
        timeout: cpuLimit,
        breakOnSigint: true,
      });

      return {
        exitCode: 0,
        stdout: truncateOutput(stdout.join(''), maxOutputSize),
        stderr: truncateOutput(stderr.join(''), maxOutputSize),
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes('Script execution timed out') ||
        errMsg.includes('timed out')
      ) {
        return {
          exitCode: 124,
          stdout: truncateOutput(stdout.join(''), maxOutputSize),
          stderr: truncateOutput(
            `Script exceeded CPU time limit (${cpuLimit}ms)\n${stderr.join('')}`,
            maxOutputSize,
          ),
        };
      }

      if (err instanceof SandboxExitError) {
        return {
          exitCode: err.exitCode,
          stdout: truncateOutput(stdout.join(''), maxOutputSize),
          stderr: truncateOutput(stderr.join(''), maxOutputSize),
        };
      }

      return {
        exitCode: 1,
        stdout: truncateOutput(stdout.join(''), maxOutputSize),
        stderr: truncateOutput(
          `${err instanceof Error ? err.message : String(err)}\n${stderr.join('')}`,
          maxOutputSize,
        ),
      };
    }
  }

  private buildSandboxGlobals(options: {
    args: string[];
    env?: Record<string, string>;
    skillDir: string;
    permissions: SandboxPermissions;
    stdout: string[];
    stderr: string[];
  }) {
    const { args, env, skillDir, permissions, stdout, stderr } = options;

    const allowedEnv: Record<string, string | undefined> = {};
    if (permissions.env) {
      for (const key of permissions.env) {
        allowedEnv[key] = env?.[key] ?? process.env[key];
      }
    }

    const sandboxConsole = {
      log: (...a: unknown[]) => { stdout.push(a.map(String).join(' ') + '\n'); },
      info: (...a: unknown[]) => { stdout.push(a.map(String).join(' ') + '\n'); },
      warn: (...a: unknown[]) => { stderr.push(a.map(String).join(' ') + '\n'); },
      error: (...a: unknown[]) => { stderr.push(a.map(String).join(' ') + '\n'); },
      debug: (...a: unknown[]) => { stdout.push(a.map(String).join(' ') + '\n'); },
    };

    const sandboxProcess = {
      argv: ['node', 'script.js', ...args],
      env: allowedEnv,
      cwd: () => skillDir,
      exit: (code?: number) => {
        throw new SandboxExitError(code ?? 0);
      },
      platform: process.platform,
      version: process.version,
    };

    const fsProxy = this.buildFsProxy(skillDir, permissions);

    return {
      console: sandboxConsole,
      process: sandboxProcess,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      fetch: permissions.net ? globalThis.fetch : undefined,
      require: undefined,
      __filename: 'script.js',
      __dirname: skillDir,

      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      URIError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURI,
      decodeURI,
      encodeURIComponent,
      decodeURIComponent,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      Buffer,
      atob: globalThis.atob,
      btoa: globalThis.btoa,
      structuredClone: globalThis.structuredClone,

      __sandboxFs: fsProxy,
    };
  }

  private buildFsProxy(
    skillDir: string,
    permissions: SandboxPermissions,
  ) {
    const readPaths = permissions.fs?.read ?? [];
    const writePaths = permissions.fs?.write ?? [];

    const resolveSafe = (filePath: string) => {
      const resolved = path.resolve(skillDir, filePath);
      return resolved;
    };

    const checkRead = (filePath: string) => {
      if (readPaths.length === 0) return false;
      const resolved = resolveSafe(filePath);
      return readPaths.some(allowed => {
        const absAllowed = path.resolve(skillDir, allowed);
        return resolved.startsWith(absAllowed);
      });
    };

    const checkWrite = (filePath: string) => {
      if (writePaths.length === 0) return false;
      const resolved = resolveSafe(filePath);
      return writePaths.some(allowed => {
        const absAllowed = path.resolve(skillDir, allowed);
        return resolved.startsWith(absAllowed);
      });
    };

    return {
      readFile: async (filePath: string) => {
        if (!checkRead(filePath)) {
          throw new Error(`Permission denied: cannot read "${filePath}"`);
        }
        return fs.readFile(resolveSafe(filePath), 'utf-8');
      },
      writeFile: async (filePath: string, content: string) => {
        if (!checkWrite(filePath)) {
          throw new Error(`Permission denied: cannot write "${filePath}"`);
        }
        return fs.writeFile(resolveSafe(filePath), content, 'utf-8');
      },
      readdir: async (dirPath: string) => {
        if (!checkRead(dirPath)) {
          throw new Error(`Permission denied: cannot read "${dirPath}"`);
        }
        return fs.readdir(resolveSafe(dirPath));
      },
      exists: async (filePath: string) => {
        if (!checkRead(filePath)) return false;
        try {
          await fs.access(resolveSafe(filePath));
          return true;
        } catch {
          return false;
        }
      },
    };
  }
}

export class SandboxExitError extends Error {
  public readonly exitCode: number;
  constructor(exitCode: number) {
    super(`Process exited with code ${exitCode}`);
    this.name = 'SandboxExitError';
    this.exitCode = exitCode;
  }
}
