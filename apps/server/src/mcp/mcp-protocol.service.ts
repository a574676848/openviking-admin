import { Injectable, UnauthorizedException } from '@nestjs/common';
import { McpSessionService } from './mcp-session.service';
import type {
  JsonRpcId,
  JsonRpcParams,
  JsonRpcRequest,
  McpCredential,
  McpMessageQuery,
} from './mcp.types';
import { CapabilityCatalogService } from '../capabilities/application/capability-catalog.service';
import { CapabilityExecutionService } from '../capabilities/application/capability-execution.service';
import { CapabilityObservabilityService } from '../capabilities/application/capability-observability.service';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';
import type { CapabilityId } from '../capabilities/domain/capability.types';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_SERVER_INFO = {
  name: 'openviking-server',
  version: '1.0.0',
} as const;
const JSON_RPC_VERSION = '2.0';
const JSON_RPC_INVALID_REQUEST_CODE = -32600;
const JSON_RPC_METHOD_NOT_FOUND_CODE = -32601;
const JSON_RPC_INVALID_PARAMS_CODE = -32602;
const MCP_INTERNAL_ERROR_CODE = -32603;
const JSON_RPC_INVALID_REQUEST_MESSAGE = 'Invalid Request';
const JSON_RPC_METHOD_NOT_FOUND_MESSAGE = 'Method not found';
const JSON_RPC_INVALID_PARAMS_MESSAGE = 'Invalid params';
const MCP_FALLBACK_ERROR_MESSAGE = '未知错误';
const MCP_INITIALIZED_NOTIFICATION_METHOD = 'notifications/initialized';

type ValidatedJsonRpcMessage = {
  method: string;
  params?: JsonRpcParams;
} & (
  | {
      id: JsonRpcId;
      isNotification: false;
    }
  | {
      isNotification: true;
    }
);

class McpJsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

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
    const credential = await this.resolveCredential(
      query.key,
      query.sessionKey,
    );
    await this.mcpSessionService.validateSession(
      query.sessionId,
      credential.value,
      query.sessionToken,
    );

    try {
      const message = this.validateJsonRpcMessage(body);
      const result = await this.resolveRpcResult(credential, message);
      if (message.isNotification) {
        return { status: 'accepted' };
      }

      await this.enqueueJsonRpcResult(query.sessionId, message.id, result);
      return { status: 'ok' };
    } catch (err: unknown) {
      const error = this.toJsonRpcError(err);
      if (this.isJsonRpcNotification(body)) {
        return { status: 'error', message: error.message };
      }

      await this.enqueueJsonRpcError(
        query.sessionId,
        this.resolveJsonRpcErrorId(body),
        error,
      );
      return { status: 'error', message: error.message };
    }
  }

  private validateJsonRpcMessage(
    body: JsonRpcRequest,
  ): ValidatedJsonRpcMessage {
    if (!this.isRecord(body) || Array.isArray(body)) {
      throw new McpJsonRpcError(
        JSON_RPC_INVALID_REQUEST_CODE,
        JSON_RPC_INVALID_REQUEST_MESSAGE,
      );
    }

    if (body.jsonrpc !== JSON_RPC_VERSION || typeof body.method !== 'string') {
      throw new McpJsonRpcError(
        JSON_RPC_INVALID_REQUEST_CODE,
        JSON_RPC_INVALID_REQUEST_MESSAGE,
      );
    }

    const hasId = Object.prototype.hasOwnProperty.call(body, 'id');
    if (!hasId) {
      return {
        isNotification: true,
        method: body.method,
        params: this.normalizeJsonRpcParams(body.params),
      };
    }

    if (!this.isValidJsonRpcId(body.id)) {
      throw new McpJsonRpcError(
        JSON_RPC_INVALID_REQUEST_CODE,
        JSON_RPC_INVALID_REQUEST_MESSAGE,
      );
    }

    return {
      id: body.id,
      isNotification: false,
      method: body.method,
      params: this.normalizeJsonRpcParams(body.params),
    };
  }

  private normalizeJsonRpcParams(params: unknown): JsonRpcParams | undefined {
    if (params === undefined) {
      return undefined;
    }

    if (this.isRecord(params) && !Array.isArray(params)) {
      return params;
    }

    throw new McpJsonRpcError(
      JSON_RPC_INVALID_PARAMS_CODE,
      JSON_RPC_INVALID_PARAMS_MESSAGE,
    );
  }

  private isValidJsonRpcId(id: unknown): id is JsonRpcId {
    return (
      typeof id === 'string' || (typeof id === 'number' && Number.isInteger(id))
    );
  }

  private isJsonRpcNotification(body: JsonRpcRequest) {
    return (
      this.isRecord(body) &&
      !Object.prototype.hasOwnProperty.call(body, 'id') &&
      body.jsonrpc === JSON_RPC_VERSION &&
      typeof body.method === 'string'
    );
  }

  private resolveJsonRpcErrorId(body: JsonRpcRequest): JsonRpcId | null {
    if (this.isRecord(body) && this.isValidJsonRpcId(body.id)) {
      return body.id;
    }

    return null;
  }

  private toJsonRpcError(err: unknown) {
    if (err instanceof McpJsonRpcError) {
      return err;
    }

    const message =
      err instanceof Error ? err.message : MCP_FALLBACK_ERROR_MESSAGE;
    return new McpJsonRpcError(MCP_INTERNAL_ERROR_CODE, message);
  }

  private async enqueueJsonRpcResult(
    sessionId: string,
    id: JsonRpcId,
    result: unknown,
  ) {
    await this.mcpSessionService.enqueueEvent(
      sessionId,
      JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id,
        result,
      }),
    );
  }

  private async enqueueJsonRpcError(
    sessionId: string,
    id: JsonRpcId | null,
    error: McpJsonRpcError,
  ) {
    await this.mcpSessionService.enqueueEvent(
      sessionId,
      JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id,
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
    body: ValidatedJsonRpcMessage,
  ) {
    const { method, params } = body;

    if (method === 'tools/list') {
      return { tools: this.capabilityCatalogService.toMcpTools() };
    }

    if (method === 'tools/call') {
      if (typeof params?.name !== 'string') {
        throw new McpJsonRpcError(
          JSON_RPC_INVALID_PARAMS_CODE,
          JSON_RPC_INVALID_PARAMS_MESSAGE,
        );
      }

      const capabilityId = params.name as CapabilityId;
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

    if (method === MCP_INITIALIZED_NOTIFICATION_METHOD) {
      return {};
    }

    throw new McpJsonRpcError(
      JSON_RPC_METHOD_NOT_FOUND_CODE,
      JSON_RPC_METHOD_NOT_FOUND_MESSAGE,
    );
  }

  private toMcpToolResult(
    capabilityId: CapabilityId,
    data: Record<string, unknown>,
  ) {
    const items =
      (data.items as Array<Record<string, unknown>> | undefined) ?? [];

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
