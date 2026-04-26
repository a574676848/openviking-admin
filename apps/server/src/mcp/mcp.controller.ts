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
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { CreateCapabilityKeyDto } from '../capabilities/dto/capability-key.dto';
import { AuditService } from '../audit/audit.service';
import { McpProtocolService } from './mcp-protocol.service';
import { McpSseService } from './mcp-sse.service';
import type { JsonRpcRequest } from './mcp.types';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly mcpProtocolService: McpProtocolService,
    private readonly mcpSseService: McpSseService,
    private readonly auditService: AuditService,
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

  @Post('keys')
  @UseGuards(JwtAuthGuard)
  async createMyCapabilityKey(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCapabilityKeyDto,
  ) {
    const created = await this.mcpService.createCapabilityKey(
      req.user.id,
      req.user.tenantId,
      dto.name,
    );
    await this.auditService.log({
      tenantId: req.user.tenantId ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'create_capability_key',
      target: created.id,
      meta: { name: created.name, requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return created;
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
    const result = await this.mcpService.deleteCapabilityKey(id, req.user.id);
    await this.auditService.log({
      tenantId: req.user.tenantId ?? undefined,
      userId: req.user.id,
      username: req.user.username,
      action: 'delete_capability_key',
      target: id,
      meta: { requestId: req.headers['x-request-id'] },
      ip: req.ip,
    });
    return result;
  }
}
