import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { createHiveMind } from '../src/engine.js';
import { MockLanguageModelV1 } from 'ai/test';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

describe('loading strategy: llm-routed', () => {
  it('should create a HiveMind instance with llm-routed strategy', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    expect(hive).toBeDefined();
    expect(typeof hive.run).toBe('function');
    expect(typeof hive.stream).toBe('function');
  });

  it('should list all skills (same as progressive)', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);
    const names = skills.map(s => s.name);
    expect(names).toContain('code-formatter');
    expect(names).toContain('help');
  });

  it('should search skills (same as progressive)', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const results = await hive.search('format code prettier');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('code-formatter');
  });

  it('should return direct answer when no skills activated', async () => {
    const model = new MockLanguageModelV1({
      doGenerate: async () => ({
        text: 'Hello! I can help you directly.',
        finishReason: 'stop' as const,
        usage: { promptTokens: 100, completionTokens: 10 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const result = await hive.run({ message: 'What is 2+2?' });
    expect(result.text).toBe('Hello! I can help you directly.');
    expect(result.activatedSkills).toEqual([]);
  });

  it('should activate skill via two-phase LLM routing', async () => {
    let callCount = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            toolCalls: [{
              toolCallType: 'function' as const,
              toolCallId: 'tc-activate-1',
              toolName: 'activate_skill',
              args: JSON.stringify({ name: 'code-formatter' }),
            }],
            finishReason: 'tool-calls' as const,
            usage: { promptTokens: 100, completionTokens: 20 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        if (callCount === 2) {
          return {
            text: 'Skill activated, routing complete.',
            finishReason: 'stop' as const,
            usage: { promptTokens: 150, completionTokens: 10 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        return {
          text: 'Code formatted successfully using the skill.',
          finishReason: 'stop' as const,
          usage: { promptTokens: 200, completionTokens: 30 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const result = await hive.run({ message: 'Format my code with prettier' });
    expect(result.activatedSkills).toContain('code-formatter');
    expect(result.text).toBe('Code formatted successfully using the skill.');
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('should reject activate_skill for non-existent skill', async () => {
    let toolCallResult: unknown;
    let callCount = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        callCount++;
        if (callCount === 1) {
          return {
            toolCalls: [{
              toolCallType: 'function' as const,
              toolCallId: 'tc-bad-1',
              toolName: 'activate_skill',
              args: JSON.stringify({ name: 'non-existent-skill' }),
            }],
            finishReason: 'tool-calls' as const,
            usage: { promptTokens: 100, completionTokens: 20 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        // After tool result (error), LLM falls back to direct answer
        const messages = (options as any).prompt ?? [];
        for (const msg of messages) {
          if (msg.role === 'tool' && msg.content) {
            for (const part of msg.content) {
              if (part.result) {
                toolCallResult = part.result;
              }
            }
          }
        }
        return {
          text: 'Sorry, that skill was not found.',
          finishReason: 'stop' as const,
          usage: { promptTokens: 120, completionTokens: 10 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const result = await hive.run({ message: 'Use the magic skill' });
    expect(result.activatedSkills).toEqual([]);
    expect(toolCallResult).toBeDefined();
    expect((toolCallResult as any).error).toMatch(/not found/i);
  });

  it('should respect maxActivatedSkills limit', async () => {
    let toolCallResults: unknown[] = [];
    let callCount = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        callCount++;
        if (callCount === 1) {
          return {
            toolCalls: [
              {
                toolCallType: 'function' as const,
                toolCallId: 'tc-1',
                toolName: 'activate_skill',
                args: JSON.stringify({ name: 'code-formatter' }),
              },
              {
                toolCallType: 'function' as const,
                toolCallId: 'tc-2',
                toolName: 'activate_skill',
                args: JSON.stringify({ name: 'git-commit' }),
              },
            ],
            finishReason: 'tool-calls' as const,
            usage: { promptTokens: 100, completionTokens: 40 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        const messages = (options as any).prompt ?? [];
        for (const msg of messages) {
          if (msg.role === 'tool' && msg.content) {
            for (const part of msg.content) {
              if (part.result) {
                toolCallResults.push(part.result);
              }
            }
          }
        }
        return {
          text: 'Done',
          finishReason: 'stop' as const,
          usage: { promptTokens: 100, completionTokens: 5 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed', maxActivatedSkills: 1 },
    });

    const result = await hive.run({ message: 'Format code and commit' });
    expect(result.activatedSkills.length).toBe(1);
    expect(result.activatedSkills).toContain('code-formatter');
    const errorResult = toolCallResults.find((r: any) => r.error);
    expect(errorResult).toBeDefined();
    expect((errorResult as any).error).toMatch(/Max activated skills/);
  });

  it('should deduplicate repeated activate_skill calls', async () => {
    let callCount = 0;
    const model = new MockLanguageModelV1({
      doGenerate: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            toolCalls: [
              {
                toolCallType: 'function' as const,
                toolCallId: 'tc-1',
                toolName: 'activate_skill',
                args: JSON.stringify({ name: 'code-formatter' }),
              },
              {
                toolCallType: 'function' as const,
                toolCallId: 'tc-2',
                toolName: 'activate_skill',
                args: JSON.stringify({ name: 'code-formatter' }),
              },
            ],
            finishReason: 'tool-calls' as const,
            usage: { promptTokens: 100, completionTokens: 40 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        if (callCount === 2) {
          return {
            text: 'Routing done',
            finishReason: 'stop' as const,
            usage: { promptTokens: 100, completionTokens: 5 },
            rawCall: { rawPrompt: null, rawSettings: {} },
          };
        }
        return {
          text: 'Formatted',
          finishReason: 'stop' as const,
          usage: { promptTokens: 200, completionTokens: 10 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const result = await hive.run({ message: 'Format my code' });
    expect(result.activatedSkills).toEqual(['code-formatter']);
  });

  it('should skip LLM routing when options.skills is specified', async () => {
    let systemPromptSeen = '';
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        const prompt = (options as any).prompt as any[];
        const systemMsg = prompt?.find((m: any) => m.role === 'system');
        systemPromptSeen = systemMsg?.content ?? '';
        return {
          text: 'Executed with explicit skills',
          finishReason: 'stop' as const,
          usage: { promptTokens: 100, completionTokens: 10 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    const result = await hive.run({
      message: 'Format my code',
      skills: ['code-formatter'],
    });

    expect(result.activatedSkills).toContain('code-formatter');
    expect(systemPromptSeen).not.toContain('Available Skills');
    expect(systemPromptSeen).toContain('## Skill: code-formatter');
  });

  it('should inject skill catalogue into system prompt during routing', async () => {
    let systemPromptSeen = '';
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        if (!systemPromptSeen) {
          const prompt = (options as any).prompt as any[];
          const systemMsg = prompt?.find((m: any) => m.role === 'system');
          systemPromptSeen = systemMsg?.content ?? '';
        }
        return {
          text: 'Direct answer',
          finishReason: 'stop' as const,
          usage: { promptTokens: 100, completionTokens: 10 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
    });

    await hive.run({ message: 'Hello' });
    expect(systemPromptSeen).toContain('Available Skills');
    expect(systemPromptSeen).toContain('activate_skill');
    expect(systemPromptSeen).toContain('code-formatter');
    expect(systemPromptSeen).toContain('help');
  });

  it('should respect catalogueTokenBudget', async () => {
    let systemPromptSeen = '';
    const model = new MockLanguageModelV1({
      doGenerate: async (options) => {
        if (!systemPromptSeen) {
          const prompt = (options as any).prompt as any[];
          const systemMsg = prompt?.find((m: any) => m.role === 'system');
          systemPromptSeen = systemMsg?.content ?? '';
        }
        return {
          text: 'OK',
          finishReason: 'stop' as const,
          usage: { promptTokens: 10, completionTokens: 5 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    const hive = createHiveMind({
      models: { default: model as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed', catalogueTokenBudget: 30 },
    });

    await hive.run({ message: 'Hello' });
    expect(systemPromptSeen).toContain('目录已截断');
  });
});
