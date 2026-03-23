import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { createHiveMind } from '../src/engine.js';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

describe('createHiveMind (integration)', () => {
  it('should create a HiveMind instance', () => {
    const hive = createHiveMind({
      models: {
        default: {} as any,
      },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    expect(hive).toBeDefined();
    expect(typeof hive.run).toBe('function');
    expect(typeof hive.stream).toBe('function');
    expect(typeof hive.list).toBe('function');
    expect(typeof hive.search).toBe('function');
    expect(typeof hive.runtimeStatus).toBe('function');
  });

  it('should list all bundled skills', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);

    const names = skills.map(s => s.name);
    expect(names).toContain('code-formatter');
    expect(names).toContain('help');
    expect(names).toContain('list-skills');
    expect(names).toContain('git-commit');
    expect(names).toContain('api-tester');
    expect(names).toContain('project-scaffold');
  });

  it('should search for skills by query', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    const results = await hive.search('format code prettier');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('code-formatter');
  });

  it('should search for git-related skills', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    const results = await hive.search('git commit changes');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('git-commit');
  });

  it('should accept remote registry configuration', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'remote', url: 'https://example.com' }],
    });
    expect(hive).toBeDefined();
  });

  it('should return empty runtime status when scripts disabled', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    const status = await hive.runtimeStatus();
    expect(Object.keys(status).length).toBe(0);
  });

  it('should work with workspace config', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      workspace: 'test-workspace',
    });

    expect(hive).toBeDefined();
  });

  it('should support scripts configuration', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      scripts: {
        enabled: true,
        securityLevel: 'strict',
        allowedRuntimes: ['bash', 'python'],
        timeout: 15_000,
      },
    });

    expect(hive).toBeDefined();
  });
});

describe('loading strategy: eager', () => {
  it('should list all skills with eager strategy', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'eager' },
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);
    const names = skills.map(s => s.name);
    expect(names).toContain('code-formatter');
    expect(names).toContain('help');
  });

  it('should search skills with eager strategy', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'eager' },
    });

    const results = await hive.search('format code prettier');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('code-formatter');
  });

  it('should preload all skill contents on first ensureIndex', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'eager' },
    });

    // list() triggers ensureIndex() which triggers eager preloading
    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);

    // subsequent list() should return from cache
    const start = performance.now();
    const cached = await hive.list();
    const elapsed = performance.now() - start;
    expect(cached.length).toBe(skills.length);
    expect(elapsed).toBeLessThan(5);
  });
});

describe('loading strategy: lazy', () => {
  it('should list all skills with lazy strategy', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'lazy' },
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);
    const names = skills.map(s => s.name);
    expect(names).toContain('code-formatter');
    expect(names).toContain('git-commit');
  });

  it('should search skills with lazy strategy', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'lazy' },
    });

    const results = await hive.search('git commit changes');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('git-commit');
  });

  it('should accept lazy strategy with explicit skills config', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'lazy' },
    });

    expect(hive).toBeDefined();
    expect(typeof hive.run).toBe('function');
    expect(typeof hive.stream).toBe('function');
  });
});

describe('loading strategy: progressive (default)', () => {
  it('should default to progressive when strategy is not set', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);
  });

  it('should work with explicit progressive strategy', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'progressive' },
    });

    const skills = await hive.list();
    expect(skills.length).toBeGreaterThanOrEqual(5);

    const results = await hive.search('format code prettier');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe('code-formatter');
  });
});
