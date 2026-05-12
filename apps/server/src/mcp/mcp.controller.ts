import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpProtocolService } from './mcp-protocol.service';
import { McpSseService } from './mcp-sse.service';
import type { JsonRpcRequest } from './mcp.types';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpProtocolService: McpProtocolService,
    private readonly mcpSseService: McpSseService,
  ) {}

  @Get('sse')
  async sse(
    @Query('key') key: string | undefined,
    @Query('sessionKey') sessionKey: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.mcpProtocolService.createSessionConnection(
      key,
      sessionKey,
    );
    this.mcpSseService.writeEventStream(req, res, session);
  }

  @Post('message')
  @HttpCode(202)
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
