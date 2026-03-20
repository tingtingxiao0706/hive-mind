import type { SkillMeta, SkillContent } from '../types.js';
import type { SkillRegistry } from './index.js';

/**
 * Merges multiple registries with priority ordering.
 * Earlier registries take precedence when skills share the same name.
 */
export class CompositeRegistry implements SkillRegistry {
  private registries: SkillRegistry[];
  private indexCache: SkillMeta[] | null = null;

  constructor(registries: SkillRegistry[]) {
    this.registries = registries;
  }

  async scan(): Promise<SkillMeta[]> {
    if (this.indexCache) return this.indexCache;

    const seen = new Set<string>();
    const merged: SkillMeta[] = [];

    for (const registry of this.registries) {
      const metas = await registry.scan();
      for (const meta of metas) {
        if (!seen.has(meta.name)) {
          seen.add(meta.name);
          merged.push(meta);
        }
      }
    }

    this.indexCache = merged;
    return merged;
  }

  async load(name: string): Promise<SkillContent | undefined> {
    for (const registry of this.registries) {
      const content = await registry.load(name);
      if (content) return content;
    }
    return undefined;
  }
}
