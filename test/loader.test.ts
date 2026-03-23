import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { SkillLoader } from '../src/loader/index.js';
import { BuiltinAdapter } from '../src/loader/adapters/builtin.js';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const FORMATTER_SKILL = path.join(SKILLS_DIR, 'code-formatter', 'SKILL.md');
const HELP_SKILL = path.join(SKILLS_DIR, 'help', 'SKILL.md');

const FIXTURES_DIR = path.resolve(__dirname, '__fixtures_linked_files__');

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

  it('should return empty linkedFiles when body has no links', async () => {
    const content = await loader.loadFull(HELP_SKILL);
    expect(content.linkedFiles).toEqual([]);
  });
});

describe('SkillLoader — linkedFiles extraction', () => {
  let loader: SkillLoader;

  const skillDir = path.join(FIXTURES_DIR, 'skill-with-links');
  const linkedDir = path.join(FIXTURES_DIR, 'shared-rules');
  const skillPath = path.join(skillDir, 'SKILL.md');

  beforeAll(async () => {
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(linkedDir, { recursive: true });

    await fs.writeFile(path.join(linkedDir, 'common.md'), '# Common Rules\n');
    await fs.writeFile(path.join(linkedDir, 'react.md'), '# React Rules\n');

    const skillContent = `---
name: linked-test
description: Skill for testing linked files
---

# Linked Test

## 工作流

- 通用规则 → [common.md](../shared-rules/common.md)
- React 规则 → [react.md](../shared-rules/react.md)
- 不存在的 → [missing.md](../shared-rules/missing.md)
- 远程链接 → [docs](https://example.com/docs)
- 锚点链接 → [section](#some-heading)
- 重复链接 → [common again](../shared-rules/common.md)
`;
    await fs.writeFile(skillPath, skillContent);
    loader = new SkillLoader({ parser: new BuiltinAdapter() });
  });

  afterAll(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('should extract relative path links pointing to existing files', async () => {
    const content = await loader.loadFull(skillPath);
    const commonAbs = path.resolve(skillDir, '../shared-rules/common.md');
    const reactAbs = path.resolve(skillDir, '../shared-rules/react.md');
    expect(content.linkedFiles).toContain(commonAbs);
    expect(content.linkedFiles).toContain(reactAbs);
  });

  it('should ignore HTTP and anchor links', async () => {
    const content = await loader.loadFull(skillPath);
    expect(content.linkedFiles.some(f => f.includes('example.com'))).toBe(false);
    expect(content.linkedFiles.some(f => f.includes('#some-heading'))).toBe(false);
  });

  it('should ignore links to non-existent files without errors', async () => {
    const content = await loader.loadFull(skillPath);
    const missingAbs = path.resolve(skillDir, '../shared-rules/missing.md');
    expect(content.linkedFiles).not.toContain(missingAbs);
  });

  it('should deduplicate linked files', async () => {
    const content = await loader.loadFull(skillPath);
    const commonAbs = path.resolve(skillDir, '../shared-rules/common.md');
    const occurrences = content.linkedFiles.filter(f => f === commonAbs);
    expect(occurrences).toHaveLength(1);
  });
});

describe('SkillLoader — e2e linkedFiles with demo skill', () => {
  const DEMO_SKILLS = path.resolve(__dirname, '..', 'demo-hive-mind', 'skills');
  const FRONTEND_SKILL = path.join(DEMO_SKILLS, 'frontend-coding-standards', 'SKILL.md');

  it('should extract linkedFiles from frontend-coding-standards demo skill', async () => {
    const loader = new SkillLoader({ parser: new BuiltinAdapter() });
    const content = await loader.loadFull(FRONTEND_SKILL);
    expect(content.name).toBe('frontend-coding-standards');
    expect(content.linkedFiles.length).toBe(4);
    expect(content.linkedFiles.some(f => f.endsWith('common-rules.md'))).toBe(true);
    expect(content.linkedFiles.some(f => f.endsWith('react-rules.md'))).toBe(true);
    expect(content.linkedFiles.some(f => f.endsWith('vue-rules.md'))).toBe(true);
    expect(content.linkedFiles.some(f => f.endsWith('examples.md'))).toBe(true);
  });
});
