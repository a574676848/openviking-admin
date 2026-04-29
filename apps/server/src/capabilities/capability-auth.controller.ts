import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import type { Request, Response } from 'express';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import { CredentialExchangeService } from './application/credential-exchange.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { ensureRequestTrace } from '../common/request-trace';
import { CredentialTtlDto } from './dto/credential-ttl.dto';
import { CREDENTIAL_TTL_POLICIES } from './domain/credential-ttl.policy';

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
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
            ttlSeconds: CREDENTIAL_TTL_POLICIES.capability_access_token.defaultTtlSeconds,
            ttlOptions: CREDENTIAL_TTL_POLICIES.capability_access_token.options,
            recommendedFor: ['browser', 'service', 'skill'],
          },
          {
            channel: 'mcp',
            credentialType: 'session_key',
            issueEndpoint: '/api/auth/session/exchange',
            ttlSeconds: CREDENTIAL_TTL_POLICIES.session_key.defaultTtlSeconds,
            ttlOptions: CREDENTIAL_TTL_POLICIES.session_key.options,
            recommendedFor: ['mcp', 'short-lived desktop session'],
          },
          {
            channel: 'cli',
            credentialType: 'api_key',
            issueEndpoint: '/api/auth/client-credentials',
            ttlSeconds: CREDENTIAL_TTL_POLICIES.api_key.defaultTtlSeconds,
            ttlOptions: CREDENTIAL_TTL_POLICIES.api_key.options,
            recommendedFor: ['cli', 'automation', 'desktop client'],
          },
        ],
      },
      meta: {
        channel: 'http',
        flow: 'credential.options',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('token/exchange')
  async exchangeToken(
    @Body() body: CredentialTtlDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'service',
      );

    return {
      data: await this.credentialExchangeService.exchangeAccessToken(
        principal,
        trace.traceId,
        trace.requestId,
        body.ttlSeconds,
      ),
      meta: {
        channel: 'http',
        flow: 'token.exchange',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('session/exchange')
  async exchangeSession(
    @Body() body: CredentialTtlDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'service',
      );

    return {
      data: await this.credentialExchangeService.exchangeSessionKey(
        principal,
        trace.traceId,
        trace.requestId,
        body.ttlSeconds,
      ),
      meta: {
        channel: 'http',
        flow: 'session.exchange',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('whoami')
  async whoami(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
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
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('client-credentials')
  async clientCredentials(
    @Body() body: { name?: string; ttlSeconds?: number | null },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trace = ensureRequestTrace(req, res);
    const key = await this.capabilityCredentialService.createApiKey(
      req.user.id,
      req.user.tenantId!,
      body.name ?? 'cli-client',
      body.ttlSeconds,
    );
    const principal =
      await this.capabilityCredentialService.resolvePrincipalFromAuthenticatedUser(
        req.user,
        'cli',
      );
    await this.capabilityObservabilityService.recordCredentialExchange({
      traceId: trace.traceId,
      requestId: trace.requestId,
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
        expiresAt: key.expiresAt,
        expiresInSeconds: body.ttlSeconds ?? CREDENTIAL_TTL_POLICIES.api_key.defaultTtlSeconds,
      },
      meta: {
        channel: 'http',
        flow: 'client.credentials',
        requestId: trace.requestId,
      },
      traceId: trace.traceId,
      error: null,
    };
  }
}
