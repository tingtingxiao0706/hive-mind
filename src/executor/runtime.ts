import { execa } from 'execa';
import type { RuntimeInfo, ExecutionStrategy, Logger } from '../types.js';
import { createLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// RuntimeResolver — cross-language runtime detection + strategy chains
// ---------------------------------------------------------------------------

export class RuntimeResolver {
  private cache = new Map<string, RuntimeInfo>();
  private logger: Logger;

  /** Platform-specific command candidates per runtime */
  private static readonly CANDIDATES: Record<string, string[]> = {
    python: process.platform === 'win32'
      ? ['py', 'python', 'python3']
      : ['python3', 'python'],
    bash: process.platform === 'win32'
      ? ['bash', 'sh']
      : ['bash', 'sh'],
    node: ['node'],
    deno: ['deno'],
    bun: ['bun'],
    ruby: ['ruby'],
    go: ['go'],
    uv: ['uv'],
    pipx: ['pipx'],
  };

  /** Version flag overrides (most tools use --version) */
  private static readonly VERSION_FLAGS: Record<string, string[]> = {
    go: ['version'],
  };

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger();
  }

  // -------------------------------------------------------------------------
  // Runtime detection
  // -------------------------------------------------------------------------

  async detect(name: string): Promise<RuntimeInfo> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const info = await this.detectRuntime(name);
    this.cache.set(name, info);
    return info;
  }

  private async detectRuntime(name: string): Promise<RuntimeInfo> {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const candidates = RuntimeResolver.CANDIDATES[name] ?? [name];

    for (const cmd of candidates) {
      try {
        await execa(whichCmd, [cmd]);
        const versionArgs = RuntimeResolver.VERSION_FLAGS[name] ?? ['--version'];
        const { stdout } = await execa(cmd, versionArgs);
        return {
          name,
          command: cmd,
          version: this.parseVersion(stdout),
          available: true,
        };
      } catch {
        continue;
      }
    }

    return { name, command: '', version: '', available: false };
  }

  private parseVersion(stdout: string): string {
    const match = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
    return match?.[1] ?? '';
  }

  // -------------------------------------------------------------------------
  // Execution strategy resolution
  // -------------------------------------------------------------------------

  async resolve(
    scriptPath: string,
    extension: string,
    compatibility?: string,
  ): Promise<ExecutionStrategy> {
    switch (extension) {
      case 'py':
        return this.resolvePython(scriptPath, compatibility);
      case 'sh':
        return this.resolveShell(scriptPath);
      case 'ts':
      case 'tsx':
        return this.resolveTypeScript(scriptPath);
      case 'js':
      case 'mjs':
      case 'cjs':
        return this.resolveNode(scriptPath);
      case 'rb':
        return this.resolveGeneric(scriptPath, 'ruby', ['ruby']);
      case 'go':
        return this.resolveGeneric(scriptPath, 'go', ['go', 'run']);
      default:
        throw new RuntimeNotFoundError(
          `No runtime strategy for ".${extension}" files. ` +
          `Supported: .py, .sh, .ts, .js, .rb, .go`,
        );
    }
  }

  // -------------------------------------------------------------------------
  // Python strategy chain
  // -------------------------------------------------------------------------

  private async resolvePython(
    scriptPath: string,
    compatibility?: string,
  ): Promise<ExecutionStrategy> {
    const inlineDeps = await this.detectPEP723Deps(scriptPath);
    const hasDeps = inlineDeps.length > 0;

    // Strategy 1: uv run (best — auto-isolated env + auto-installs PEP 723 deps)
    const uv = await this.detect('uv');
    if (uv.available) {
      return {
        command: uv.command,
        args: ['run', scriptPath],
        runtime: 'uv',
        isolated: true,
      };
    }

    // Strategy 2: pipx run (alternative isolation, only useful when deps exist)
    if (hasDeps) {
      const pipx = await this.detect('pipx');
      if (pipx.available) {
        return {
          command: pipx.command,
          args: ['run', scriptPath],
          runtime: 'pipx',
          isolated: true,
        };
      }
    }

    // Strategy 3: direct python execution (no dep management)
    const python = await this.detect('python');
    if (python.available) {
      if (compatibility) {
        const req = this.parsePythonVersionRequirement(compatibility);
        if (req && !this.satisfiesVersion(python.version, req)) {
          throw new RuntimeVersionError(
            `Requires Python ${req}, but system has Python ${python.version}`,
          );
        }
      }

      if (hasDeps) {
        this.logger.warn(
          `Script ${scriptPath} declares PEP 723 deps [${inlineDeps.join(', ')}], ` +
          `but neither uv nor pipx is installed. Dependencies may be missing.\n` +
          `Install uv: https://docs.astral.sh/uv/`,
        );
      }

      return {
        command: python.command,
        args: [scriptPath],
        runtime: 'python',
        isolated: false,
      };
    }

    // Strategy 4: runtime not found
    throw new RuntimeNotFoundError(
      `Python runtime not found.\n` +
      `Install options:\n` +
      `  Python: https://www.python.org/downloads/\n` +
      `  uv (recommended): https://docs.astral.sh/uv/`,
    );
  }

  // -------------------------------------------------------------------------
  // Shell strategy chain
  // -------------------------------------------------------------------------

  private async resolveShell(scriptPath: string): Promise<ExecutionStrategy> {
    const bash = await this.detect('bash');
    if (bash.available) {
      return {
        command: bash.command,
        args: [scriptPath],
        runtime: 'bash',
        isolated: false,
      };
    }

    throw new RuntimeNotFoundError(
      `Shell runtime (bash/sh) not found.\n` +
      (process.platform === 'win32'
        ? `On Windows, install Git Bash or WSL.`
        : `Ensure bash or sh is in PATH.`),
    );
  }

  // -------------------------------------------------------------------------
  // TypeScript strategy chain
  // -------------------------------------------------------------------------

  private async resolveTypeScript(scriptPath: string): Promise<ExecutionStrategy> {
    // Strategy 1: deno run
    const deno = await this.detect('deno');
    if (deno.available) {
      return {
        command: deno.command,
        args: ['run', '--allow-all', scriptPath],
        runtime: 'deno',
        isolated: true,
      };
    }

    // Strategy 2: bun run
    const bun = await this.detect('bun');
    if (bun.available) {
      return {
        command: bun.command,
        args: ['run', scriptPath],
        runtime: 'bun',
        isolated: false,
      };
    }

    // Strategy 3: npx tsx
    const node = await this.detect('node');
    if (node.available) {
      return {
        command: 'npx',
        args: ['tsx', scriptPath],
        runtime: 'tsx',
        isolated: false,
      };
    }

    throw new RuntimeNotFoundError(
      `TypeScript runtime not found. Install one of: deno, bun, or node (for npx tsx).`,
    );
  }

  // -------------------------------------------------------------------------
  // Node.js strategy
  // -------------------------------------------------------------------------

  private async resolveNode(scriptPath: string): Promise<ExecutionStrategy> {
    const node = await this.detect('node');
    if (node.available) {
      return {
        command: node.command,
        args: [scriptPath],
        runtime: 'node',
        isolated: false,
      };
    }

    throw new RuntimeNotFoundError(`Node.js not found. Install from https://nodejs.org/`);
  }

  // -------------------------------------------------------------------------
  // Generic strategy (ruby, go, etc.)
  // -------------------------------------------------------------------------

  private async resolveGeneric(
    scriptPath: string,
    runtimeName: string,
    runArgs: string[],
  ): Promise<ExecutionStrategy> {
    const rt = await this.detect(runtimeName);
    if (rt.available) {
      return {
        command: rt.command,
        args: [...runArgs.slice(1), scriptPath],
        runtime: runtimeName,
        isolated: false,
      };
    }

    throw new RuntimeNotFoundError(
      `Runtime "${runtimeName}" not found. Please install it and ensure it's in PATH.`,
    );
  }

  // -------------------------------------------------------------------------
  // PEP 723 detection
  // -------------------------------------------------------------------------

  async detectPEP723Deps(scriptPath: string): Promise<string[]> {
    const fs = await import('node:fs/promises');
    let content: string;
    try {
      content = await fs.readFile(scriptPath, 'utf-8');
    } catch {
      return [];
    }
    return parsePEP723Deps(content);
  }

  // -------------------------------------------------------------------------
  // Preflight check
  // -------------------------------------------------------------------------

  async preflight(runtimes: string[]): Promise<Record<string, RuntimeInfo>> {
    const results: Record<string, RuntimeInfo> = {};
    for (const name of runtimes) {
      const info = await this.detect(name);
      results[name] = info;
      if (!info.available) {
        this.logger.warn(`Runtime "${name}" not available`);
      } else {
        this.logger.info(`Runtime "${name}": ${info.command} v${info.version}`);
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private parsePythonVersionRequirement(compatibility: string): string | null {
    const match = compatibility.match(/Python\s*(\d+\.\d+(?:\+)?)/i);
    return match?.[1] ?? null;
  }

  private satisfiesVersion(actual: string, required: string): boolean {
    const req = required.replace('+', '');
    const [reqMajor, reqMinor] = req.split('.').map(Number);
    const [actMajor, actMinor] = actual.split('.').map(Number);
    if (reqMajor === undefined || actMajor === undefined) return true;
    if (actMajor > reqMajor) return true;
    if (actMajor === reqMajor && reqMinor !== undefined && actMinor !== undefined) {
      return actMinor >= reqMinor;
    }
    return actMajor >= reqMajor;
  }
}

// ---------------------------------------------------------------------------
// PEP 723 parser (exported for testing)
// ---------------------------------------------------------------------------

export function parsePEP723Deps(content: string): string[] {
  const match = content.match(/# \/\/\/ script\n([\s\S]*?)# \/\/\//);
  if (!match) return [];
  const block = match[1]!;
  const depsMatch = block.match(/# dependencies = \[([\s\S]*?)\]/);
  if (!depsMatch) return [];
  return depsMatch[1]!
    .split('\n')
    .map(line => {
      const m = line.match(/#\s*"([^"]+)"/);
      return m?.[1] ?? '';
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class RuntimeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeNotFoundError';
  }
}

export class RuntimeVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeVersionError';
  }
}
