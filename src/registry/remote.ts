import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SkillMeta, SkillContent, Logger } from '../types.js';
import type { SkillParser } from '../loader/index.js';
import { SkillLoader } from '../loader/index.js';
import type { SkillRegistry } from './index.js';
import { createLogger } from '../utils/logger.js';

export interface RemoteRegistryOptions {
  url: string;
  parser: SkillParser;
  /** Local cache directory (defaults to ~/.hive-mind/remote-cache) */
  cacheDir?: string;
  /** Fetch timeout in milliseconds (default: 30000) */
  timeout?: number;
  logger?: Logger;
}

interface RemoteSkillIndex {
  skills: Array<{
    name: string;
    description: string;
    /** Relative path on the remote, e.g. "code-formatter/SKILL.md" */
    path: string;
  }>;
}

/**
 * Fetches skills from a remote HTTP registry or Git repository.
 *
 * Expected remote API:
 * - GET {url}/index.json  → RemoteSkillIndex
 * - GET {url}/skills/{path} → raw SKILL.md content
 *
 * Downloaded skills are cached locally to avoid repeated network requests.
 */
export class RemoteRegistry implements SkillRegistry {
  private url: string;
  private parser: SkillParser;
  private loader: SkillLoader;
  private cacheDir: string;
  private timeout: number;
  private logger: Logger;
  private metaCache: SkillMeta[] | null = null;

  constructor(options: RemoteRegistryOptions) {
    this.url = options.url.replace(/\/+$/, '');
    this.parser = options.parser;
    this.loader = new SkillLoader({ parser: options.parser, logger: options.logger });
    this.cacheDir = options.cacheDir ?? path.join(os.homedir(), '.hive-mind', 'remote-cache');
    this.timeout = options.timeout ?? 30_000;
    this.logger = options.logger ?? createLogger();
  }

  async scan(): Promise<SkillMeta[]> {
    if (this.metaCache) return this.metaCache;

    try {
      const index = await this.fetchIndex();
      this.metaCache = index.skills.map(s => ({
        name: s.name,
        description: s.description,
        path: s.path,
      }));
      this.logger.info(`Remote registry: found ${this.metaCache.length} skills at ${this.url}`);
      return this.metaCache;
    } catch (err) {
      this.logger.warn(`Failed to fetch remote index from ${this.url}: ${err}`);
      return this.scanLocalCache();
    }
  }

  async load(name: string): Promise<SkillContent | undefined> {
    const metas = await this.scan();
    const meta = metas.find(m => m.name === name);
    if (!meta) return undefined;

    const localPath = await this.ensureCached(meta);
    if (!localPath) return undefined;

    return this.loader.loadFull(localPath);
  }

  // -------------------------------------------------------------------------
  // Install / Publish
  // -------------------------------------------------------------------------

  /**
   * Install a skill from a remote URL or git repo to local cache.
   * Supports:
   * - HTTP URL: fetches SKILL.md + scripts/ directory
   * - Git URL: clones the repository
   * - Short name: resolves against the configured registry URL
   */
  async install(source: string): Promise<string> {
    if (source.endsWith('.git') || source.startsWith('git@') || source.startsWith('https://github.com')) {
      return this.installFromGit(source);
    }

    if (source.startsWith('http://') || source.startsWith('https://')) {
      return this.installFromUrl(source);
    }

    return this.installFromRegistry(source);
  }

  private async installFromGit(gitUrl: string): Promise<string> {
    const { execa } = await import('execa');

    const repoName = this.extractRepoName(gitUrl);
    const targetDir = path.join(this.cacheDir, 'git', repoName);

    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    try {
      await fs.access(targetDir);
      this.logger.info(`Updating existing clone: ${targetDir}`);
      await execa('git', ['pull'], { cwd: targetDir, timeout: this.timeout });
    } catch {
      this.logger.info(`Cloning ${gitUrl} to ${targetDir}`);
      await execa('git', ['clone', '--depth', '1', gitUrl, targetDir], {
        timeout: this.timeout,
      });
    }

    this.metaCache = null;
    return targetDir;
  }

  private async installFromUrl(url: string): Promise<string> {
    const skillName = this.extractNameFromUrl(url);
    const targetDir = path.join(this.cacheDir, 'http', skillName);
    const skillMdPath = path.join(targetDir, 'SKILL.md');

    await fs.mkdir(targetDir, { recursive: true });

    const content = await this.fetchText(url);
    await fs.writeFile(skillMdPath, content, 'utf-8');

    this.logger.info(`Installed skill from ${url} to ${targetDir}`);
    this.metaCache = null;
    return targetDir;
  }

  private async installFromRegistry(shortName: string): Promise<string> {
    const parts = shortName.split('/');
    const skillPath = parts.length > 1
      ? `skills/${parts.join('/')}/SKILL.md`
      : `skills/${shortName}/SKILL.md`;

    const url = `${this.url}/${skillPath}`;
    const content = await this.fetchText(url);

    const targetDir = path.join(this.cacheDir, 'registry', ...parts);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'SKILL.md'), content, 'utf-8');

    this.logger.info(`Installed "${shortName}" from registry to ${targetDir}`);
    this.metaCache = null;
    return targetDir;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async fetchIndex(): Promise<RemoteSkillIndex> {
    const url = `${this.url}/index.json`;
    const text = await this.fetchText(url);
    return JSON.parse(text) as RemoteSkillIndex;
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async ensureCached(meta: SkillMeta): Promise<string | null> {
    const localDir = path.join(this.cacheDir, 'registry', meta.name);
    const localSkillMd = path.join(localDir, 'SKILL.md');

    try {
      await fs.access(localSkillMd);
      return localSkillMd;
    } catch {
      // Not cached yet, fetch it
    }

    try {
      const url = `${this.url}/skills/${meta.path}`;
      const content = await this.fetchText(url);
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(localSkillMd, content, 'utf-8');
      return localSkillMd;
    } catch (err) {
      this.logger.warn(`Failed to fetch skill "${meta.name}": ${err}`);
      return null;
    }
  }

  private async scanLocalCache(): Promise<SkillMeta[]> {
    try {
      const files = await this.parser.resolveFiles(this.cacheDir);
      const metas: SkillMeta[] = [];
      for (const file of files) {
        try {
          const meta = await this.loader.loadMeta(file);
          metas.push(meta);
        } catch {
          // skip broken cached skills
        }
      }
      this.logger.info(`Local cache fallback: found ${metas.length} skills`);
      return metas;
    } catch {
      return [];
    }
  }

  private extractRepoName(gitUrl: string): string {
    const match = gitUrl.match(/\/([^/]+?)(?:\.git)?$/);
    return match?.[1] ?? 'unknown-repo';
  }

  private extractNameFromUrl(url: string): string {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1]?.replace(/\.md$/i, '') ?? 'unknown-skill';
  }
}
