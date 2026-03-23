import type { SkillMatcher, MatchResult } from '../index.js';
import type { SkillMeta } from '../../types.js';

/**
 * CJK 字符范围：中文 (CJK Unified)、日文 (平假名/片假名)、韩文兼容区。
 * 用于分词时区分拉丁字符和 CJK 字符，走不同的分词策略。
 */
const CJK_RANGE =
  /[\u2E80-\u2FFF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/;

/**
 * 内置关键词匹配适配器，实现 SkillMatcher 接口。
 *
 * 在 Phase 2（激活）阶段由 SkillRouter 调用，职责是：
 * 给定用户消息，从所有技能中选出最相关的 Top-K 个。
 * 纯本地计算，零 token 消耗，<10ms 响应。
 *
 * 评分公式：score = 命中的查询 token 数 / 总查询 token 数
 * 命中权重：完全匹配 +1，部分包含 +0.5，CJK 子串兜底 +0.3
 *
 * 未来可通过 SkillMatcher 适配器替换为 @skill-tools/router 的 BM25 实现。
 */
export class KeywordAdapter implements SkillMatcher {
  private skills: SkillMeta[] = [];

  /**
   * 构建索引——对于关键词匹配，只需保存技能列表的引用。
   * BM25 实现中这一步会预计算 IDF 和文档长度，这里无需预处理。
   */
  async index(skills: SkillMeta[]): Promise<void> {
    this.skills = skills;
  }

  /**
   * 对所有技能计算匹配分数，返回 score > 0 的 Top-K 结果。
   */
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

  /**
   * 拼接技能的可搜索文本：name + description + tags。
   * tags 在 SkillLoader.loadMeta() 中从 frontmatter.metadata.tags 提取，
   * 在这里参与匹配，使 "翻译" 等标签能被用户查询命中。
   */
  private skillText(skill: SkillMeta): string {
    const parts = [skill.name, skill.description];
    if (skill.tags) parts.push(...skill.tags);
    return parts.join(' ');
  }

  /**
   * 计算单个技能相对于查询的匹配分数。
   *
   * 三级匹配策略（对每个查询 token 依次尝试）：
   *   1. 完全匹配：查询 token 在技能 token 集合中存在        → +1.0
   *   2. 部分匹配：查询 token 与某个技能 token 互相 includes  → +0.5
   *      例如 "deploy" 匹配 "deployment"
   *   3. CJK 子串兜底：如果查询 token 是 CJK 字符，
   *      在技能完整文本中做 includes 检查                     → +0.3
   *      例如单字 "翻" 能匹配包含 "翻译" 的技能描述
   *
   * 最终 score = 总 hits / 查询 token 数，归一化到 [0, 1]。
   */
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

  /**
   * 混合分词器：拉丁文字和 CJK 字符采用不同策略。
   *
   * 拉丁文字：按空格/标点分割，过滤掉单字符 token（"a", "I" 等无信息量）。
   *   "Deploy to AWS" → ["deploy", "to", "aws"] → ["deploy", "aws"]（"to" 被长度过滤）
   *
   * CJK 字符：逐字提取 + 相邻双字组合（模拟 bigram 分词）。
   *   "翻译成英文" → 单字 ["翻", "译", "成", "英", "文"]
   *                 + 双字 ["翻译", "译成", "成英", "英文"]
   *   这样 "翻译" 和 "英文" 都能作为 token 参与匹配，
   *   弥补没有专业中文分词库（jieba 等）的不足。
   */
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
