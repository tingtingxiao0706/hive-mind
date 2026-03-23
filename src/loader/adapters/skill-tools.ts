import type { SkillParser, ParseResult, FileMeta } from '../index.js';
import type { SkillFrontmatter } from '../../types.js';
import { parseXHive } from '../extensions.js';

/**
 * @skill-tools/core v0.2.2 最小 API 契约。
 * 定义为本地接口避免外部包未安装时编译失败。
 */
export interface SkillToolsCoreAPI {
  parseSkill(path: string): Promise<SkillToolsParseResult>;
  parseSkillContent(
    content: string,
    filePath: string,
    dirPath: string,
  ): SkillToolsParseResult;
  resolveSkillFiles(
    dir: string,
  ): Promise<Array<{ skillFile: string }>>;
  countTokens(text: string): number;
}

interface SkillToolsParseResult {
  ok: boolean;
  skill?: {
    metadata: Record<string, unknown>;
    body?: string;
    content?: string;
    tokenCount?: number;
  };
}

/**
 * 对接 @skill-tools/core 的 SkillParser 适配器。
 *
 * 将 @skill-tools/core 的 parseSkill / parseSkillContent / resolveSkillFiles / countTokens
 * 映射到 Hive-Mind 的 SkillParser 接口，使两套系统可互换使用。
 *
 * 通过 ensureAdapters() 在 config.parser === 'auto' 时惰性创建。
 */
export class SkillToolsParserAdapter implements SkillParser {
  constructor(private core: SkillToolsCoreAPI) {}

  async parse(filePath: string): Promise<ParseResult> {
    const result = await this.core.parseSkill(filePath);
    return this.mapResult(result);
  }

  parseContent(content: string, meta: FileMeta): ParseResult {
    const dirPath = extractDir(meta.filePath);
    const result = this.core.parseSkillContent(content, meta.filePath, dirPath);
    return this.mapResult(result);
  }

  async resolveFiles(searchPath: string): Promise<string[]> {
    const locations = await this.core.resolveSkillFiles(searchPath);
    return locations.map(loc => loc.skillFile);
  }

  countTokens(text: string): number {
    return this.core.countTokens(text);
  }

  private mapResult(result: SkillToolsParseResult): ParseResult {
    if (!result.ok || !result.skill) {
      return { frontmatter: { name: '', description: '' }, body: '' };
    }

    const m = result.skill.metadata;
    const frontmatter: SkillFrontmatter = {
      name: String(m['name'] ?? ''),
      description: String(m['description'] ?? ''),
      compatibility: m['compatibility'] as string | undefined,
      'allowed-tools': m['allowed-tools'] as string | undefined,
      metadata: m['metadata'] as Record<string, unknown> | undefined,
      'x-hive': m['x-hive'] as Record<string, unknown> | undefined,
    };

    return {
      frontmatter,
      body: (result.skill.body ?? result.skill.content ?? '').trim(),
      xHive: parseXHive(frontmatter['x-hive']),
    };
  }
}

function extractDir(filePath: string): string {
  const sep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return sep > 0 ? filePath.slice(0, sep) : '.';
}
