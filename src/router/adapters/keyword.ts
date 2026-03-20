import type { SkillMatcher, MatchResult } from '../index.js';
import type { SkillMeta } from '../../types.js';

const CJK_RANGE =
  /[\u2E80-\u2FFF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/;

/**
 * Keyword-based skill matcher with CJK support.
 * Scores skills by counting how many query tokens appear in
 * the skill's name + description + tags.
 */
export class KeywordAdapter implements SkillMatcher {
  private skills: SkillMeta[] = [];

  async index(skills: SkillMeta[]): Promise<void> {
    this.skills = skills;
  }

  async match(query: string, topK = 5): Promise<MatchResult[]> {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: MatchResult[] = this.skills.map(skill => ({
      skill,
      score: this.computeScore(queryTokens, skill),
    }));

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private skillText(skill: SkillMeta): string {
    const parts = [skill.name, skill.description];
    if (skill.tags) parts.push(...skill.tags);
    return parts.join(' ');
  }

  private computeScore(queryTokens: string[], skill: SkillMeta): number {
    const text = this.skillText(skill).toLowerCase();
    const textTokens = new Set(this.tokenize(text));

    let hits = 0;
    for (const qt of queryTokens) {
      if (textTokens.has(qt)) {
        hits++;
      } else {
        let partial = false;
        for (const tt of textTokens) {
          if (tt.includes(qt) || qt.includes(tt)) {
            hits += 0.5;
            partial = true;
            break;
          }
        }
        if (!partial && CJK_RANGE.test(qt)) {
          if (text.includes(qt)) {
            hits += 0.3;
          }
        }
      }
    }

    return hits / queryTokens.length;
  }

  private tokenize(text: string): string[] {
    const lower = text.toLowerCase();
    const tokens: string[] = [];

    const latinTokens = lower
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(CJK_RANGE, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
    tokens.push(...latinTokens);

    const cjkChars = lower.match(new RegExp(CJK_RANGE.source, 'gu'));
    if (cjkChars) {
      tokens.push(...cjkChars);
      for (let i = 0; i < cjkChars.length - 1; i++) {
        tokens.push(cjkChars[i]! + cjkChars[i + 1]!);
      }
    }

    return tokens;
  }
}
