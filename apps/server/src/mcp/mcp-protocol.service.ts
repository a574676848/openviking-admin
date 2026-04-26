import { Injectable, UnauthorizedException } from '@nestjs/common';
import { McpSessionService } from './mcp-session.service';
import type {
  JsonRpcRequest,
  McpCredential,
  McpMessageQuery,
} from './mcp.types';
import { CapabilityCatalogService } from '../capabilities/application/capability-catalog.service';
import { CapabilityExecutionService } from '../capabilities/application/capability-execution.service';
import { CapabilityObservabilityService } from '../capabilities/application/capability-observability.service';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';
import type { CapabilityId } from '../capabilities/domain/capability.types';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_SERVER_INFO = {
  name: 'openviking-server',
  version: '1.0.0',
} as const;
const JSON_RPC_VERSION = '2.0';
const MCP_INTERNAL_ERROR_CODE = -32603;
const MCP_FALLBACK_ERROR_MESSAGE = '未知错误';

@Injectable()
export class McpProtocolService {
  constructor(
    private readonly mcpSessionService: McpSessionService,
    private readonly capabilityCatalogService: CapabilityCatalogService,
    private readonly capabilityExecutionService: CapabilityExecutionService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityCredentialService: CapabilityCredentialService,
  ) {}

  async createSessionConnection(key?: string, sessionKey?: string) {
    const credential = await this.resolveCredential(key, sessionKey);
    return this.mcpSessionService.createSession(
      credential.value,
      credential.kind === 'apiKey' ? 'key' : 'sessionKey',
    );
  }

  async handleMessage(query: McpMessageQuery, body: JsonRpcRequest) {
    const credential = await this.resolveCredential(query.key, query.sessionKey);
    await this.mcpSessionService.validateSession(
      query.sessionId,
      credential.value,
      query.sessionToken,
    );

    try {
      const result = await this.resolveRpcResult(credential, body);
      await this.mcpSessionService.enqueueEvent(
        query.sessionId,
        JSON.stringify({
          jsonrpc: JSON_RPC_VERSION,
          id: body.id,
          result,
        }),
      );
      return { status: 'ok' };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : MCP_FALLBACK_ERROR_MESSAGE;
      await this.mcpSessionService.enqueueEvent(
        query.sessionId,
        JSON.stringify({
          jsonrpc: JSON_RPC_VERSION,
          id: body.id,
          error: {
            code: MCP_INTERNAL_ERROR_CODE,
            message,
          },
        }),
      );
      return { status: 'error', message };
    }
  }

  private async resolveCredential(
    key?: string,
    sessionKey?: string,
  ): Promise<McpCredential> {
    if (key) {
      await this.capabilityCredentialService.resolvePrincipalFromApiKey(
        key,
        'mcp',
      );
      return { kind: 'apiKey', value: key };
    }

    if (sessionKey) {
      await this.capabilityCredentialService.resolvePrincipalFromJwt(
        sessionKey,
        'mcp',
      );
      return { kind: 'sessionKey', value: sessionKey };
    }

    throw new UnauthorizedException('Missing MCP credential');
  }

  private async resolvePrincipalFromCredential(credential: McpCredential) {
    if (credential.kind === 'apiKey') {
      return this.capabilityCredentialService.resolvePrincipalFromApiKey(
        credential.value,
        'mcp',
      );
    }

    return this.capabilityCredentialService.resolvePrincipalFromJwt(
      credential.value,
      'mcp',
    );
  }

  private async resolveRpcResult(
    credential: McpCredential,
    body: JsonRpcRequest,
  ) {
    const { method, params } = body;

    if (method === 'tools/list') {
      return { tools: this.capabilityCatalogService.toMcpTools() };
    }

    if (method === 'tools/call') {
      const capabilityId = params?.name as CapabilityId;
      const principal = await this.resolvePrincipalFromCredential(credential);
      const trace = this.capabilityObservabilityService.createTraceContext({
        capability: capabilityId,
        principal,
        channel: 'mcp',
      });
      const execution = await this.capabilityExecutionService.execute(
        capabilityId,
        (params?.arguments as Record<string, unknown>) ?? {},
        {
          principal,
          trace,
        },
      );
      return this.toMcpToolResult(capabilityId, execution.data);
    }

    if (method === 'initialize') {
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: MCP_SERVER_INFO,
      };
    }

    return {};
  }

  private toMcpToolResult(
    capabilityId: CapabilityId,
    data: Record<string, unknown>,
  ) {
    const items = ((data.items as Array<Record<string, unknown>> | undefined) ??
      []) as Array<Record<string, unknown>>;

    switch (capabilityId) {
      case 'knowledge.search':
        return {
          content: [
            {
              type: 'text',
              text:
                items.length === 0
                  ? '未找到相关知识。'
                  : items
                      .map(
                        (item, index) =>
                          `## ${index + 1}\nURI: ${String(item.uri)}\nScore: ${String(item.score)}\n摘要: ${String(item.abstract ?? '（无摘要）')}`,
                      )
                      .join('\n\n'),
            },
          ],
        };
      case 'knowledge.grep':
        return {
          content: [
            {
              type: 'text',
              text:
                items.length === 0
                  ? '未找到匹配内容。'
                  : items
                      .map(
                        (item) =>
                          `L${String(item.line)} | ${String(item.uri)}\n  ${String(item.content)}`,
                      )
                      .join('\n\n'),
            },
          ],
        };
      case 'resources.list':
        return {
          content: [
            {
              type: 'text',
              text: items
                .map(
                  (item) =>
                    `${item.isDir ? '[DIR]' : '[FILE]'} ${String(item.uri)}`,
                )
                .join('\n'),
            },
          ],
        };
      case 'resources.tree':
        return {
          content: [
            {
              type: 'text',
              text: String(data.renderedTree ?? ''),
            },
          ],
        };
      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
    }
  }
}
