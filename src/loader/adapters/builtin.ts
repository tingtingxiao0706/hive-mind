import matter from 'gray-matter';
import type { SkillParser, ParseResult, FileMeta } from '../index.js';
import type { SkillFrontmatter } from '../../types.js';
import { parseXHive } from '../extensions.js';

/**
 * Built-in SKILL.md parser using gray-matter.
 * Serves as fallback when @skill-tools/core is not available.
 */
export class BuiltinAdapter implements SkillParser {
  async parse(filePath: string): Promise<ParseResult> {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseContent(content, {
      filePath,
      basePath: filePath,
    });
  }

  parseContent(content: string, _meta: FileMeta): ParseResult {
    const { data, content: body } = matter(content);

    const frontmatter: SkillFrontmatter = {
      name: String(data['name'] ?? ''),
      description: String(data['description'] ?? ''),
      ...data,
    };

    return {
      frontmatter,
      body: body.trim(),
      xHive: parseXHive(frontmatter['x-hive']),
    };
  }

  async resolveFiles(searchPath: string): Promise<string[]> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const results: string[] = [];

    async function walk(dir: string) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (
          entry.name === 'SKILL.md' ||
          entry.name === 'skill.md'
        ) {
          results.push(full);
        }
      }
    }

    await walk(searchPath);
    return results;
  }

  countTokens(text: string): number {
    // Rough approximation: ~4 chars per token for English, ~2 for CJK
    return Math.ceil(text.length / 4);
  }
}
