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
import { CreateMcpKeyDto } from './dto/mcp-key.dto';
import { McpSessionService } from './mcp-session.service';

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
  };
};

@Controller('api/mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly mcpSessionService: McpSessionService,
  ) {}

  /**
   * MCP SSE 建立连接
   * GET /api/mcp/sse?key=ov-sk-xxx
   */
  @Sse('sse')
  async sse(
    @Query('key') key: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    if (!key) throw new UnauthorizedException('Missing MCP Key');

    await this.mcpService.validateKeyAndGetConfig(key);
    const session = await this.mcpSessionService.createSession(key);

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

  /**
   * 接收客户端的 JSON-RPC 消息
   */
  @Post('message')
  async handleMessage(
    @Query('sessionId') sessionId: string,
    @Query('sessionToken') sessionToken: string,
    @Query('key') key: string,
    @Body() body: JsonRpcRequest,
  ) {
    await this.mcpSessionService.validateSession(sessionId, key, sessionToken);

    const { id, method, params } = body;

    try {
      let result: unknown;

      if (method === 'tools/list') {
        result = {
          tools: [
            {
              name: 'search_knowledge',
              description: '在知识库中进行语义搜索',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: '搜索关键词' },
                  limit: { type: 'number', description: '返回结果数量' },
                },
                required: ['query'],
              },
            },
            {
              name: 'grep_knowledge',
              description: '关键词精确匹配搜索',
              inputSchema: {
                type: 'object',
                properties: {
                  pattern: {
                    type: 'string',
                    description: '正则表达式或关键词',
                  },
                  uri: { type: 'string', description: '搜索范围 URI' },
                },
                required: ['pattern'],
              },
            },
            {
              name: 'list_resources',
              description: '列出指定 URI 下的资源',
              inputSchema: {
                type: 'object',
                properties: {
                  uri: { type: 'string', description: '资源 URI' },
                },
                required: ['uri'],
              },
            },
            {
              name: 'tree_resources',
              description: '以树状结构列出资源',
              inputSchema: {
                type: 'object',
                properties: {
                  uri: { type: 'string', description: '根 URI' },
                  depth: { type: 'number', description: '深度' },
                },
                required: ['uri'],
              },
            },
          ],
        };
      } else if (method === 'tools/call') {
        result = await this.mcpService.handleToolCall(
          key,
          params?.name ?? '',
          params?.arguments,
        );
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

  // --- MCP Key Management ---

  @Post('keys')
  @UseGuards(JwtAuthGuard)
  async createMyKey(@Req() req: any, @Body() dto: CreateMcpKeyDto) {
    return this.mcpService.createKey(req.user.id, req.user.tenantId, dto.name);
  }

  @Get('keys')
  @UseGuards(JwtAuthGuard)
  async getMyKeys(@Req() req: any) {
    return this.mcpService.getKeysByUser(req.user.id);
  }

  @Delete('keys/:id')
  @UseGuards(JwtAuthGuard)
  async deleteMyKey(@Req() req: any, @Param('id') id: string) {
    return this.mcpService.deleteKey(id, req.user.id);
  }
}
