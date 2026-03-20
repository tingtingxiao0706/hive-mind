import type { SkillMeta, SkillContent } from '../types.js';

/**
 * A registry provides discovery and loading of skills from a specific source.
 */
export interface SkillRegistry {
  /** Scan and return lightweight metadata for all skills in this registry */
  scan(): Promise<SkillMeta[]>;
  /** Load full content for a skill by name */
  load(name: string): Promise<SkillContent | undefined>;
}
