import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';

const SUPPORTED_GIT_INTEGRATION_TYPES = ['github', 'gitlab'];
const PUBLIC_GITHUB_HOSTS = ['github.com', 'www.github.com'];
const GITLAB_TOKEN_USERNAME = 'oauth2';
const GITLAB_USERNAME_KEYS = ['username', 'user', 'account'];

@Injectable()
export class GitIntegrator implements IPlatformIntegrator {
  supports(type: string): boolean {
    return SUPPORTED_GIT_INTEGRATION_TYPES.includes(type);
  }

  resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const token = integration.credentials?.token;
    if (!token) {
      return Promise.resolve({ path: sourceUrl });
    }

    const paths = this.buildCredentialPaths(integration, sourceUrl, token);
    return Promise.resolve({
      path: paths[0] ?? sourceUrl,
      ...(paths.length > 1 ? { fallbackPaths: paths.slice(1) } : {}),
    });
  }

  private buildCredentialPaths(
    integration: Integration,
    sourceUrl: string,
    token: string,
  ) {
    try {
      const variants = integration.type === 'gitlab'
        ? this.buildGitLabCredentialPaths(sourceUrl, token, integration.credentials)
        : this.buildGithubCredentialPaths(sourceUrl, token, integration.credentials);
      return Array.from(new Set(variants.filter(Boolean)));
    } catch {
      return [sourceUrl];
    }
  }

  private buildGithubCredentialPaths(
    sourceUrl: string,
    token: string,
    credentials: Record<string, any>,
  ) {
    const primaryPath = this.withCredential(sourceUrl, token);
    if (this.isPublicGithubHost(sourceUrl)) {
      return [primaryPath];
    }

    return [
      primaryPath,
      ...this.buildGitLabCredentialPaths(sourceUrl, token, credentials),
    ];
  }

  private buildGitLabCredentialPaths(
    sourceUrl: string,
    token: string,
    credentials: Record<string, any>,
  ) {
    const usernames = GITLAB_USERNAME_KEYS
      .map((key) => credentials?.[key])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    return [
      this.withCredential(sourceUrl, GITLAB_TOKEN_USERNAME, token, 'http:'),
      ...usernames.map((username) => this.withCredential(sourceUrl, username, token, 'http:')),
      this.withCredential(sourceUrl, GITLAB_TOKEN_USERNAME, token),
      ...usernames.map((username) => this.withCredential(sourceUrl, username, token)),
      this.withCredential(sourceUrl, token, undefined, 'http:'),
      this.withCredential(sourceUrl, token),
    ];
  }

  private withCredential(
    sourceUrl: string,
    username: string,
    password?: string,
    protocol?: string,
  ) {
    const urlObj = new URL(sourceUrl);
    if (protocol) {
      urlObj.protocol = protocol;
    }
    urlObj.username = username;
    urlObj.password = password ?? '';
    return urlObj.toString();
  }

  private isPublicGithubHost(sourceUrl: string) {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return PUBLIC_GITHUB_HOSTS.includes(hostname);
  }
}
