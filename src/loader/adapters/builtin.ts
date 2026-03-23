import matter from 'gray-matter';
import type { SkillParser, ParseResult, FileMeta } from '../index.js';
import type { SkillFrontmatter } from '../../types.js';
import { parseXHive } from '../extensions.js';

/**
 * 内置 SKILL.md 解析器，基于 gray-matter 实现。
 *
 * 职责：将 SKILL.md 文件的 YAML frontmatter 和 Markdown body 分离解析，
 * 同时提取 x-hive 扩展字段。作为 SkillParser 适配器接口的默认实现，
 * 当 @skill-tools/core 未引入时作为唯一解析路径。
 *
 * 被 SkillLoader.loadMeta() 和 loadFull() 调用，也被 LocalRegistry 用于
 * resolveFiles() 扫描技能目录。
 */
export class BuiltinAdapter implements SkillParser {
  /**
   * 从文件路径读取并解析 SKILL.md。
   * 动态 import node:fs/promises 以保持核心逻辑与 Node.js API 分离，
   * 为未来浏览器兼容预留可能性（见 architecture.md 3.5 节）。
   */
  async parse(filePath: string): Promise<ParseResult> {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseContent(content, {
      filePath,
      basePath: filePath,
    });
  }

  /**
   * 从字符串内容解析 SKILL.md，不涉及文件 I/O。
   *
   * gray-matter 将内容拆分为：
   *   - data: YAML frontmatter 解析后的对象（name, description, allowed-tools, x-hive 等）
   *   - content: frontmatter 之后的 Markdown body（即 LLM 指令正文）
   *
   * x-hive 扩展字段通过 parseXHive() 单独提取并做类型校验，
   * 确保 agent/maxSteps/scripts/models 等字段的类型安全。
   */
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

  /**
   * 递归扫描目录，返回所有 SKILL.md / skill.md 文件的绝对路径。
   *
   * 被 LocalRegistry.scan() 调用，用于 Phase 1 发现阶段。
   * 每个 SKILL.md 代表一个独立技能，其所在目录即为技能根目录
   * （scripts/、references/、assets/ 子目录在 SkillLoader.loadFull 中发现）。
   *
   * 静默忽略不可读的目录（权限不足等），避免单个坏目录阻塞全局扫描。
   */
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

  /**
   * 粗略估算文本的 token 数量。
   * 英文约 4 字符/token，CJK 约 1-2 字符/token，这里取折中值。
   * 仅用于日志和调试信息，不影响实际 API 调用的 token 计费。
   */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
