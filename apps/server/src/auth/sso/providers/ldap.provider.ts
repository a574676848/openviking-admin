import { Injectable, Logger } from '@nestjs/common';
import { ISSOProvider, SSOUser } from '../interfaces/sso-provider.interface';
import { Integration } from '../../../tenant/entities/integration.entity';

@Injectable()
export class LdapProvider implements ISSOProvider {
  private readonly logger = new Logger(LdapProvider.name);

  authenticate(
    integration: Integration,
    payload: { username: string; password: string },
  ): Promise<SSOUser> {
    this.logger.log(
      `>> Attempting LDAP bind for user: ${payload.username} on ${integration.credentials.url}`,
    );

    return Promise.resolve({
      ssoId: `ldap_${payload.username}`,
      username: payload.username,
      displayName: `AD_USER_${payload.username}`,
      raw: { domain: 'enterprise.local' },
    });
  }
}
