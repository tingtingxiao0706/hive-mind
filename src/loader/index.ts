import { LRUCache } from 'lru-cache';
import type {
  SkillMeta,
  SkillContent,
  SkillFrontmatter,
  ScriptFile,
  XHiveConfig,
  Logger,
} from '../types.js';
import { parseXHive } from './extensions.js';
import { createLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// SkillParser adapter interface
// ---------------------------------------------------------------------------

export interface FileMeta {
  filePath: string;
  basePath: string;
}

export interface ParseResult {
  frontmatter: SkillFrontmatter;
  body: string;
  xHive?: XHiveConfig;
}

export interface SkillParser {
  parse(filePath: string): Promise<ParseResult>;
  parseContent(content: string, meta: FileMeta): ParseResult;
  resolveFiles(searchPath: string): Promise<string[]>;
  countTokens(text: string): number;
}

// ---------------------------------------------------------------------------
// SkillLoader
// ---------------------------------------------------------------------------

export interface SkillLoaderOptions {
  parser: SkillParser;
  cacheSize?: number;
  logger?: Logger;
}

export class SkillLoader {
  private parser: SkillParser;
  private cache: LRUCache<string, SkillContent>;
  private logger: Logger;

  constructor(options: SkillLoaderOptions) {
    this.parser = options.parser;
    this.cache = new LRUCache({ max: options.cacheSize ?? 50 });
    this.logger = options.logger ?? createLogger();
  }

  async loadMeta(skillPath: string): Promise<SkillMeta> {
    const result = await this.parser.parse(skillPath);
    const meta = result.frontmatter.metadata as Record<string, unknown> | undefined;
    const rawTags = meta?.['tags'];
    const tags = Array.isArray(rawTags) ? rawTags.map(String) : undefined;

    return {
      name: result.frontmatter.name,
      description: result.frontmatter.description,
      path: skillPath,
      tags,
      xHive: result.xHive ?? parseXHive(result.frontmatter['x-hive']),
    };
  }

  async loadFull(skillPath: string): Promise<SkillContent> {
    const cached = this.cache.get(skillPath);
    if (cached) {
      this.logger.debug(`Cache hit: ${skillPath}`);
      return cached;
    }

    const result = await this.parser.parse(skillPath);
    const xHive = result.xHive ?? parseXHive(result.frontmatter['x-hive']);

    const skillDir = this.resolveSkillDir(skillPath);
    const [scripts, references, assets] = await Promise.all([
      this.discoverFiles(skillDir, 'scripts'),
      this.discoverFilePaths(skillDir, 'references'),
      this.discoverFilePaths(skillDir, 'assets'),
    ]);

    const content: SkillContent = {
      name: result.frontmatter.name,
      description: result.frontmatter.description,
      path: skillPath,
      xHive,
      body: result.body,
      frontmatter: result.frontmatter,
      scripts,
      references,
      assets,
    };

    this.cache.set(skillPath, content);
    return content;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private resolveSkillDir(skillPath: string): string {
    if (skillPath.endsWith('SKILL.md') || skillPath.endsWith('skill.md')) {
      const idx = Math.max(
        skillPath.lastIndexOf('/'),
        skillPath.lastIndexOf('\\'),
      );
      return idx > 0 ? skillPath.slice(0, idx) : '.';
    }
    return skillPath;
  }

  private async discoverFiles(
    skillDir: string,
    subdir: string,
  ): Promise<ScriptFile[]> {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const dir = path.join(skillDir, subdir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e: { isFile(): boolean }) => e.isFile())
        .map((e: { name: string }) => ({
          relativePath: `${subdir}/${e.name}`,
          absolutePath: path.join(dir, e.name),
          extension: path.extname(e.name).slice(1),
        }));
    } catch {
      return [];
    }
  }

  private async discoverFilePaths(
    skillDir: string,
    subdir: string,
  ): Promise<string[]> {
    const files = await this.discoverFiles(skillDir, subdir);
    return files.map(f => f.relativePath);
  }
}
