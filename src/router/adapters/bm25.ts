import type { SkillMatcher, MatchResult } from '../index.js';
import type { SkillMeta } from '../../types.js';

/**
 * @skill-tools/router v0.2.2 SkillRouter 最小 API 契约。
 * 定义为本地接口避免外部包未安装时编译失败。
 */
export interface SkillToolsRouterAPI {
  indexSkills(
    skills: Array<{ name: string; description: string }>,
  ): Promise<void>;
  select(
    query: string,
  ): Promise<Array<{ skill: string; score: number }>>;
}

/**
 * 对接 @skill-tools/router 的 SkillMatcher 适配器。
 *
 * 将 @skill-tools/router 的 BM25 路由能力映射到 Hive-Mind 的
 * SkillMatcher 接口（index + match），使 BM25 和内置关键词匹配可互换。
 *
 * 内部维护 name → SkillMeta 映射表，用于将 @skill-tools/router
 * 返回的 skill name 字符串还原为完整的 SkillMeta 对象。
 */
export class BM25Adapter implements SkillMatcher {
  private skillMap = new Map<string, SkillMeta>();

  constructor(private router: SkillToolsRouterAPI) {}

  async index(skills: SkillMeta[]): Promise<void> {
    this.skillMap.clear();
    for (const s of skills) {
      this.skillMap.set(s.name, s);
    }
    await this.router.indexSkills(
      skills.map(s => ({
        name: s.name,
        description: [s.description, ...(s.tags ?? [])].join(' '),
      })),
    );
  }

  async match(query: string, topK = 5): Promise<MatchResult[]> {
    const results = await this.router.select(query);
    return results
      .filter(r => this.skillMap.has(r.skill))
      .slice(0, topK)
      .map(r => ({
        skill: this.skillMap.get(r.skill)!,
        score: r.score,
      }));
  }
}
