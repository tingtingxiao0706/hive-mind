import type { McpConfig, McpServerConfig, Logger } from '../types.js';
import { tool, jsonSchema } from 'ai';

interface McpClientEntry {
  serverName: string;
  config: McpServerConfig;
  client: unknown;
  transport: unknown;
  tools: McpToolInfo[];
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP Client 连接管理器——管理与外部 MCP Server 的连接生命周期。
 *
 * 惰性连接模式：createHiveMind() 时仅创建实例，首次 run()/stream() 时才建立连接。
 * 工具命名约定：mcp__<serverName>__<toolName>（与 OpenClaw 一致）。
 */
export class McpClientManager {
  private clients = new Map<string, McpClientEntry>();
  private connected = false;
  private toolsCache: Record<string, unknown> | null = null;
  private config: McpConfig;
  private logger: Logger;

  constructor(config: McpConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const sdk = await this.loadSdk();

    for (const serverConfig of this.config.servers) {
      try {
        await this.connectServer(serverConfig, sdk);
      } catch (err) {
        this.logger.warn(
          `MCP: failed to connect to "${serverConfig.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.connected = true;
  }

  private async loadSdk(): Promise<{
    Client: new (...args: unknown[]) => unknown;
    StdioClientTransport: new (...args: unknown[]) => unknown;
    SSEClientTransport: new (...args: unknown[]) => unknown;
    StreamableHTTPClientTransport: new (...args: unknown[]) => unknown;
  }> {
    try {
      const sdkPkg = '@modelcontextprotocol/sdk';
      const clientMod = await import(/* webpackIgnore: true */ `${sdkPkg}/client/index.js`);
      const stdioMod = await import(/* webpackIgnore: true */ `${sdkPkg}/client/stdio.js`);
      const sseMod = await import(/* webpackIgnore: true */ `${sdkPkg}/client/sse.js`);
      const httpMod = await import(/* webpackIgnore: true */ `${sdkPkg}/client/streamableHttp.js`);

      return {
        Client: clientMod.Client,
        StdioClientTransport: stdioMod.StdioClientTransport,
        SSEClientTransport: sseMod.SSEClientTransport,
        StreamableHTTPClientTransport: httpMod.StreamableHTTPClientTransport,
      };
    } catch {
      throw new Error(
        'MCP configuration requires @modelcontextprotocol/sdk. ' +
        'Install it with: npm install @modelcontextprotocol/sdk',
      );
    }
  }

  private async connectServer(
    serverConfig: McpServerConfig,
    sdk: Awaited<ReturnType<typeof this.loadSdk>>,
  ): Promise<void> {
    const { Client, StdioClientTransport, SSEClientTransport, StreamableHTTPClientTransport } = sdk;

    let transport: unknown;
    const t = serverConfig.transport;

    if (t.type === 'stdio') {
      transport = new StdioClientTransport({
        command: t.command,
        args: t.args,
        env: t.env,
      });
    } else if (t.type === 'sse') {
      transport = new SSEClientTransport(new URL(t.url), {
        requestInit: t.headers ? { headers: t.headers } : undefined,
      });
    } else if (t.type === 'streamable-http') {
      transport = new StreamableHTTPClientTransport(new URL(t.url), {
        requestInit: t.headers ? { headers: t.headers } : undefined,
      });
    } else {
      throw new Error(`Unknown MCP transport type: ${(t as { type: string }).type}`);
    }

    const client = new Client({
      name: `hive-mind-${serverConfig.name}`,
      version: '1.0.0',
    }) as { connect(t: unknown): Promise<void>; listTools(): Promise<{ tools: McpToolInfo[] }>; callTool(params: unknown, options?: unknown): Promise<unknown>; close(): Promise<void> };

    await client.connect(transport);
    this.logger.info(`MCP: connected to "${serverConfig.name}" via ${t.type}`);

    const { tools } = await client.listTools();
    this.logger.info(`MCP: "${serverConfig.name}" provides ${tools.length} tools: [${tools.map(t => t.name).join(', ')}]`);

    this.clients.set(serverConfig.name, {
      serverName: serverConfig.name,
      config: serverConfig,
      client,
      transport,
      tools,
    });
  }

  async buildTools(): Promise<Record<string, unknown>> {
    if (this.toolsCache) return this.toolsCache;

    const allTools: Record<string, unknown> = {};

    for (const [serverName, entry] of this.clients) {
      for (const mcpTool of entry.tools) {
        const toolName = `mcp__${serverName}__${mcpTool.name}`;
        const description = `[MCP: ${serverName}] ${mcpTool.description ?? mcpTool.name}`;
        const capturedToolName = mcpTool.name;
        const capturedServerName = serverName;

        allTools[toolName] = tool({
          description,
          parameters: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
          execute: async (args: unknown) => {
            return this.callTool(capturedServerName, capturedToolName, args);
          },
        });
      }
    }

    this.toolsCache = allTools;
    return allTools;
  }

  async callTool(server: string, toolName: string, args: unknown): Promise<unknown> {
    const entry = this.clients.get(server);
    if (!entry) {
      return { error: `MCP server "${server}" not connected` };
    }

    const client = entry.client as {
      callTool(params: { name: string; arguments: unknown }): Promise<{ content?: unknown; isError?: boolean }>;
    };

    const timeout = this.config.timeout ?? 30000;

    try {
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('MCP tool call timed out')), timeout),
        ),
      ]);

      if (result.isError) {
        return { error: typeof result.content === 'string' ? result.content : JSON.stringify(result.content) };
      }

      return result.content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`MCP: tool call ${server}/${toolName} failed: ${message}`);
      return { error: message };
    }
  }

  async dispose(): Promise<void> {
    for (const [name, entry] of this.clients) {
      try {
        const client = entry.client as { close(): Promise<void> };
        await client.close();
        this.logger.info(`MCP: disconnected from "${name}"`);
      } catch (err) {
        this.logger.warn(
          `MCP: error disconnecting from "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.clients.clear();
    this.toolsCache = null;
    this.connected = false;
  }
}
