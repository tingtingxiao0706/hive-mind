import type { SkillMeta, Logger } from '../types.js';
import { createLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// SkillMatcher adapter interface
// ---------------------------------------------------------------------------

export interface MatchResult {
  skill: SkillMeta;
  score: number;
}

export interface SkillMatcher {
  index(skills: SkillMeta[]): Promise<void>;
  match(query: string, topK?: number): Promise<MatchResult[]>;
}

// ---------------------------------------------------------------------------
// SkillRouter
// ---------------------------------------------------------------------------

export interface SkillRouterOptions {
  matcher: SkillMatcher;
  topK?: number;
  logger?: Logger;
}

export class SkillRouter {
  private matcher: SkillMatcher;
  private topK: number;
  private logger: Logger;
  private indexed = false;

  constructor(options: SkillRouterOptions) {
    this.matcher = options.matcher;
    this.topK = options.topK ?? 5;
    this.logger = options.logger ?? createLogger();
  }

  async buildIndex(skills: SkillMeta[]): Promise<void> {
    this.logger.debug(`Building index for ${skills.length} skills`);
    await this.matcher.index(skills);
    this.indexed = true;
  }

  async route(query: string, topK?: number): Promise<MatchResult[]> {
    if (!this.indexed) {
      this.logger.warn('Router index not built, returning empty results');
      return [];
    }

    const k = topK ?? this.topK;
    const results = await this.matcher.match(query, k);
    this.logger.debug(
      `Routed "${query}" -> ${results.length} skills: [${results.map(r => r.skill.name).join(', ')}]`,
    );
    return results;
  }
}
