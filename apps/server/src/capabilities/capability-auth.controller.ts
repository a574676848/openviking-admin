import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import type { Response } from 'express';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import { CredentialExchangeService } from './application/credential-exchange.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';

@Controller('auth')
export class CapabilityAuthController {
  constructor(
    private readonly capabilityCredentialService: CapabilityCredentialService,
    private readonly credentialExchangeService: CredentialExchangeService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('credential-options')
  credentialOptions(
    @Headers('x-request-id') requestId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const traceId = randomUUID();
    const effectiveRequestId = requestId ?? traceId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-request-id', effectiveRequestId);
    return {
      data: {
        login: {
          browser: {
            credentialType: 'jwt_access_token',
            exchangeEndpoint: '/api/auth/login',
            refreshEndpoint: '/api/auth/refresh',
            supportsSso: true,
          },
          sso: {
            providers: ['feishu', 'dingtalk', 'oidc', 'ldap'],
            exchangeEndpoint: '/api/auth/sso/exchange',
            refreshEndpoint: '/api/auth/refresh',
          },
        },
        capabilities: [
          {
            channel: 'http',
            credentialType: 'capability_access_token',
            issueEndpoint: '/api/auth/token/exchange',
            ttlSeconds: 7200,
            recommendedFor: ['browser', 'service', 'skill'],
          },
          {
            channel: 'mcp',
            credentialType: 'session_key',
            issueEndpoint: '/api/auth/session/exchange',
            ttlSeconds: 1800,
            recommendedFor: ['mcp', 'short-lived desktop session'],
          },
          {
            channel: 'cli',
            credentialType: 'api_key',
            issueEndpoint: '/api/auth/client-credentials',
            ttlSeconds: null,
            recommendedFor: ['cli', 'automation', 'desktop client'],
          },
        ],
      },
      meta: {
        channel: 'http',
        flow: 'credential.options',
        requestId: effectiveRequestId,
      },
      traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('token/exchange')
  async exchangeToken(
    @Req() req: AuthenticatedRequest,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const traceId = randomUUID();
    const requestId = requestIdHeader ?? traceId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-request-id', requestId);
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'service',
      );

    return {
      data: await this.credentialExchangeService.exchangeAccessToken(
        principal,
        traceId,
        requestId,
      ),
      meta: {
        channel: 'http',
        flow: 'token.exchange',
        requestId,
      },
      traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('session/exchange')
  async exchangeSession(
    @Req() req: AuthenticatedRequest,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const traceId = randomUUID();
    const requestId = requestIdHeader ?? traceId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-request-id', requestId);
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'service',
      );

    return {
      data: await this.credentialExchangeService.exchangeSessionKey(
        principal,
        traceId,
        requestId,
      ),
      meta: {
        channel: 'http',
        flow: 'session.exchange',
        requestId,
      },
      traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  async whoami(
    @Req() req: AuthenticatedRequest,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const traceId = randomUUID();
    const requestId = requestIdHeader ?? traceId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-request-id', requestId);
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'human',
      );

    return {
      data: {
        userId: principal.userId,
        username: principal.username ?? null,
        tenantId: principal.tenantId,
        role: principal.role ?? null,
        scope: principal.scope,
      },
      meta: {
        channel: 'http',
        requestId,
      },
      traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('client-credentials')
  async clientCredentials(
    @Body() body: { name?: string },
    @Req() req: AuthenticatedRequest,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const traceId = randomUUID();
    const requestId = requestIdHeader ?? traceId;
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-request-id', requestId);
    const key = await this.capabilityCredentialService.createApiKey(
      req.user.id,
      req.user.tenantId!,
      body.name ?? 'cli-client',
    );
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'cli',
      );
    await this.capabilityObservabilityService.recordCredentialExchange({
      traceId,
      requestId,
      principal,
      flow: 'client.credentials',
      issuedCredentialType: 'api_key',
      success: true,
    });

    return {
      data: {
        credentialType: 'api_key',
        apiKey: key.apiKey,
        name: key.name,
      },
      meta: {
        channel: 'http',
        flow: 'client.credentials',
        requestId,
      },
      traceId,
      error: null,
    };
  }
}
