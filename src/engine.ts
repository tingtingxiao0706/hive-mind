import type {
  HiveMindConfig,
  RunOptions,
  RunResult,
  StreamOptions,
  SkillMeta,
  SkillContent,
  RuntimeStatus,
  Logger,
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
import { createLogger } from './utils/logger.js';
import { z } from 'zod';
import { tool } from 'ai';

export interface HiveMind {
  run(options: RunOptions): Promise<RunResult>;
  stream(options: StreamOptions): Promise<AsyncIterable<string>>;
  list(): Promise<SkillMeta[]>;
  search(query: string): Promise<SkillMeta[]>;
  install(source: string): Promise<string>;
  runtimeStatus(): Promise<RuntimeStatus>;
}

export function createHiveMind(config: HiveMindConfig): HiveMind {
  const maxCallDepth = config.maxCallDepth ?? 5;
  const logger = createLogger(config.logLevel ?? 'warn');
  let callDepth = 0;
  let callSeq = 0;
  const callCache = new Map<string, { text: string; activatedSkills: string[]; usage?: unknown }>();

  const parser: SkillParser = resolveParser(config, logger);
  const matcher: SkillMatcher = resolveMatcher(config, logger);

  const loader = new SkillLoader({
    parser,
    cacheSize: config.loading?.cacheSize,
    logger,
  });

  const router = new SkillRouter({ matcher, logger });

  const scriptsEnabled = config.scripts?.enabled ?? false;
  const executor = scriptsEnabled
    ? new ScriptExecutor({ config: config.scripts, logger })
    : null;

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

  let skillIndex: SkillMeta[] | null = null;

  async function ensureIndex(): Promise<SkillMeta[]> {
    if (!skillIndex) {
      logger.info('Phase 1: Discovery — scanning skill sources...');
      skillIndex = await registry.scan();
      logger.info(`Phase 1: Discovery — found ${skillIndex.length} skills:`);
      for (const s of skillIndex) {
        logger.debug(`  - ${s.name}: ${s.description}`);
      }
      await router.buildIndex(skillIndex);
      logger.info('Phase 1: Discovery — index built, ready for routing');
    }
    return skillIndex;
  }

  function buildToolsForSkills(
    skills: SkillContent[],
  ): Record<string, unknown> {
    if (!executor) return {};
    const allTools: Record<string, unknown> = {};
    for (const skill of skills) {
      if (skill.scripts.length > 0 || skill.references.length > 0) {
        const skillTools = createSkillTools(executor, skill);
        Object.assign(allTools, skillTools);
      }
    }
    return allTools;
  }

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

  const hiveMind: HiveMind = {
    async run(options: RunOptions): Promise<RunResult> {
      const { generateText } = await import('ai');
      if (callDepth === 0) { callSeq = 0; callCache.clear(); }
      const metas = await ensureIndex();

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

      logger.info(`Phase 2: Activation — loading full content for ${activated.length} skills...`);
      const skillContents = await Promise.all(
        activated.map(s => loader.loadFull(s.path)),
      );
      for (const skill of skillContents) {
        const bodyTokens = Math.ceil(skill.body.length / 4);
        logger.debug(`  - ${skill.name}: ~${bodyTokens} tokens, ${skill.scripts.length} scripts, ${skill.references.length} refs`);
      }

      const systemParts: string[] = [];
      if (options.systemPrompt) systemParts.push(options.systemPrompt);

      for (const skill of skillContents) {
        systemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
      }

      const modelKey = options.model ?? 'default';
      const model = config.models[modelKey];
      if (!model) {
        throw new Error(
          `Model "${modelKey}" not found. Available: ${Object.keys(config.models).join(', ')}`,
        );
      }

      const scriptTools = buildToolsForSkills(skillContents);
      const callSkillTool = buildCallSkillTool(hiveMind.run, modelKey);
      const tools = { ...scriptTools, ...callSkillTool };
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

    async stream(options: StreamOptions): Promise<AsyncIterable<string>> {
      const { streamText } = await import('ai');
      const metas = await ensureIndex();

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

      logger.info(`Phase 2: Activation — loading full content for ${activated.length} skills...`);
      const skillContents = await Promise.all(
        activated.map(s => loader.loadFull(s.path)),
      );
      for (const skill of skillContents) {
        const bodyTokens = Math.ceil(skill.body.length / 4);
        logger.debug(`  - ${skill.name}: ~${bodyTokens} tokens, ${skill.scripts.length} scripts, ${skill.references.length} refs`);
      }

      const systemParts: string[] = [];
      if (options.systemPrompt) systemParts.push(options.systemPrompt);
      for (const skill of skillContents) {
        systemParts.push(`## Skill: ${skill.name}\n\n${skill.body}`);
      }

      const modelKey = options.model ?? 'default';
      const model = config.models[modelKey];
      if (!model) {
        throw new Error(
          `Model "${modelKey}" not found. Available: ${Object.keys(config.models).join(', ')}`,
        );
      }

      const scriptTools = buildToolsForSkills(skillContents);
      const callSkillTool = buildCallSkillTool(hiveMind.run, modelKey);
      const tools = { ...scriptTools, ...callSkillTool };

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

    async install(source: string): Promise<string> {
      for (const reg of registries) {
        if (reg instanceof RemoteRegistry) {
          const result = await reg.install(source);
          skillIndex = null;
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
      return result;
    },

    async runtimeStatus(): Promise<RuntimeStatus> {
      if (!executor) return {};
      const runtimes = config.scripts?.allowedRuntimes ?? ['bash', 'python', 'node'];
      return executor.preflight(runtimes);
    },
  };

  return hiveMind;
}

function resolveParser(config: HiveMindConfig, _logger: Logger): SkillParser {
  if (config.parser === 'builtin') {
    return new BuiltinAdapter();
  }
  return new BuiltinAdapter();
}

function resolveMatcher(config: HiveMindConfig, _logger: Logger): SkillMatcher {
  if (config.router === 'builtin') {
    return new KeywordAdapter();
  }
  return new KeywordAdapter();
}
