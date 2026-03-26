import type {
  HiveMindConfig,
  RunOptions,
  RunResult,
  StreamOptions,
  SkillMeta,
  SkillContent,
  RuntimeStatus,
  ToolCallRecord,
} from './types.js';
import { SkillLoader } from './loader/index.js';
import type { SkillParser } from './loader/index.js';
import { BuiltinAdapter } from './loader/adapters/builtin.js';
import { SkillRouter } from './router/index.js';
import type { SkillMatcher } from './router/index.js';
import { KeywordAdapter } from './router/adapters/keyword.js';
import type { SkillRegistry } from './registry/index.js';
import { CompositeRegistry } from './registry/composite.js';
import { LocalRegistry } from './registry/local.js';
import { RemoteRegistry } from './registry/remote.js';
import { ScriptExecutor } from './executor/index.js';
import { createSkillTools } from './executor/tools.js';
import { McpClientManager } from './mcp/index.js';
import { createLogger } from './utils/logger.js';
import { z } from 'zod';
import { tool } from 'ai';

/** HiveMind 实例的公共接口 */
export interface HiveMind {
  run(options: RunOptions): Promise<RunResult>;
  stream(options: StreamOptions): Promise<AsyncIterable<string>>;
  list(): Promise<SkillMeta[]>;
  search(query: string): Promise<SkillMeta[]>;
  install(source: string): Promise<string>;
  runtimeStatus(): Promise<RuntimeStatus>;
  dispose(): Promise<void>;
}

/**
 * 创建 HiveMind 实例——整个库的入口。
 *
 * 采用闭包工厂模式（非 class），所有子系统和运行时状态封在闭包内。
 * 内部编排三阶段管线：Phase 1 发现 → Phase 2 激活 → Phase 3 执行。
 * 详见 architecture.md 4.1 节。
 */
