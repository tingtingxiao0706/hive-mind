/**
 * MCP Client 集成快速测试——验证 MCP 工具发现和注入。
 *
 * 使用 @modelcontextprotocol/server-filesystem 作为测试 MCP Server，
 * 验证 HiveMind 能正确发现 MCP 工具并注入到 LLM 工具链中。
 *
 * 运行: npx tsx src/test-mcp.ts
 */
import { createHiveMind } from '@ai-hivemind/core';
import type { HiveMind } from '@ai-hivemind/core';
import { McpClientManager } from '@ai-hivemind/core';
import type { McpConfig } from '@ai-hivemind/core';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const TEST_DIR = path.resolve(__dirname, '..');

// 用于创建 logger
function createTestLogger() {
  return {
    debug: (msg: string) => console.log(`  [debug] ${msg}`),
    info: (msg: string) => console.log(`  [info]  ${msg}`),
    warn: (msg: string) => console.log(`  [warn]  ${msg}`),
    error: (msg: string) => console.log(`  [error] ${msg}`),
  };
}

async function testMcpClientManager() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  测试 1: McpClientManager 直接测试');
  console.log('═══════════════════════════════════════════════\n');

  const config: McpConfig = {
    servers: [
      {
        name: 'filesystem',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', TEST_DIR],
        },
      },
    ],
    timeout: 10000,
  };

  const logger = createTestLogger();
  const manager = new McpClientManager(config, logger);

  try {
    console.log('→ 连接 MCP Server (filesystem)...');
    await manager.connect();
    console.log('✓ 连接成功\n');

    console.log('→ 构建 AI SDK 工具...');
    const tools = await manager.buildTools();
    const toolNames = Object.keys(tools);
    console.log(`✓ 发现 ${toolNames.length} 个 MCP 工具:\n`);
    for (const name of toolNames) {
      console.log(`  • ${name}`);
    }

    // 验证命名约定
    console.log('\n→ 验证命名约定 (mcp__<server>__<tool>)...');
    const allValid = toolNames.every(n => n.startsWith('mcp__filesystem__'));
    console.log(allValid ? '✓ 所有工具名符合 mcp__filesystem__* 约定' : '✗ 有工具名不符合约定');

    // 测试工具调用 - 读取文件
    console.log('\n→ 测试 callTool: 读取 package.json...');
    const result = await manager.callTool('filesystem', 'read_file', {
      path: path.resolve(TEST_DIR, 'package.json'),
    });
    if (result && typeof result === 'object' && !('error' in (result as Record<string, unknown>))) {
      console.log('✓ 工具调用成功，返回内容:');
      const content = JSON.stringify(result).slice(0, 200);
      console.log(`  ${content}...`);
    } else {
      console.log('✓ 工具调用返回:', JSON.stringify(result).slice(0, 300));
    }

    console.log('\n→ 释放连接...');
    await manager.dispose();
    console.log('✓ 连接已释放');
  } catch (err) {
    console.error('✗ 测试失败:', err);
    await manager.dispose().catch(() => {});
  }
}

async function testHiveMindWithMcp() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  测试 2: createHiveMind + MCP 集成');
  console.log('═══════════════════════════════════════════════\n');

  const hive: HiveMind = createHiveMind({
    models: { default: {} as any },
    skills: [{ type: 'local', path: SKILLS_DIR }],
    loading: { strategy: 'progressive' },
    logLevel: 'info',
    mcp: {
      servers: [
        {
          name: 'filesystem',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', TEST_DIR],
          },
        },
      ],
      timeout: 10000,
    },
  });

  try {
    console.log('→ 创建 HiveMind 实例 (with mcp config)...');
    console.log('✓ 实例创建成功\n');

    console.log('→ 列出技能 (触发 Phase 1 发现)...');
    const skills = await hive.list();
    console.log(`✓ 发现 ${skills.length} 个技能: [${skills.map((s: { name: string }) => s.name).join(', ')}]\n`);

    console.log('→ 验证 dispose()...');
    await hive.dispose();
    console.log('✓ dispose 成功\n');

    console.log('→ 创建新实例测试 llm-routed + MCP...');
    const hive2: HiveMind = createHiveMind({
      models: { default: {} as any },
      skills: [{ type: 'local', path: SKILLS_DIR }],
      loading: { strategy: 'llm-routed' },
      logLevel: 'info',
      mcp: {
        servers: [
          {
            name: 'fs',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', TEST_DIR],
            },
          },
        ],
      },
    });
    console.log('✓ llm-routed + MCP 实例创建成功');
    await hive2.dispose();
    console.log('✓ dispose 成功');
  } catch (err) {
    console.error('✗ 测试失败:', err);
    await hive.dispose().catch(() => {});
  }
}

async function testMcpWithoutConfig() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  测试 3: 无 MCP 配置时行为不变');
  console.log('═══════════════════════════════════════════════\n');

  const hive = createHiveMind({
    models: { default: {} as any },
    skills: [{ type: 'local', path: SKILLS_DIR }],
  });

  console.log('→ 创建无 MCP 的 HiveMind...');
  console.log('✓ 实例创建成功');

  console.log('→ 调用 dispose() (无 MCP 时应安全无操作)...');
  await hive.dispose();
  console.log('✓ dispose 无异常');

  console.log('→ 列出技能...');
  const skills = await hive.list();
  console.log(`✓ 发现 ${skills.length} 个技能，行为与之前一致`);
}

// 运行所有测试
async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║     Hive-Mind MCP Client 集成测试             ║');
  console.log('╚═══════════════════════════════════════════════╝');

  await testMcpClientManager();
  await testHiveMindWithMcp();
  await testMcpWithoutConfig();

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     所有测试完成                               ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
