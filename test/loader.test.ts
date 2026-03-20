import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import { SkillLoader } from '../src/loader/index.js';
import { BuiltinAdapter } from '../src/loader/adapters/builtin.js';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const FORMATTER_SKILL = path.join(SKILLS_DIR, 'code-formatter', 'SKILL.md');
const HELP_SKILL = path.join(SKILLS_DIR, 'help', 'SKILL.md');

describe('BuiltinAdapter', () => {
  const adapter = new BuiltinAdapter();

  it('should parse a SKILL.md file', async () => {
    const result = await adapter.parse(FORMATTER_SKILL);
    expect(result.frontmatter.name).toBe('code-formatter');
    expect(result.frontmatter.description).toContain('Format');
    expect(result.body).toContain('# Code Formatter');
  });

  it('should extract x-hive extensions', async () => {
    const result = await adapter.parse(FORMATTER_SKILL);
    expect(result.xHive).toBeDefined();
    expect(result.xHive?.scripts?.runtimes).toContain('bash');
    expect(result.xHive?.scripts?.approval).toBe(false);
    expect(result.xHive?.scripts?.timeout).toBe(60000);
  });

  it('should parse content from string', () => {
    const content = `---
name: test-skill
description: A test skill
x-hive:
  agent: true
  maxSteps: 5
---

# Test Skill

Instructions here.`;

    const result = adapter.parseContent(content, {
      filePath: '/tmp/test/SKILL.md',
      basePath: '/tmp/test',
    });

    expect(result.frontmatter.name).toBe('test-skill');
    expect(result.xHive?.agent).toBe(true);
    expect(result.xHive?.maxSteps).toBe(5);
    expect(result.body).toContain('# Test Skill');
  });

  it('should resolve SKILL.md files in a directory', async () => {
    const files = await adapter.resolveFiles(SKILLS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.some(f => f.includes('code-formatter'))).toBe(true);
    expect(files.some(f => f.includes('help'))).toBe(true);
  });

  it('should count tokens approximately', () => {
    const count = adapter.countTokens('Hello world, this is a test.');
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });
});

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeAll(() => {
    loader = new SkillLoader({ parser: new BuiltinAdapter() });
  });

  it('should load skill metadata (lightweight)', async () => {
    const meta = await loader.loadMeta(FORMATTER_SKILL);
    expect(meta.name).toBe('code-formatter');
    expect(meta.description).toBeTruthy();
    expect(meta.path).toBe(FORMATTER_SKILL);
  });

  it('should load full skill content with scripts', async () => {
    const content = await loader.loadFull(FORMATTER_SKILL);
    expect(content.name).toBe('code-formatter');
    expect(content.body).toContain('# Code Formatter');
    expect(content.scripts.length).toBeGreaterThan(0);
    expect(content.scripts[0]!.relativePath).toBe('scripts/format.sh');
    expect(content.scripts[0]!.extension).toBe('sh');
  });

  it('should load skill without scripts', async () => {
    const content = await loader.loadFull(HELP_SKILL);
    expect(content.name).toBe('help');
    expect(content.scripts.length).toBe(0);
  });

  it('should cache loaded skills', async () => {
    await loader.loadFull(FORMATTER_SKILL);
    const start = performance.now();
    const cached = await loader.loadFull(FORMATTER_SKILL);
    const elapsed = performance.now() - start;
    expect(cached.name).toBe('code-formatter');
    expect(elapsed).toBeLessThan(5);
  });

  it('should clear cache', async () => {
    await loader.loadFull(FORMATTER_SKILL);
    loader.clearCache();
    const content = await loader.loadFull(FORMATTER_SKILL);
    expect(content.name).toBe('code-formatter');
  });
});
