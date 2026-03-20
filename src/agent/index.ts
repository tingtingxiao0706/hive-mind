import type {
  SkillContent,
  RunResult,
  ToolCallRecord,
  Logger,
} from '../types.js';
import type { HiveMindConfig } from '../types.js';
import { ScriptExecutor } from '../executor/index.js';
import { createSkillTools } from '../executor/tools.js';
import { createLogger } from '../utils/logger.js';
import { z } from 'zod';
import { tool } from 'ai';

export interface AgentRunOptions {
  message: string;
  skill: SkillContent;
  config: HiveMindConfig;
  model: import('ai').LanguageModel;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface AgentRunResult extends RunResult {
  steps: number;
}

/**
 * AgentRunner enables skills to function as autonomous agents
 * with tool loops and multi-step execution.
 */
export class AgentRunner {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger();
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const { generateText } = await import('ai');
    const { message, skill, config, model, systemPrompt, maxTokens } = options;

    const maxSteps = skill.xHive?.maxSteps ?? 10;

    const executor = new ScriptExecutor({
      config: config.scripts,
      logger: this.logger,
    });

    const skillTools = createSkillTools(executor, skill);

    const builtinTools = this.createBuiltinTools();
    const allTools = { ...skillTools, ...builtinTools };

    const systemParts: string[] = [];
    if (systemPrompt) systemParts.push(systemPrompt);
    systemParts.push(`## Agent Skill: ${skill.name}\n\n${skill.body}`);
    systemParts.push(
      `You are running as an autonomous agent. ` +
      `You can execute multiple steps to accomplish the task. ` +
      `Use the available tools to complete the user's request.`,
    );

    this.logger.info(
      `AgentRunner: starting "${skill.name}" with maxSteps=${maxSteps}`,
    );

    const toolCallRecords: ToolCallRecord[] = [];

    const result = await generateText({
      model,
      system: systemParts.join('\n\n---\n\n'),
      prompt: message,
      maxTokens,
      tools: allTools,
      maxSteps,
    });

    let stepCount = 0;
    if (result.steps) {
      stepCount = result.steps.length;
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            toolCallRecords.push({
              toolName: tc.toolName,
              args: tc.args as Record<string, unknown>,
              result: undefined,
            });
          }
        }
      }
    }

    this.logger.info(
      `AgentRunner: "${skill.name}" completed in ${stepCount} steps`,
    );

    return {
      text: result.text,
      activatedSkills: [skill.name],
      toolCalls: toolCallRecords,
      steps: stepCount,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens:
              result.usage.promptTokens + result.usage.completionTokens,
          }
        : undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createBuiltinTools(): Record<string, any> {
    return {
      shell_exec: tool({
        description: 'Execute a shell command in the current working directory',
        parameters: z.object({
          command: z.string().describe('The shell command to execute'),
          cwd: z
            .string()
            .optional()
            .describe('Working directory (defaults to process.cwd())'),
          timeout: z
            .number()
            .optional()
            .describe('Timeout in milliseconds (default: 30000)'),
        }),
        execute: async ({
          command,
          cwd,
          timeout,
        }: {
          command: string;
          cwd?: string;
          timeout?: number;
        }) => {
          const { execa } = await import('execa');
          try {
            const result = await execa(command, {
              shell: true,
              cwd: cwd ?? process.cwd(),
              timeout: timeout ?? 30_000,
              reject: false,
              stripFinalNewline: true,
            });
            return {
              exitCode: result.exitCode ?? 0,
              stdout: result.stdout.slice(0, 30_000),
              stderr: result.stderr.slice(0, 30_000),
            };
          } catch (err) {
            return {
              exitCode: 1,
              stdout: '',
              stderr: err instanceof Error ? err.message : String(err),
            };
          }
        },
      }),

      file_read: tool({
        description: 'Read the contents of a file',
        parameters: z.object({
          path: z.string().describe('File path to read'),
        }),
        execute: async ({ path: filePath }: { path: string }) => {
          const fs = await import('node:fs/promises');
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            return { content: content.slice(0, 50_000) };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      }),

      file_write: tool({
        description: 'Write content to a file',
        parameters: z.object({
          path: z.string().describe('File path to write'),
          content: z.string().describe('Content to write'),
        }),
        execute: async ({
          path: filePath,
          content,
        }: {
          path: string;
          content: string;
        }) => {
          const fs = await import('node:fs/promises');
          const pathMod = await import('node:path');
          try {
            await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            return { success: true };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      }),
    };
  }
}
