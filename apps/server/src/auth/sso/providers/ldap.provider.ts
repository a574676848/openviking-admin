import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Client } from 'ldapts';
import { ISSOProvider, SSOUser } from '../interfaces/sso-provider.interface';
import { Integration } from '../../../tenant/entities/integration.entity';
import { SystemRoles, type UserRole } from '../../../users/entities/user.entity';

interface LdapCredentials {
  url?: string;
  baseDN?: string;
  baseDn?: string;
  bindDN?: string;
  bindDn?: string;
  bindPassword?: string;
  userFilter?: string;
  usernameAttribute?: string;
  idAttribute?: string;
  displayNameAttribute?: string;
  emailAttribute?: string;
  defaultRole?: UserRole;
  roleMappings?: string | Record<string, UserRole>;
  connectTimeoutMs?: string | number;
  timeoutMs?: string | number;
  tlsRejectUnauthorized?: string | boolean;
}

type LdapEntry = Record<string, unknown> & { dn?: string };

const DEFAULT_USER_FILTER =
  '(&(objectClass=person)(|(sAMAccountName={{username}})(userPrincipalName={{username}})(uid={{username}})(cn={{username}})))';
const DEFAULT_USERNAME_ATTRIBUTE = 'sAMAccountName';
const DEFAULT_ID_ATTRIBUTE = 'objectGUID';
const DEFAULT_DISPLAY_NAME_ATTRIBUTE = 'displayName';
const DEFAULT_EMAIL_ATTRIBUTE = 'mail';
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10000;
const ALLOWED_ROLES = new Set<string>(Object.values(SystemRoles));

@Injectable()
export class LdapProvider implements ISSOProvider {
  private readonly logger = new Logger(LdapProvider.name);

