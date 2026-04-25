import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Req,
  MessageEvent,
  Sse,
  UnauthorizedException,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { McpService } from './mcp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { McpSessionService } from './mcp-session.service';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { CreateCapabilityKeyDto } from '../capabilities/dto/capability-key.dto';
import { CapabilityCatalogService } from '../capabilities/application/capability-catalog.service';
import { CapabilityExecutionService } from '../capabilities/application/capability-execution.service';
import { CapabilityObservabilityService } from '../capabilities/application/capability-observability.service';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';
import type { CapabilityId } from '../capabilities/domain/capability.types';

interface JsonRpcRequest {
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
  };
}

type McpCredential =
  | { kind: 'apiKey'; value: string }
  | { kind: 'sessionKey'; value: string };

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly mcpSessionService: McpSessionService,
    private readonly capabilityCatalogService: CapabilityCatalogService,
    private readonly capabilityExecutionService: CapabilityExecutionService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityCredentialService: CapabilityCredentialService,
  ) {}

  @Sse('sse')
  async sse(
    @Query('key') key: string | undefined,
    @Query('sessionKey') sessionKey: string | undefined,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    const credential = await this.resolveCredential(key, sessionKey);

    const session = await this.createSessionForCredential(credential);

    return new Observable<MessageEvent>((subscriber) => {
      let polling = false;

      const flushEvents = async () => {
        if (polling) return;
        polling = true;
        try {
          const events = await this.mcpSessionService.pullPendingEvents(
            session.sessionId,
          );
          for (const event of events) {
            subscriber.next({
              data: event.payload,
              type: event.type,
            });
          }
          await this.mcpSessionService.touchSession(session.sessionId);
        } finally {
          polling = false;
        }
      };

      subscriber.next({
        data: session.endpoint,
        type: 'endpoint',
      });

      const timer = setInterval(() => {
        void flushEvents();
      }, 1000);

      void flushEvents();

      const cleanup = () => {
        clearInterval(timer);
        void this.mcpSessionService.closeSession(session.sessionId);
        subscriber.complete();
      };

      req.on('close', cleanup);
      req.on('end', cleanup);

      return cleanup;
    });
  }

  @Post('message')
  async handleMessage(
    @Query('sessionId') sessionId: string,
    @Query('sessionToken') sessionToken: string,
    @Query('key') key: string | undefined,
    @Query('sessionKey') sessionKey: string | undefined,
    @Body() body: JsonRpcRequest,
  ) {
    const credential = await this.resolveCredential(key, sessionKey);
    await this.mcpSessionService.validateSession(
      sessionId,
      credential.value,
      sessionToken,
    );

    const { id, method, params } = body;

    try {
      let result: unknown;

      if (method === 'tools/list') {
        result = { tools: this.capabilityCatalogService.toMcpTools() };
      } else if (method === 'tools/call') {
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
        result = this.toMcpToolResult(capabilityId, execution.data);
      } else if (method === 'initialize') {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'openviking-server',
            version: '1.0.0',
          },
        };
      } else {
        result = {};
      }

      await this.mcpSessionService.enqueueEvent(
        sessionId,
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result,
        }),
      );

      return { status: 'ok' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      await this.mcpSessionService.enqueueEvent(
        sessionId,
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message,
          },
        }),
      );
      return { status: 'error', message };
    }
  }

  @Post('keys')
  @UseGuards(JwtAuthGuard)
  async createMyCapabilityKey(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCapabilityKeyDto,
  ) {
    return this.mcpService.createCapabilityKey(
      req.user.id,
      req.user.tenantId,
      dto.name,
    );
  }

  @Get('keys')
  @UseGuards(JwtAuthGuard)
  async getMyCapabilityKeys(@Req() req: AuthenticatedRequest) {
    return this.mcpService.getCapabilityKeysByUser(req.user.id);
  }

  @Delete('keys/:id')
  @UseGuards(JwtAuthGuard)
  async deleteMyCapabilityKey(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.mcpService.deleteCapabilityKey(id, req.user.id);
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

  private async createSessionForCredential(credential: McpCredential) {
    return this.mcpSessionService.createSession(
      credential.value,
      credential.kind === 'apiKey' ? 'key' : 'sessionKey',
    );
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
