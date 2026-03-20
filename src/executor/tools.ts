import { z } from 'zod';
import { tool } from 'ai';
import type { SkillContent } from '../types.js';
import type { ScriptExecutor } from './index.js';

/**
 * Create LLM-injectable tools for script execution within a skill context.
 * These tools are automatically added when a skill has scripts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSkillTools(executor: ScriptExecutor, skill: SkillContent): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  if (skill.scripts.length > 0) {
    tools['run_script'] = tool({
      description:
        `Execute a script from the "${skill.name}" skill directory. ` +
        `Available scripts: ${skill.scripts.map(s => s.relativePath).join(', ')}`,
      parameters: z.object({
        script: z
          .string()
          .describe('Relative script path, e.g. "scripts/format.sh"'),
        args: z
          .array(z.string())
          .optional()
          .describe('Command-line arguments'),
        env: z
          .record(z.string())
          .optional()
          .describe('Additional environment variables'),
        timeout: z
          .number()
          .optional()
          .describe('Execution timeout in milliseconds'),
      }),
      execute: async ({ script, args, env, timeout }) => {
        return executor.execute({ script, args, env, timeout, skill });
      },
    });

    tools['list_skill_files'] = tool({
      description: `List available scripts, references, and assets in the "${skill.name}" skill`,
      parameters: z.object({}),
      execute: async () => {
        return {
          scripts: skill.scripts.map(s => s.relativePath),
          references: skill.references,
          assets: skill.assets,
        };
      },
    });
  }

  if (skill.references.length > 0) {
    tools['read_resource'] = tool({
      description: `Read a reference document or asset from the "${skill.name}" skill directory`,
      parameters: z.object({
        path: z
          .string()
          .describe('Relative file path, e.g. "references/style-guide.md"'),
      }),
      execute: async ({ path: filePath }) => {
        const pathMod = await import('node:path');
        const fs = await import('node:fs/promises');
        const skillDir = resolveSkillDir(skill.path);
        const absolute = pathMod.resolve(skillDir, filePath);
        const resolvedDir = pathMod.resolve(skillDir);

        if (!absolute.startsWith(resolvedDir)) {
          return { error: 'Path traversal detected' };
        }

        try {
          const content = await fs.readFile(absolute, 'utf-8');
          return { content };
        } catch {
          return { error: `File not found: ${filePath}` };
        }
      },
    });
  }

  return tools;
}

function resolveSkillDir(skillPath: string): string {
  if (skillPath.endsWith('SKILL.md') || skillPath.endsWith('skill.md')) {
    const idx = Math.max(
      skillPath.lastIndexOf('/'),
      skillPath.lastIndexOf('\\'),
    );
    return idx > 0 ? skillPath.slice(0, idx) : '.';
  }
  return skillPath;
}
