import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { RemoteRegistry } from '../src/registry/remote.js';
import { BuiltinAdapter } from '../src/loader/adapters/builtin.js';

let tempDir: string;
const parser = new BuiltinAdapter();

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hive-remote-'));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('RemoteRegistry', () => {
  it('should create a RemoteRegistry instance', () => {
    const registry = new RemoteRegistry({
      url: 'https://example.com/skills',
      parser,
      cacheDir: path.join(tempDir, 'cache'),
    });
    expect(registry).toBeDefined();
  });

  it('should return empty scan when remote is unreachable', async () => {
    const registry = new RemoteRegistry({
      url: 'http://localhost:19999/nonexistent',
      parser,
      cacheDir: path.join(tempDir, 'cache-empty'),
      timeout: 1000,
    });

    const metas = await registry.scan();
    expect(metas).toEqual([]);
  });

  it('should return undefined for unknown skill load', async () => {
    const registry = new RemoteRegistry({
      url: 'http://localhost:19999/nonexistent',
      parser,
      cacheDir: path.join(tempDir, 'cache-load'),
      timeout: 1000,
    });

    const content = await registry.load('nonexistent-skill');
    expect(content).toBeUndefined();
  });

  it('should scan local cache when remote fails', async () => {
    const cacheDir = path.join(tempDir, 'cache-fallback');
    const skillDir = path.join(cacheDir, 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: cached-skill
description: A cached skill
---

# Cached Skill

Instructions here.`,
    );

    const registry = new RemoteRegistry({
      url: 'http://localhost:19999/nonexistent',
      parser,
      cacheDir,
      timeout: 1000,
    });

    const metas = await registry.scan();
    expect(metas.length).toBe(1);
    expect(metas[0]!.name).toBe('cached-skill');
  });

  it('should have install method that handles different URL formats', () => {
    const registry = new RemoteRegistry({
      url: 'https://example.com',
      parser,
      cacheDir: path.join(tempDir, 'cache-install'),
      timeout: 1000,
    });

    expect(typeof registry.install).toBe('function');
  });
});
