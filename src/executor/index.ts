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
  /** 脚本相对路径（相对于技能目录），如 "scripts/format.sh" */
  script: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  /** 脚本所属的技能完整内容，用于提取 allowed-tools、compatibility 等安全校验信息 */
  skill: SkillContent;
}

/**
 * 脚本执行器——在安全边界内执行技能目录中的脚本。
 *
 * 这是整个脚本执行子系统的入口，被 createSkillTools() 生成的
 * run_script 工具调用。execute() 方法实现了一个 9 步安全管线：
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  所有安全级别都执行                                    │
 *   │  Step 1: validatePath      路径穿越防护               │
 *   │  Step 2: validateAllowed   allowed-tools 白名单       │
 *   │  Step 3: getExtension      解析文件扩展名              │
 *   ├─────────────────────────────────────────────────────┤
 *   │  strict / sandbox 级别                               │
 *   │  Step 4: onApproval        用户审批回调               │
 *   ├─────────────────────────────────────────────────────┤
 *   │  sandbox 级别 + JS 脚本                              │
 *   │  Step 5: SandboxExecutor   V8 vm 沙盒隔离执行        │
 *   ├─────────────────────────────────────────────────────┤
 *   │  basic / strict（或 sandbox 非 JS 回退）              │
 *   │  Step 6: RuntimeResolver   解析运行时策略链            │
 *   │  Step 7: validateRuntime   运行时白名单 (strict+)     │
 *   │  Step 8: buildEnv          环境变量隔离 (strict+)     │
 *   │  Step 9: execa             子进程执行                 │
 *   └─────────────────────────────────────────────────────┘
 *
 * 协作关系：
 *   engine.ts → createSkillTools() → ScriptExecutor.execute()
 *                                        ├─ security.ts   (校验函数)
 *                                        ├─ runtime.ts    (RuntimeResolver)
 *                                        └─ sandbox.ts    (SandboxExecutor)
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

    // ── Step 1: 路径穿越防护 ──
    // 所有级别都执行。将相对路径解析为绝对路径，
    // 拒绝 "../" 等试图逃逸技能目录的路径。
    const absoluteScript = validatePath(script, skillDir);

    // ── Step 2: allowed-tools 白名单 ──
    // 所有级别都执行。检查脚本路径是否在 SKILL.md 的
    // allowed-tools 声明中（如 "Bash(scripts/format.sh)"）。
    validateAllowedTools(script, skill.frontmatter['allowed-tools'] as string | undefined);

    // ── Step 3: 解析扩展名 ──
    // 用于决定走 sandbox 路径还是 child_process 路径，
    // 以及 RuntimeResolver 的策略链选择。
    const ext = this.getExtension(script);

    // ── Step 4: 用户审批 ──
    // 仅当 requireApproval=true 且提供了 onApproval 回调时触发。
    // 回调返回 false 则拒绝执行，返回 exitCode=-1。
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

    // ── Step 5: sandbox 沙盒路径 ──
    // 安全级别为 sandbox 且脚本为 JS/MJS/CJS 时，
    // 走 V8 vm 沙盒执行，不启动子进程。
    // 非 JS 脚本（Python/Bash 等）无法用 vm 沙盒，回退到下方的子进程路径。
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

    // ── Step 6: 解析运行时执行策略 ──
    // RuntimeResolver 根据扩展名选择策略链：
    //   .py  → uv run > pipx run > python3 > 报错
    //   .sh  → bash > sh > 报错
    //   .ts  → deno > bun > npx tsx > 报错
    //   .js  → node > 报错
    // 返回 { command, args, runtime, isolated }
    const compatibility = skill.frontmatter.compatibility as string | undefined;
    const strategy = await this.resolver.resolve(absoluteScript, ext, compatibility);

    // ── Step 7: 运行时白名单 ──
    // strict 和 sandbox 级别检查 strategy.runtime 是否在
    // allowedRuntimes 配置中（默认 ['bash', 'python', 'node']）。
    if (this.security.level !== 'basic') {
      validateRuntime(strategy.runtime, this.security.allowedRuntimes);
    }

    // ── Step 8: 构建环境变量 ──
    // basic: 继承宿主进程全部环境变量 + 用户传入的覆盖
    // strict/sandbox: buildStrictEnv() 只保留 PATH/HOME/LANG 等最小集 + 用户显式传入
    const execEnv = this.security.level === 'basic'
      ? { ...process.env, ...env }
      : buildStrictEnv(env);

    // ── Step 9: 子进程执行 ──
    // 通过 execa 启动子进程，参数以数组传递（不经 shell 解析，
    // 避免 PowerShell 等环境的引号转义问题——见 architecture.md 15.7）。
    // reject: false 使非零退出码不抛异常，由调用方根据 exitCode 判断。
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

  /**
   * 运行时预检：检测 allowedRuntimes 中的运行时是否可用。
   * 在 createHiveMind 初始化时调用（preflight: true），
   * 结果可通过 hive.runtimeStatus() 查询。
   */
  async preflight(runtimes: string[]) {
    return this.resolver.preflight(runtimes);
  }

  /**
   * 从 SKILL.md 的绝对路径反推技能根目录。
   * 脚本执行时 cwd 设为此目录，脚本中的相对路径以此为基准。
   */
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
