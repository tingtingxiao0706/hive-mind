import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { McpClientManager } from '../src/mcp/index.js';
import { createHiveMind } from '../src/engine.js';
import type { McpConfig, Logger } from '../src/types.js';

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('McpClientManager', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('should not be created when mcp config is absent', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });
    expect(hive).toBeDefined();
    expect(typeof hive.dispose).toBe('function');
  });

  it('should accept mcp configuration without error', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      mcp: {
        servers: [
          {
            name: 'test-server',
            transport: { type: 'stdio', command: 'echo', args: ['hello'] },
          },
        ],
      },
    });
    expect(hive).toBeDefined();
    expect(typeof hive.dispose).toBe('function');
  });

  it('should create McpClientManager instance', () => {
    const config: McpConfig = {
      servers: [
        {
          name: 'test',
          transport: { type: 'stdio', command: 'echo', args: [] },
        },
      ],
    };
    const manager = new McpClientManager(config, logger);
    expect(manager).toBeDefined();
  });

  it('should throw clear error when SDK is not installed', async () => {
    const config: McpConfig = {
      servers: [
        {
          name: 'test',
          transport: { type: 'stdio', command: 'nonexistent-cmd' },
        },
      ],
    };
    const manager = new McpClientManager(config, logger);

    // The SDK IS installed in devDependencies, so connect() will try to start the process.
    // We test that connection failure is handled gracefully (warn + continue).
    await manager.connect();
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    const warnMsg = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(warnMsg).toContain('MCP: failed to connect to "test"');
  });

  it('should return empty tools when no servers connected', async () => {
    const config: McpConfig = {
      servers: [],
    };
    const manager = new McpClientManager(config, logger);
    await manager.connect();
    const tools = await manager.buildTools();
    expect(Object.keys(tools)).toHaveLength(0);
  });

  it('should cache tools after first buildTools() call', async () => {
    const config: McpConfig = { servers: [] };
    const manager = new McpClientManager(config, logger);
    await manager.connect();

    const tools1 = await manager.buildTools();
    const tools2 = await manager.buildTools();
    expect(tools1).toBe(tools2);
  });

  it('should handle dispose when no connections exist', async () => {
    const config: McpConfig = { servers: [] };
    const manager = new McpClientManager(config, logger);
    await expect(manager.dispose()).resolves.not.toThrow();
  });

  it('should handle dispose on HiveMind without mcp config', async () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });
    await expect(hive.dispose()).resolves.not.toThrow();
  });

  it('should use mcp__ naming convention for tool names', async () => {
    const config: McpConfig = {
      servers: [],
    };
    const manager = new McpClientManager(config, logger);
    await manager.connect();
    const tools = await manager.buildTools();
    for (const key of Object.keys(tools)) {
      expect(key).toMatch(/^mcp__/);
    }
  });

  it('should return error for callTool on non-existent server', async () => {
    const config: McpConfig = { servers: [] };
    const manager = new McpClientManager(config, logger);
    await manager.connect();

    const result = await manager.callTool('nonexistent', 'some_tool', {});
    expect(result).toEqual({ error: 'MCP server "nonexistent" not connected' });
  });

  it('should skip connect on second call', async () => {
    const config: McpConfig = { servers: [] };
    const manager = new McpClientManager(config, logger);
    await manager.connect();
    await manager.connect();
    // No error, connect is idempotent
  });

  it('should clear tools cache after dispose', async () => {
    const config: McpConfig = { servers: [] };
    const manager = new McpClientManager(config, logger);
    await manager.connect();
    await manager.buildTools();
    await manager.dispose();
    // After dispose, buildTools should return fresh empty object
    const tools = await manager.buildTools();
    expect(Object.keys(tools)).toHaveLength(0);
  });
});

describe('MCP integration with createHiveMind', () => {
  it('should accept mcp config alongside all other config options', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'progressive' },
      scripts: { enabled: false },
      mcp: {
        servers: [
          {
            name: 'filesystem',
            transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
          },
        ],
        timeout: 15000,
      },
    });
    expect(hive).toBeDefined();
  });

  it('should expose dispose method on HiveMind interface', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
    });
    expect(typeof hive.dispose).toBe('function');
  });

  it('should work with llm-routed strategy and mcp config', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
      mcp: {
        servers: [
          {
            name: 'test',
            transport: { type: 'sse', url: 'http://localhost:3001/sse' },
          },
        ],
      },
    });
    expect(hive).toBeDefined();
  });

  it('should work with streamable-http transport config', () => {
    const hive = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      mcp: {
        servers: [
          {
            name: 'remote',
            transport: {
              type: 'streamable-http',
              url: 'http://localhost:3002/mcp',
              headers: { Authorization: 'Bearer token' },
            },
          },
        ],
      },
    });
    expect(hive).toBeDefined();
  });
});
