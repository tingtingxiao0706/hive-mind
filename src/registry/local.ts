import type { SkillMeta, SkillContent, Logger } from '../types.js';
import type { SkillParser } from '../loader/index.js';
import { SkillLoader } from '../loader/index.js';
import type { SkillRegistry } from './index.js';
import { createLogger } from '../utils/logger.js';

export interface LocalRegistryOptions {
  path: string;
  parser: SkillParser;
  logger?: Logger;
}

/**
 * Scans a local directory for SKILL.md files and provides
 * lightweight index + on-demand full loading.
 */
export class LocalRegistry implements SkillRegistry {
  private skillsPath: string;
  private parser: SkillParser;
  private loader: SkillLoader;
  private logger: Logger;
  private metaCache: SkillMeta[] | null = null;

  constructor(options: LocalRegistryOptions) {
    this.skillsPath = options.path;
    this.parser = options.parser;
    this.loader = new SkillLoader({ parser: options.parser, logger: options.logger });
    this.logger = options.logger ?? createLogger();
  }

  async scan(): Promise<SkillMeta[]> {
    if (this.metaCache) return this.metaCache;

    const path = await import('node:path');
    const resolvedPath = path.resolve(this.skillsPath);

    this.logger.debug(`Scanning ${resolvedPath} for skills`);
    const skillFiles = await this.parser.resolveFiles(resolvedPath);

    const metas: SkillMeta[] = [];
    for (const file of skillFiles) {
      try {
        const meta = await this.loader.loadMeta(file);
        metas.push(meta);
      } catch (err) {
        this.logger.warn(`Failed to parse skill at ${file}: ${err}`);
      }
    }

    this.logger.info(`Found ${metas.length} skills in ${resolvedPath}`);
    this.metaCache = metas;
    return metas;
  }

  async load(name: string): Promise<SkillContent | undefined> {
    const metas = await this.scan();
    const meta = metas.find(m => m.name === name);
    if (!meta) return undefined;
    return this.loader.loadFull(meta.path);
  }
}
