import { describe, it, expect, beforeAll } from 'vitest';
import { SkillRouter } from '../src/router/index.js';
import { KeywordAdapter } from '../src/router/adapters/keyword.js';
import type { SkillMeta } from '../src/types.js';

const MOCK_SKILLS: SkillMeta[] = [
  {
    name: 'code-formatter',
    description: 'Format and lint code using Prettier',
    path: '/skills/code-formatter/SKILL.md',
  },
  {
    name: 'git-commit',
    description: 'Analyze staged changes and generate git commit messages',
    path: '/skills/git-commit/SKILL.md',
  },
  {
    name: 'api-tester',
    description: 'Test HTTP API endpoints with detailed analysis',
    path: '/skills/api-tester/SKILL.md',
  },
  {
    name: 'project-scaffold',
    description: 'Generate project scaffolding for various frameworks',
    path: '/skills/project-scaffold/SKILL.md',
  },
  {
    name: 'help',
    description: 'Provide help and usage guidance',
    path: '/skills/help/SKILL.md',
  },
];

describe('KeywordAdapter', () => {
  const adapter = new KeywordAdapter();

  beforeAll(async () => {
    await adapter.index(MOCK_SKILLS);
  });

  it('should match skills by keyword', async () => {
    const results = await adapter.match('format code');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skill.name).toBe('code-formatter');
  });

  it('should match git-related queries', async () => {
    const results = await adapter.match('git commit message');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skill.name).toBe('git-commit');
  });

  it('should match API testing queries', async () => {
    const results = await adapter.match('test API endpoint HTTP');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skill.name).toBe('api-tester');
  });

  it('should respect topK limit', async () => {
    const results = await adapter.match('code project', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for irrelevant queries', async () => {
    const results = await adapter.match('xyznonexistent');
    expect(results.length).toBe(0);
  });

  it('should return scores between 0 and 1', async () => {
    const results = await adapter.match('format code');
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('SkillRouter', () => {
  it('should build index and route queries', async () => {
    const router = new SkillRouter({
      matcher: new KeywordAdapter(),
      topK: 3,
    });

    await router.buildIndex(MOCK_SKILLS);
    const results = await router.route('format my code');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.skill.name).toBe('code-formatter');
  });

  it('should return empty if index not built', async () => {
    const router = new SkillRouter({ matcher: new KeywordAdapter() });
    const results = await router.route('anything');
    expect(results.length).toBe(0);
  });
});
