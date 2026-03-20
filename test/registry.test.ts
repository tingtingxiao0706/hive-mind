import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import { LocalRegistry } from '../src/registry/local.js';
import { CompositeRegistry } from '../src/registry/composite.js';
import { BuiltinAdapter } from '../src/loader/adapters/builtin.js';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const parser = new BuiltinAdapter();

describe('LocalRegistry', () => {
  let registry: LocalRegistry;

  beforeAll(() => {
    registry = new LocalRegistry({ path: SKILLS_DIR, parser });
  });

  it('should scan and find all skills', async () => {
    const metas = await registry.scan();
    expect(metas.length).toBeGreaterThanOrEqual(5);

    const names = metas.map(m => m.name);
    expect(names).toContain('code-formatter');
    expect(names).toContain('help');
    expect(names).toContain('git-commit');
    expect(names).toContain('api-tester');
    expect(names).toContain('project-scaffold');
  });

  it('should cache scan results', async () => {
    const first = await registry.scan();
    const second = await registry.scan();
    expect(first).toBe(second);
  });

  it('should load a skill by name', async () => {
    const content = await registry.load('code-formatter');
    expect(content).toBeDefined();
    expect(content!.name).toBe('code-formatter');
    expect(content!.body).toContain('# Code Formatter');
    expect(content!.scripts.length).toBeGreaterThan(0);
  });

  it('should return undefined for unknown skill', async () => {
    const content = await registry.load('nonexistent-skill');
    expect(content).toBeUndefined();
  });
});

describe('CompositeRegistry', () => {
  it('should merge skills from multiple registries', async () => {
    const reg1 = new LocalRegistry({ path: SKILLS_DIR, parser });
    const reg2 = new LocalRegistry({ path: SKILLS_DIR, parser });

    const composite = new CompositeRegistry([reg1, reg2]);
    const metas = await composite.scan();

    const uniqueNames = new Set(metas.map(m => m.name));
    expect(uniqueNames.size).toBe(metas.length);
  });

  it('should load from the first registry that has the skill', async () => {
    const reg = new LocalRegistry({ path: SKILLS_DIR, parser });
    const composite = new CompositeRegistry([reg]);

    const content = await composite.load('help');
    expect(content).toBeDefined();
    expect(content!.name).toBe('help');
  });

  it('should return undefined if no registry has the skill', async () => {
    const reg = new LocalRegistry({ path: SKILLS_DIR, parser });
    const composite = new CompositeRegistry([reg]);

    const content = await composite.load('nonexistent');
    expect(content).toBeUndefined();
  });
});