export function createHiveMind(config: HiveMindConfig): HiveMind {
  const maxCallDepth = config.maxCallDepth ?? 5;
  const logger = createLogger(config.logLevel ?? 'warn');

  // ── call_skill 递归控制状态 ──
  // callDepth: 当前嵌套深度，用于防止递归死循环（每次 call_skill 进入 +1，完成 -1）
  // callSeq:   顺序调用计数器，用于日志追踪（call_skill #1, #2, #3）
  // callCache: 去重缓存，同一 skill+message 不重复执行（应对弱模型重复调工具）
  // 三者在每次顶层 run() 调用时（callDepth === 0）重置
  let callDepth = 0;
  let callSeq = 0;
  const callCache = new Map<string, { text: string; activatedSkills: string[]; usage?: unknown }>();

  // ── 子系统初始化 ──
  // parser / matcher 使用代理模式：初始指向内置实现，
  // config.parser/router === 'auto' 时由 ensureAdapters() 惰性替换为 @skill-tools 实现。
  // 代理对象在 SkillLoader / LocalRegistry / SkillRouter 中按引用持有，
  // 替换 parserImpl/matcherImpl 后所有消费方自动切换。
  let parserImpl: SkillParser = new BuiltinAdapter();
  let matcherImpl: SkillMatcher = new KeywordAdapter();

  const parser: SkillParser = {
    parse: (filePath) => parserImpl.parse(filePath),
    parseContent: (content, meta) => parserImpl.parseContent(content, meta),
    resolveFiles: (searchPath) => parserImpl.resolveFiles(searchPath),
    countTokens: (text) => parserImpl.countTokens(text),
  };

  const matcher: SkillMatcher = {
    index: (skills) => matcherImpl.index(skills),
    match: (query, topK) => matcherImpl.match(query, topK),
  };

  const loader = new SkillLoader({
    parser,
    cacheSize: config.loading?.cacheSize,
    logger,
  });

  const router = new SkillRouter({ matcher, topK: config.loading?.routerTopK, logger });

  // ScriptExecutor 仅在 scripts.enabled 时创建，否则为 null，
  // 后续 buildToolsForSkills() 检测到 null 时不注入脚本工具
  const scriptsEnabled = config.scripts?.enabled ?? false;
  const executor = scriptsEnabled
    ? new ScriptExecutor({ config: config.scripts, logger })
    : null;

  // McpClientManager 仅在 config.mcp 配置时创建，惰性连接
  const mcpManager = config.mcp
    ? new McpClientManager(config.mcp, logger)
    : null;

  // 根据 config.skills 数组创建对应的注册表实例，
  // remote 和 git 类型统一走 RemoteRegistry（git 的 branch 字段当前未使用）
  const registries: SkillRegistry[] = config.skills.map(source => {
    if (source.type === 'local') {
      return new LocalRegistry({ path: source.path, parser, logger });
    }
    if (source.type === 'remote') {
      return new RemoteRegistry({ url: source.url, parser, logger });
    }
    if (source.type === 'git') {
      return new RemoteRegistry({ url: source.url, parser, logger });
    }
    throw new Error(`Registry type "${(source as { type: string }).type}" is not supported`);
  });

  const registry = new CompositeRegistry(registries);

  const strategy = config.loading?.strategy ?? 'progressive';

  // Phase 1 扫描结果缓存，首次调用后常驻，install() 后置 null 强制重扫
  let skillIndex: SkillMeta[] | null = null;

  // eager 模式预加载缓存，首次 ensureIndex 时填充，install() 后置 null 强制重建
  let eagerContents: Map<string, SkillContent> | null = null;

  // 运行时预检标记，首次 run()/stream() 时执行一次
  let preflightDone = false;

  /**
   * 惰性运行时预检——首次 run()/stream() 时执行。
   * 仅当 scripts.enabled && scripts.preflight === true 时触发。
   * 预检结果由 RuntimeResolver 内部缓存，后续 runtimeStatus() 直接命中。
   */
  async function ensurePreflight(): Promise<void> {
    if (preflightDone || !executor || !(config.scripts?.preflight)) return;
    preflightDone = true;
    const runtimes = config.scripts?.allowedRuntimes ?? ['bash', 'python', 'node'];
    logger.info(`Preflight: checking ${runtimes.length} runtimes: [${runtimes.join(', ')}]...`);
    await executor.preflight(runtimes);
  }

  let mcpConnected = false;

  async function ensureMcpConnected(): Promise<void> {
    if (mcpConnected || !mcpManager) return;
    mcpConnected = true;
    await mcpManager.connect();
  }

  // 适配器初始化标记，ensureAdapters() 仅执行一次
  let adaptersReady = false;

  /**
   * 惰性适配器切换——首次 ensureIndex() 或 lazy 加载前执行。
   *
   * config.parser === 'auto' 时动态 import @skill-tools/core（v0.2.2），
   * config.router === 'auto' 时动态 import @skill-tools/router（v0.2.2），
   * 包未安装则静默回退到内置实现。
   */
  async function ensureAdapters(): Promise<void> {
    if (adaptersReady) return;
    adaptersReady = true;

    if (config.parser === 'auto') {
      try {
        const corePkg = '@skill-tools/core';
        const core = await import(/* webpackIgnore: true */ corePkg);
        const { SkillToolsParserAdapter } = await import('./loader/adapters/skill-tools.js');
        parserImpl = new SkillToolsParserAdapter(core);
        logger.info('Adapter: using @skill-tools/core parser');
      } catch {
        logger.warn('Adapter: @skill-tools/core not available, falling back to builtin parser');
      }
    }

    if (config.router === 'auto') {
      try {
        const routerPkg = '@skill-tools/router';
        const { SkillRouter: STRouter } = await import(/* webpackIgnore: true */ routerPkg);
        const { BM25Adapter } = await import('./router/adapters/bm25.js');
        matcherImpl = new BM25Adapter(new STRouter());
        logger.info('Adapter: using @skill-tools/router BM25 matcher');
      } catch {
        logger.warn('Adapter: @skill-tools/router not available, falling back to builtin keyword matcher');
      }
    }
  }

  /**
   * Phase 1: 发现——惰性单次执行。
   * 扫描所有注册表拿到 name + description 轻量元数据，构建路由索引。
   * 后续调用直接返回缓存，不重复扫描。
   */
  async function ensureIndex(): Promise<SkillMeta[]> {
    if (!skillIndex) {
      await ensureAdapters();
      logger.info('Phase 1: Discovery — scanning skill sources...');
      skillIndex = await registry.scan();
      logger.info(`Phase 1: Discovery — found ${skillIndex.length} skills:`);
      for (const s of skillIndex) {
        logger.debug(`  - ${s.name}: ${s.description}`);
      }
      await router.buildIndex(skillIndex);
      logger.info('Phase 1: Discovery — index built, ready for routing');

      // eager 模式：索引构建后立即预加载所有技能的完整内容
      if (strategy === 'eager') {
        logger.info(`Phase 1+: Eager — preloading all ${skillIndex.length} skill contents...`);
        eagerContents = new Map();
        const contents = await Promise.all(
          skillIndex.map(s => loader.loadFull(s.path)),
        );
        for (const c of contents) {
          eagerContents.set(c.name, c);
        }
        logger.info(`Phase 1+: Eager — preloaded ${eagerContents.size} skills`);
      }
    }
    return skillIndex;
  }

  /**
   * 为激活的技能构建脚本工具（run_script / list_skill_files / read_resource）。
   * 仅当 executor 存在（scripts.enabled）且技能包含 scripts/ 或 references/ 时注入。
   */
  function buildToolsForSkills(
    skills: SkillContent[],
  ): Record<string, unknown> {
    if (!executor) return {};
    const allTools: Record<string, unknown> = {};
    for (const skill of skills) {
      if (skill.scripts.length > 0 || skill.references.length > 0 || skill.linkedFiles.length > 0) {
        const skillTools = createSkillTools(executor, skill);
        Object.assign(allTools, skillTools);
      }
    }
    return allTools;
  }

  /**
   * 构建 call_skill 工具——技能链调用的核心。
   * LLM 可通过此工具在运行时委托子任务给其他技能。
   *
   * 三层保护机制：
   *   1. 深度限制：callDepth >= maxCallDepth 时拒绝，防止递归死循环
   *   2. 去重缓存：同一 skill+message 的重复调用直接返回，应对弱模型重复调工具
   *   3. 序号追踪：callSeq 递增，日志输出 call_skill #1, #2, #3
   *
   * 递归机制：callDepth++ → 递归调用 runFn (即 hiveMind.run) → callDepth-- (finally)
   */
  function buildCallSkillTool(
    runFn: (options: RunOptions) => Promise<RunResult>,
    currentModel: string,
  ): Record<string, unknown> {
    return {
      call_skill: tool({
        description:
          'Call another skill by name or by query. Use this to delegate subtasks to specialized skills. ' +
          'Provide either a specific skill name or a natural-language query to auto-match the best skill.',
        parameters: z.object({
          message: z.string().describe('The message/task to send to the target skill'),
          skill: z.string().optional().describe('Exact skill name to invoke (e.g. "translator")'),
          query: z.string().optional().describe('Natural-language query to auto-match a skill (used if skill name is not provided)'),
        }),
        execute: async ({ message, skill, query }: { message: string; skill?: string; query?: string }) => {
          if (callDepth >= maxCallDepth) {
            logger.warn(`call_skill: max depth ${maxCallDepth} reached, rejecting call`);
            return { error: `Max skill call depth (${maxCallDepth}) exceeded. Cannot call more skills.` };
          }

          // 去重：截取 message 前 200 字符作为 key，避免长消息的缓存 key 过大
          const cacheKey = `${skill ?? query ?? ''}::${message.slice(0, 200)}`;
          const cached = callCache.get(cacheKey);
          if (cached) {
            callSeq++;
            logger.info(`call_skill #${callSeq}: [DEDUP] skill="${skill}" already called with same message, returning cached result`);
            return cached;
          }

          callDepth++;
          callSeq++;
          const seq = callSeq;
          logger.info(`call_skill #${seq}: depth=${callDepth}, target=${skill ?? `query:"${query}"`}`);

          try {
            // 有 skill 名称时显式指定，否则将 query 拼入 message 走自动路由
            const options: RunOptions = {
              message: query && !skill ? `${query}\n\n${message}` : message,
              model: currentModel,
              ...(skill ? { skills: [skill] } : {}),
            };

            const result = await runFn(options);
            logger.info(`call_skill #${seq}: completed, activated=[${result.activatedSkills.join(', ')}]`);

            const response = {
              text: result.text,
              activatedSkills: result.activatedSkills,
              usage: result.usage,
            };
            callCache.set(cacheKey, response);
            return response;
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          } finally {
            callDepth--;
          }
        },
      }),
    };
  }

  /**
   * 将技能元数据列表格式化为 system prompt 中的技能目录。
   * llm-routed 策略使用，让 LLM 从目录中选择需要激活的技能。
   */
  function buildSkillCatalogue(metas: SkillMeta[]): string {
    const budget = config.loading?.catalogueTokenBudget;
    const lines: string[] = [
      '## Available Skills',
      '你可以通过 activate_skill 工具激活以下技能。如果用户的请求不需要任何技能，直接回答即可。',
      '',
    ];
    let tokenEstimate = Math.ceil(lines.join('\n').length / 4);

    for (const meta of metas) {
      const line = `- ${meta.name}: ${meta.description}`;
      const lineTokens = Math.ceil(line.length / 4);
      if (budget && tokenEstimate + lineTokens > budget) {
        lines.push('- ...（目录已截断，可通过 activate_skill 尝试激活未列出的技能）');
        break;
      }
      lines.push(line);
      tokenEstimate += lineTokens;
    }

    return lines.join('\n');
  }

  /**
   * 构建 activate_skill 工具——llm-routed 策略的核心。
   * LLM 调用此工具选择需要的技能，引擎负责加载和校验。
   * 激活的技能内容收集到 activatedContents 中，供后续执行阶段使用。
   */
  function buildActivateSkillTool(
    metas: SkillMeta[],
    activatedContents: SkillContent[],
    activateCache: Map<string, SkillContent>,
    maxActivated: number,
  ): Record<string, unknown> {
    // 同步锁定集合，防止并行工具调用（SDK 可能并行执行同一 response 中的多个 tool call）
    const pending = new Set<string>();

    return {
      activate_skill: tool({
        description:
          'Activate a skill to get its full instructions and tools. ' +
          'Call this for each skill you need before working on the task.',
        parameters: z.object({
          name: z.string().describe('The skill name from the Available Skills list'),
          reason: z.string().optional().describe('Why this skill is needed (for logging)'),
        }),
        execute: async ({ name, reason }: { name: string; reason?: string }) => {
          const cached = activateCache.get(name);
          if (cached) {
            logger.info(`activate_skill: "${name}" already activated, returning cached`);
            return { activated: true, name, description: cached.description, instructions: cached.body };
          }

          if (pending.has(name)) {
            logger.info(`activate_skill: "${name}" already being activated, skipping duplicate`);
            return { activated: true, name, description: '', instructions: '(duplicate call, already loading)' };
          }

          if (activateCache.size + pending.size >= maxActivated) {
            logger.warn(`activate_skill: max activated skills (${maxActivated}) reached, rejecting "${name}"`);
            return { error: `Max activated skills (${maxActivated}) reached. Cannot activate more skills.` };
          }

          const meta = metas.find(m => m.name === name);
          if (!meta) {
            logger.warn(`activate_skill: skill "${name}" not found in catalogue`);
            return { error: `Skill "${name}" not found. Check the Available Skills list.` };
          }

          pending.add(name);
          logger.info(`activate_skill: loading "${name}"${reason ? ` (reason: ${reason})` : ''}...`);

          try {
            const content = await loader.loadFull(meta.path);
            activatedContents.push(content);
            activateCache.set(name, content);

            logger.info(`activate_skill: "${name}" activated — ~${Math.ceil(content.body.length / 4)} tokens, ${content.scripts.length} scripts`);

            return {
              activated: true,
              name: content.name,
              description: content.description,
              instructions: content.body,
            };
          } finally {
            pending.delete(name);
          }
        },
      }),
    };
  }

  /**
   * Phase 1 + Phase 2 共享逻辑——根据加载策略解析技能内容。
   *
   * - progressive（默认）：ensureIndex() → 路由匹配 → loadFull()
   * - eager：ensureIndex() → 路由匹配 → 从预加载缓存取值
   * - lazy + 显式指定：跳过索引和路由，直接 registry.load(name)
   * - lazy + 未指定：warn 日志 → 回退到 progressive 路径
   * - llm-routed：ensureIndex() → 返回空内容（激活在 activate_skill 工具中完成）
   */
  async function resolveSkillContents(
    options: RunOptions | StreamOptions,
  ): Promise<{ activated: SkillMeta[]; skillContents: SkillContent[] }> {
    await ensurePreflight();
    await ensureMcpConnected();

    // lazy 模式 + 显式指定技能 → 跳过索引和路由，直接按名称加载
    // ensureAdapters() 保证 parser 已切换（lazy 路径不经过 ensureIndex）
    if (strategy === 'lazy' && options.skills) {
      await ensureAdapters();
      logger.info(`\nPhase 2: Activation [lazy] — loading ${options.skills.length} explicitly specified skills...`);
      const skillContents: SkillContent[] = [];
      for (const name of options.skills) {
        const content = await registry.load(name);
        if (content) {
          skillContents.push(content);
        } else {
          logger.warn(`Phase 2: Activation [lazy] — skill "${name}" not found in any registry`);
        }
      }
      for (const skill of skillContents) {
        const bodyTokens = Math.ceil(skill.body.length / 4);
        logger.debug(`  - ${skill.name}: ~${bodyTokens} tokens, ${skill.scripts.length} scripts, ${skill.references.length} refs`);
      }
      return { activated: skillContents, skillContents };
    }

    // lazy 模式 + 未指定技能 → 回退到 progressive
    if (strategy === 'lazy' && !options.skills) {
      logger.warn('Phase 2: Activation [lazy] — no skills specified, falling back to progressive behavior');
    }

    // progressive / eager / lazy-fallback / llm-routed 共用 ensureIndex
    const metas = await ensureIndex();

    // llm-routed 模式：返回空内容，实际激活在 activate_skill 工具调用时完成
    if (strategy === 'llm-routed' && !options.skills) {
      logger.info(`\nPhase 2: Activation [llm-routed] — ${metas.length} skills in catalogue, awaiting LLM routing...`);
      return { activated: [], skillContents: [] };
    }

    logger.info(`\nPhase 2: Activation — routing message: "${options.message.slice(0, 80)}..."`);

    let activated: SkillMeta[];
    if (options.skills) {
      activated = metas.filter(m => options.skills!.includes(m.name));
      logger.info(`Phase 2: Activation — explicitly selected ${activated.length} skills: [${activated.map(s => s.name).join(', ')}]`);
    } else {
      const matches = await router.route(options.message);
      activated = matches.map(m => m.skill);
      logger.info(`Phase 2: Activation — router matched ${matches.length} skills:`);
      for (const m of matches) {
        logger.debug(`  - ${m.skill.name} (score: ${m.score.toFixed(3)})`);
      }
    }

    const maxActivated = config.loading?.maxActivatedSkills ?? 5;
    activated = activated.slice(0, maxActivated);

    // eager 模式：从预加载缓存获取内容
    if (strategy === 'eager' && eagerContents) {
      logger.info(`Phase 2: Activation [eager] — retrieving ${activated.length} skills from preloaded cache...`);
      const skillContents = activated
        .map(s => eagerContents!.get(s.name))
        .filter((c): c is SkillContent => c !== undefined);
      for (const skill of skillContents) {
        const bodyTokens = Math.ceil(skill.body.length / 4);
        logger.debug(`  - ${skill.name}: ~${bodyTokens} tokens, ${skill.scripts.length} scripts, ${skill.references.length} refs`);
      }
      return { activated, skillContents };
    }

    // progressive / lazy-fallback / llm-routed+explicit：按需加载
    logger.info(`Phase 2: Activation — loading full content for ${activated.length} skills...`);
    const skillContents = await Promise.all(
      activated.map(s => loader.loadFull(s.path)),
    );
    for (const skill of skillContents) {
      const bodyTokens = Math.ceil(skill.body.length / 4);
      logger.debug(`  - ${skill.name}: ~${bodyTokens} tokens, ${skill.scripts.length} scripts, ${skill.references.length} refs`);
    }

    return { activated, skillContents };
  }

  const hiveMind: HiveMind = {
    /**
     * 非流式执行——三阶段管线的主入口。
     *
     * Phase 1+2: resolveSkillContents() 根据加载策略解析技能
     * Phase 3: generateText() 调用 LLM，maxSteps=10 允许多轮工具调用
     */
    async run(options: RunOptions): Promise<RunResult> {
      const { generateText } = await import('ai');

      if (callDepth === 0) { callSeq = 0; callCache.clear(); }
      const { activated, skillContents } = await resolveSkillContents(options);

      const modelKey = options.model ?? 'default';
      const model = config.models[modelKey];
      if (!model) {
        throw new Error(
          `Model "${modelKey}" not found. Available: ${Object.keys(config.models).join(', ')}`,
        );
      }

      const callSkillTool = buildCallSkillTool(hiveMind.run, modelKey);

      // ── llm-routed 两阶段执行 ──
      if (strategy === 'llm-routed' && skillContents.length === 0 && !options.skills) {
        const metas = await ensureIndex();
        const catalogue = buildSkillCatalogue(metas);
        const maxActivated = config.loading?.maxActivatedSkills ?? 5;
        const activatedContents: SkillContent[] = [];
        const activateCache = new Map<string, SkillContent>();
        const activateTool = buildActivateSkillTool(metas, activatedContents, activateCache, maxActivated);

        // Phase 2a: LLM 路由——LLM 从目录中选择需要的技能
        const routingSystemParts: string[] = [];
        if (options.systemPrompt) routingSystemParts.push(options.systemPrompt);
        routingSystemParts.push(catalogue);

        const mcpToolsForRouting = mcpManager ? await mcpManager.buildTools() : {};
        const routingTools = { ...activateTool, ...mcpToolsForRouting, ...callSkillTool };
        logger.info(`Phase 2a: LLM Routing — calling model "${modelKey}" with skill catalogue (${metas.length} skills)...`);

        const toolCallRecords: ToolCallRecord[] = [];

        const routingResult = await generateText({
          model,
          system: routingSystemParts.join('\n\n---\n\n'),
          prompt: options.message,
          maxTokens: options.maxTokens,
          tools: routingTools as Parameters<typeof generateText>[0]['tools'],
          maxSteps: 5,
        });

        // 收集路由阶段的工具调用记录
        if (routingResult.steps) {
          for (const step of routingResult.steps) {
            if (step.toolCalls) {
              for (const tc of step.toolCalls) {
                logger.debug(`  Tool call: ${tc.toolName}(${JSON.stringify(tc.args)})`);
                toolCallRecords.push({ toolName: tc.toolName, args: tc.args as Record<string, unknown>, result: undefined });
              }
            }
          }
        }

        // 无技能被激活 → LLM 判断不需要技能，直接返回路由阶段的回答
        if (activatedContents.length === 0) {
          logger.info('Phase 2a: LLM Routing — no skills activated, returning direct answer');
          return {
            text: routingResult.text,
            activatedSkills: [],
            toolCalls: toolCallRecords,
            usage: routingResult.usage ? {
              promptTokens: routingResult.usage.promptTokens,
              completionTokens: routingResult.usage.completionTokens,
              totalTokens: routingResult.usage.promptTokens + routingResult.usage.completionTokens,
            } : undefined,
          };
        }

        // Phase 3: 执行——用激活的技能 body + 工具发起第二次 LLM 调用
        // 并行工具调用可能产生重复，按名称去重
        const uniqueContents = [...new Map(activatedContents.map(c => [c.name, c])).values()];
        logger.info(`Phase 3: Execution [llm-routed] — ${uniqueContents.length} skills activated: [${uniqueContents.map(s => s.name).join(', ')}]`);
        const execSystemParts: string[] = [];
        if (options.systemPrompt) execSystemParts.push(options.systemPrompt);
        for (const skill of uniqueContents) {
          execSystemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
        }

        const scriptTools = buildToolsForSkills(uniqueContents);
        const mcpToolsForExec = mcpManager ? await mcpManager.buildTools() : {};
        const execTools = { ...scriptTools, ...mcpToolsForExec, ...callSkillTool };

        logger.info(`Phase 3: Execution — calling model "${modelKey}" with ${Object.keys(execTools).length} tools...`);
        const execResult = await generateText({
          model,
          system: execSystemParts.join('\n\n---\n\n'),
          prompt: options.message,
          maxTokens: options.maxTokens,
          tools: execTools as Parameters<typeof generateText>[0]['tools'],
          maxSteps: 10,
        });

        if (execResult.steps) {
          for (const step of execResult.steps) {
            if (step.toolCalls) {
              for (const tc of step.toolCalls) {
                logger.debug(`  Tool call: ${tc.toolName}(${JSON.stringify(tc.args)})`);
                toolCallRecords.push({ toolName: tc.toolName, args: tc.args as Record<string, unknown>, result: undefined });
              }
            }
          }
        }

        if (execResult.usage) {
          logger.info(`Phase 3: Execution — done. Tokens: prompt=${execResult.usage.promptTokens}, completion=${execResult.usage.completionTokens}`);
        }

        return {
          text: execResult.text,
          activatedSkills: uniqueContents.map(s => s.name),
          toolCalls: toolCallRecords,
          usage: execResult.usage ? {
            promptTokens: execResult.usage.promptTokens,
            completionTokens: execResult.usage.completionTokens,
            totalTokens: execResult.usage.promptTokens + execResult.usage.completionTokens,
          } : undefined,
        };
      }

      // ── 标准路径（progressive / eager / lazy / llm-routed+explicit） ──
      const systemParts: string[] = [];
      if (options.systemPrompt) systemParts.push(options.systemPrompt);

      for (const skill of skillContents) {
        systemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
      }

      const scriptTools = buildToolsForSkills(skillContents);
      const mcpTools = mcpManager ? await mcpManager.buildTools() : {};
      const tools = { ...scriptTools, ...mcpTools, ...callSkillTool };
      const hasTools = Object.keys(tools).length > 0;

      logger.info(`Phase 3: Execution — calling model "${modelKey}"${hasTools ? ` with ${Object.keys(tools).length} tools` : ''}...`);

      const toolCallRecords: ToolCallRecord[] = [];

      const result = await generateText({
        model,
        system: systemParts.join('\n\n---\n\n'),
        prompt: options.message,
        maxTokens: options.maxTokens,
        tools: tools as Parameters<typeof generateText>[0]['tools'],
        maxSteps: 10,
      });

      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolCalls) {
            for (const tc of step.toolCalls) {
              logger.debug(`  Tool call: ${tc.toolName}(${JSON.stringify(tc.args)})`);
              toolCallRecords.push({
                toolName: tc.toolName,
                args: tc.args as Record<string, unknown>,
                result: undefined,
              });
            }
          }
        }
      }

      if (result.usage) {
        logger.info(`Phase 3: Execution — done. Tokens: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.promptTokens + result.usage.completionTokens}`);
      }

      return {
        text: result.text,
        activatedSkills: activated.map(s => s.name),
        toolCalls: toolCallRecords,
        usage: result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens:
                result.usage.promptTokens + result.usage.completionTokens,
            }
          : undefined,
      };
    },

    /**
     * 流式执行——与 run() 共享 Phase 1/2 逻辑，Phase 3 用 streamText 替代 generateText。
     * 返回 async iterable，调用方通过 for-await-of 逐块消费。
     */
    async stream(options: StreamOptions): Promise<AsyncIterable<string>> {
      const { streamText, generateText } = await import('ai');
      const { skillContents } = await resolveSkillContents(options);

      const modelKey = options.model ?? 'default';
      const model = config.models[modelKey];
      if (!model) {
        throw new Error(
          `Model "${modelKey}" not found. Available: ${Object.keys(config.models).join(', ')}`,
        );
      }

      const callSkillTool = buildCallSkillTool(hiveMind.run, modelKey);

      // ── llm-routed 两阶段流式 ──
      if (strategy === 'llm-routed' && skillContents.length === 0 && !options.skills) {
        const metas = await ensureIndex();
        const catalogue = buildSkillCatalogue(metas);
        const maxActivated = config.loading?.maxActivatedSkills ?? 5;
        const activatedContents: SkillContent[] = [];
        const activateCache = new Map<string, SkillContent>();
        const activateTool = buildActivateSkillTool(metas, activatedContents, activateCache, maxActivated);

        // Phase 2a: 路由（非流式，需完整结果后决定是否进入执行阶段）
        const routingSystemParts: string[] = [];
        if (options.systemPrompt) routingSystemParts.push(options.systemPrompt);
        routingSystemParts.push(catalogue);

        const mcpToolsStreamRouting = mcpManager ? await mcpManager.buildTools() : {};
        logger.info(`Phase 2a: LLM Routing [stream] — calling model "${modelKey}" with skill catalogue...`);
        const routingResult = await generateText({
          model,
          system: routingSystemParts.join('\n\n---\n\n'),
          prompt: options.message,
          maxTokens: options.maxTokens,
          tools: { ...activateTool, ...mcpToolsStreamRouting, ...callSkillTool } as Parameters<typeof generateText>[0]['tools'],
          maxSteps: 5,
        });

        if (activatedContents.length === 0) {
          logger.info('Phase 2a: LLM Routing [stream] — no skills activated, streaming routing result');
          async function* yieldText() { yield routingResult.text; }
          return yieldText();
        }

        // Phase 3: 流式执行
        const uniqueContents = [...new Map(activatedContents.map(c => [c.name, c])).values()];
        logger.info(`Phase 3: Execution [llm-routed stream] — ${uniqueContents.length} skills activated`);
        const execSystemParts: string[] = [];
        if (options.systemPrompt) execSystemParts.push(options.systemPrompt);
        for (const skill of uniqueContents) {
          execSystemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
        }

        const scriptTools = buildToolsForSkills(uniqueContents);
        const mcpToolsStreamExec = mcpManager ? await mcpManager.buildTools() : {};
        const execTools = { ...scriptTools, ...mcpToolsStreamExec, ...callSkillTool };

        const execResult = streamText({
          model,
          system: execSystemParts.join('\n\n---\n\n'),
          prompt: options.message,
          maxTokens: options.maxTokens,
          tools: execTools as Parameters<typeof streamText>[0]['tools'],
          maxSteps: 10,
        });

        return execResult.textStream;
      }

      // ── 标准路径 ──
      const systemParts: string[] = [];
      if (options.systemPrompt) systemParts.push(options.systemPrompt);
      for (const skill of skillContents) {
        systemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
      }

      const scriptTools = buildToolsForSkills(skillContents);
      const mcpToolsStream = mcpManager ? await mcpManager.buildTools() : {};
      const tools = { ...scriptTools, ...mcpToolsStream, ...callSkillTool };

      logger.info(`Phase 3: Execution — streaming from model "${modelKey}" with ${Object.keys(tools).length} tools...`);

      const result = streamText({
        model,
        system: systemParts.join('\n\n---\n\n'),
        prompt: options.message,
        maxTokens: options.maxTokens,
        tools: tools as Parameters<typeof streamText>[0]['tools'],
        maxSteps: 10,
      });

      return result.textStream;
    },

    async list(): Promise<SkillMeta[]> {
      return ensureIndex();
    },

    async search(query: string): Promise<SkillMeta[]> {
      await ensureIndex();
      const results = await router.route(query);
      return results.map(r => r.skill);
    },

    /**
     * 安装远程技能：优先使用已配置的 RemoteRegistry，
     * 否则创建临时 RemoteRegistry。
     * 安装完成后置 skillIndex = null 强制下次重扫。
     */
    async install(source: string): Promise<string> {
      for (const reg of registries) {
        if (reg instanceof RemoteRegistry) {
          const result = await reg.install(source);
          skillIndex = null;
          eagerContents = null;
          return result;
        }
      }
      const tempRegistry = new RemoteRegistry({
        url: '',
        parser,
        logger,
      });
      const result = await tempRegistry.install(source);
      skillIndex = null;
      eagerContents = null;
      return result;
    },

    /** 运行时预检：scripts 未启用时返回空对象 */
    async runtimeStatus(): Promise<RuntimeStatus> {
      if (!executor) return {};
      const runtimes = config.scripts?.allowedRuntimes ?? ['bash', 'python', 'node'];
      return executor.preflight(runtimes);
    },

    async dispose(): Promise<void> {
      await mcpManager?.dispose();
    },
  };

  return hiveMind;
}

