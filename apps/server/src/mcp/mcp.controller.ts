import {
  Controller,
  Post,
  Query,
  Req,
  MessageEvent,
  Sse,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { McpProtocolService } from './mcp-protocol.service';
import { McpSseService } from './mcp-sse.service';
import type { JsonRpcRequest } from './mcp.types';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpProtocolService: McpProtocolService,
    private readonly mcpSseService: McpSseService,
  ) {}

  @Sse('sse')
  async sse(
    @Query('key') key: string | undefined,
    @Query('sessionKey') sessionKey: string | undefined,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    const session = await this.mcpProtocolService.createSessionConnection(
      key,
      sessionKey,
    );
    return this.mcpSseService.createEventStream(req, session);
  }

  @Post('message')
  async handleMessage(
    @Query('sessionId') sessionId: string,
    @Query('sessionToken') sessionToken: string,
    @Query('key') key: string | undefined,
    @Query('sessionKey') sessionKey: string | undefined,
    @Body() body: JsonRpcRequest,
  ) {
    return this.mcpProtocolService.handleMessage(
      {
        sessionId,
        sessionToken,
        key,
        sessionKey,
      },
      body,
    );
  }
}