  async authenticate(
    integration: Integration,
    payload: { username: string; password: string },
  ): Promise<SSOUser> {
    const credentials = integration.credentials as LdapCredentials;
    const username = payload.username?.trim();

    if (!username || !payload.password) {
      throw new UnauthorizedException('请输入域账号和密码');
    }

    const url = this.requireCredential(credentials.url, 'LDAP URL');
    const baseDN = this.requireCredential(
      credentials.baseDN ?? credentials.baseDn,
      'Base DN',
    );
    const bindDN = this.requireCredential(
      credentials.bindDN ?? credentials.bindDn,
      'Bind DN',
    );
    const bindPassword = this.requireCredential(
      credentials.bindPassword,
      'Bind Password',
    );

    this.logger.log(`>> Attempting LDAP bind for user: ${username} on ${url}`);

    const searchClient = this.createClient(credentials);
    try {
      await searchClient.bind(bindDN, bindPassword);
      const userEntry = await this.findUser(searchClient, credentials, baseDN, username);
      const userDN = userEntry.dn;

      if (!userDN) {
        throw new UnauthorizedException('LDAP 用户缺少 DN，无法完成绑定验证');
      }

      await this.verifyUserPassword(credentials, userDN, payload.password);

      return this.toSSOUser(credentials, userEntry, username, userDN);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`LDAP authentication failed: ${message}`);
      throw new UnauthorizedException('LDAP 认证失败，请检查域账号或目录配置');
    } finally {
      await this.safeUnbind(searchClient);
    }
  }

  private async findUser(
    client: Client,
    credentials: LdapCredentials,
    baseDN: string,
    username: string,
  ): Promise<LdapEntry> {
    const filterTemplate = credentials.userFilter?.trim() || DEFAULT_USER_FILTER;
    const filter = filterTemplate.replaceAll(
      '{{username}}',
      this.escapeFilterValue(username),
    );
    const attributes = this.resolveSearchAttributes(credentials);
    const { searchEntries } = await client.search(baseDN, {
      scope: 'sub',
      filter,
      attributes,
      sizeLimit: 2,
    });

    if (searchEntries.length === 0) {
      throw new UnauthorizedException('未找到匹配的 LDAP 用户');
    }

    if (searchEntries.length > 1) {
      throw new UnauthorizedException('LDAP 用户匹配结果不唯一');
    }

    return searchEntries[0] as LdapEntry;
  }

  private async verifyUserPassword(
    credentials: LdapCredentials,
    userDN: string,
    password: string,
  ): Promise<void> {
    const client = this.createClient(credentials);
    try {
      await client.bind(userDN, password);
    } finally {
      await this.safeUnbind(client);
    }
  }

  private toSSOUser(
    credentials: LdapCredentials,
    entry: LdapEntry,
    inputUsername: string,
    userDN: string,
  ): SSOUser {
    const usernameAttribute =
      credentials.usernameAttribute?.trim() || DEFAULT_USERNAME_ATTRIBUTE;
    const idAttribute = credentials.idAttribute?.trim() || DEFAULT_ID_ATTRIBUTE;
    const displayNameAttribute =
      credentials.displayNameAttribute?.trim() || DEFAULT_DISPLAY_NAME_ATTRIBUTE;
    const emailAttribute =
      credentials.emailAttribute?.trim() || DEFAULT_EMAIL_ATTRIBUTE;
    const username = this.firstString(entry[usernameAttribute]) ?? inputUsername;
    const identityValue = this.firstString(entry[idAttribute]) ?? userDN;
    const groups = this.stringList(entry.memberOf).map((group) =>
      group.toLowerCase(),
    );

    return {
      ssoId: `ldap:${identityValue}`,
      username,
      role: this.resolveRole(credentials, groups),
      email: this.firstString(entry[emailAttribute]),
      displayName: this.firstString(entry[displayNameAttribute]) ?? username,
      raw: {
        dn: userDN,
        memberOf: groups,
        usernameAttribute,
        idAttribute,
      },
    };
  }

  private resolveRole(
    credentials: LdapCredentials,
    groups: string[],
  ): UserRole {
    const mappings = this.parseRoleMappings(credentials.roleMappings);

    for (const [groupDN, role] of Object.entries(mappings)) {
      if (groups.includes(groupDN.toLowerCase())) {
        return role;
      }
    }

    return this.normalizeRole(credentials.defaultRole) ?? SystemRoles.TENANT_VIEWER;
  }

  private parseRoleMappings(
    mappings: LdapCredentials['roleMappings'],
  ): Record<string, UserRole> {
    if (!mappings) {
      return {};
    }

    const parsed =
      typeof mappings === 'string' ? this.parseRoleMappingString(mappings) : mappings;
    const result: Record<string, UserRole> = {};

    for (const [groupDN, role] of Object.entries(parsed)) {
      const normalizedRole = this.normalizeRole(role);
      if (groupDN.trim() && normalizedRole) {
        result[groupDN.trim()] = normalizedRole;
      }
    }

    return result;
  }

  private parseRoleMappingString(value: string): Record<string, UserRole> {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed) as Record<string, UserRole>;
    } catch {
      throw new UnauthorizedException('LDAP 角色映射不是合法 JSON');
    }
  }

  private normalizeRole(role: unknown): UserRole | null {
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
      return null;
    }

    return role as UserRole;
  }

  private resolveSearchAttributes(credentials: LdapCredentials): string[] {
    return Array.from(
      new Set([
        'dn',
        'memberOf',
        credentials.usernameAttribute?.trim() || DEFAULT_USERNAME_ATTRIBUTE,
        credentials.idAttribute?.trim() || DEFAULT_ID_ATTRIBUTE,
        credentials.displayNameAttribute?.trim() || DEFAULT_DISPLAY_NAME_ATTRIBUTE,
        credentials.emailAttribute?.trim() || DEFAULT_EMAIL_ATTRIBUTE,
      ]),
    );
  }

  private createClient(credentials: LdapCredentials): Client {
    const url = this.requireCredential(credentials.url, 'LDAP URL');
    const rejectUnauthorized = this.toBoolean(
      credentials.tlsRejectUnauthorized,
      true,
    );

    return new Client({
      url,
      connectTimeout: this.toNumber(
        credentials.connectTimeoutMs,
        DEFAULT_CONNECT_TIMEOUT_MS,
      ),
      timeout: this.toNumber(credentials.timeoutMs, DEFAULT_TIMEOUT_MS),
      tlsOptions: {
        rejectUnauthorized,
      },
    });
  }

  private async safeUnbind(client: Client): Promise<void> {
    try {
      await client.unbind();
    } catch {
      // 连接失败或已关闭时无需额外处理，认证错误会在主流程抛出。
    }
  }

  private requireCredential(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new UnauthorizedException(`LDAP 配置缺少 ${label}`);
    }

    return value.trim();
  }

  private firstString(value: unknown): string | undefined {
    if (Array.isArray(value)) {
      return this.firstString(value[0]);
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('hex');
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return undefined;
  }

  private stringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.firstString(item))
        .filter((item): item is string => Boolean(item));
    }

    const first = this.firstString(value);
    return first ? [first] : [];
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }

    return fallback;
  }

  private escapeFilterValue(value: string): string {
    return value.replace(/[\\*()\0]/g, (char) => {
      switch (char) {
        case '\\':
          return '\\5c';
        case '*':
          return '\\2a';
        case '(':
          return '\\28';
        case ')':
          return '\\29';
        case '\0':
          return '\\00';
        default:
          return char;
      }
    });
  }
}
