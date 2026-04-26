import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CapabilityDiscoveryService } from './application/capability-discovery.service';
import { CapabilityExecutionService } from './application/capability-execution.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import {
  CapabilityId,
  ClientType,
  Principal,
} from './domain/capability.types';
import { ensureRequestTrace } from '../common/request-trace';

@Controller()
export class CapabilitiesController {
  constructor(
    private readonly capabilityDiscoveryService: CapabilityDiscoveryService,
    private readonly capabilityExecutionService: CapabilityExecutionService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityCredentialService: CapabilityCredentialService,
  ) {}

  @Get('capabilities')
  listCapabilities(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    const capabilities = this.capabilityDiscoveryService.listCapabilities();
    return {
      data: capabilities,
      meta: {
        channel: 'http',
        count: capabilities.length,
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @Post('knowledge/search')
  async search(
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledge.search',
      body,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Post('knowledge/grep')
  async grep(
    @Body() body: Record<string, unknown>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'knowledge.grep',
      body,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('resources')
  async listResources(
    @Query() query: Record<string, string>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'resources.list',
      query,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  @Get('resources/tree')
  async treeResources(
    @Query() query: Record<string, string>,
    @Headers('x-capability-key') capabilityKey: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.executeCapability(
      'resources.tree',
      query,
      this.resolveClientType('http'),
      req,
      res,
      capabilityKey,
      authorization,
    );
  }

  private async executeCapability(
    capabilityId: CapabilityId,
    input: Record<string, unknown>,
    clientType: ClientType,
    req: Request,
    res: Response,
    capabilityKey?: string,
    authorization?: string,
  ) {
    ensureRequestTrace(req, res);
    const principal = await this.resolvePrincipal(
      capabilityKey,
      authorization,
      clientType,
    );
    const trace = this.capabilityObservabilityService.createTraceContext({
      capability: capabilityId,
      principal,
      channel: 'http',
      requestId: req.header('x-request-id') ?? undefined,
    });
    const result = await this.capabilityExecutionService.execute(
      capabilityId,
      input,
      {
        principal,
        trace,
      },
    );

    res.setHeader('x-trace-id', result.traceId);
    res.setHeader('x-request-id', trace.requestId);
    return result;
  }

  private async resolvePrincipal(
    capabilityKey: string | undefined,
    authorization: string | undefined,
    clientType: ClientType,
  ): Promise<Principal> {
    if (capabilityKey) {
      return this.capabilityCredentialService.resolvePrincipalFromApiKey(
        capabilityKey,
        clientType,
      );
    }

    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length).trim();
      if (bearer.startsWith('ov-sk-')) {
        return this.capabilityCredentialService.resolvePrincipalFromApiKey(
          bearer,
          clientType,
        );
      }

      return this.capabilityCredentialService.resolvePrincipalFromJwt(
        bearer,
        clientType,
      );
    }

    throw new UnauthorizedException('缺少 capability 调用凭证');
  }

  private resolveClientType(channel: 'http'): ClientType {
    return channel === 'http' ? 'service' : 'human';
  }
}
