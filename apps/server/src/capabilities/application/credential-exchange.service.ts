import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Principal } from '../domain/capability.types';
import { CapabilityObservabilityService } from './capability-observability.service';

@Injectable()
export class CredentialExchangeService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
  ) {}

  async exchangeAccessToken(principal: Principal, traceId: string, requestId: string) {
    const expiresInSeconds = 2 * 60 * 60;
    const accessToken = this.jwtService.sign(
      {
        sub: principal.userId,
        username: principal.username,
        role: principal.role,
        tenantId: principal.tenantId,
        scope: principal.scope,
        tokenType: 'capability_access_token',
      },
      { expiresIn: `${expiresInSeconds}s` },
    );

    await this.capabilityObservabilityService.recordCredentialExchange({
      traceId,
      requestId,
      principal,
      flow: 'token.exchange',
      issuedCredentialType: 'capability_access_token',
      success: true,
    });

    return {
      credentialType: 'capability_access_token',
      accessToken,
      expiresInSeconds,
    };
  }

  async exchangeSessionKey(principal: Principal, traceId: string, requestId: string) {
    const expiresInSeconds = 30 * 60;
    const sessionKey = this.jwtService.sign(
      {
        sub: principal.userId,
        username: principal.username,
        role: principal.role,
        tenantId: principal.tenantId,
        scope: principal.scope,
        tokenType: 'session_key',
      },
      { expiresIn: `${expiresInSeconds}s` },
    );

    await this.capabilityObservabilityService.recordCredentialExchange({
      traceId,
      requestId,
      principal,
      flow: 'session.exchange',
      issuedCredentialType: 'session_key',
      success: true,
    });

    return {
      credentialType: 'session_key',
      sessionKey,
      expiresInSeconds,
    };
  }
}
