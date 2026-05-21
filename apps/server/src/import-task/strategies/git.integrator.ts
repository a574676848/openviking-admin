import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from '../constants';

const SUPPORTED_GIT_INTEGRATION_TYPES = ['github', 'gitlab'];
const PUBLIC_GITHUB_HOSTS = ['github.com', 'www.github.com'];
const GITLAB_TOKEN_USERNAME = 'oauth2';
const GITLAB_USERNAME_KEYS = ['username', 'user', 'account'];
const DEFAULT_ARCHIVE_REF = 'HEAD';
const ARCHIVE_MIME_TYPE = 'application/zip';
const API_TIMEOUT_MS = 120_000;
const CLI_TIMEOUT_MS = 120_000;
const CLI_MAX_BUFFER_BYTES = 200 * 1024 * 1024;
const DEFAULT_ARCHIVE_MAX_BYTES = 200 * 1024 * 1024;
const GIT_ARCHIVE_MAX_BYTES_ENV = 'GIT_ARCHIVE_MAX_BYTES';
const MASKED_CREDENTIAL = '***';
const GITHUB_CLI = 'gh';
const GITLAB_CLI = 'glab';
const API_USER_AGENT = 'openviking-admin';
const MAX_ARCHIVE_REDIRECTS = 5;
const GIT_ARCHIVE_WAIT_FOR_COMPLETION = false;
type GitArchivePlatform = 'github' | 'gitlab';

interface GitRepositoryInfo {
  platform: GitArchivePlatform;
  host: string;
  origin: string;
  projectPath: string;
  owner?: string;
  repo: string;
  ref: string;
}
interface GitArchiveStrategy {
  name: string;
  execute: (
    integration: Integration,
    sourceUrl: string,
    token?: string,
  ) => Promise<PlatformInjectConfig | null>;
}

@Injectable()
export class GitIntegrator implements IPlatformIntegrator {
  private readonly logger = new Logger(GitIntegrator.name);

  constructor(@Optional() private readonly configService?: ConfigService) {}

  supports(type: string): boolean {
    return SUPPORTED_GIT_INTEGRATION_TYPES.includes(type);
  }

  async resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const token = integration.credentials?.token;
    for (const strategy of this.createArchiveStrategies()) {
      try {
        const resolved = await strategy.execute(integration, sourceUrl, token);
        if (resolved) {
          return resolved;
        }
      } catch (error) {
        this.logger.warn(
          `Git ${strategy.name} 导入失败，准备尝试下一种方式：${this.toLogMessage(error, token)}`,
        );
      }
    }

    if (!token) {
      return { path: sourceUrl };
    }

    const paths = this.buildCredentialPaths(integration, sourceUrl, token);
    return {
      path: paths[0] ?? sourceUrl,
      ...(paths.length > 1 ? { fallbackPaths: paths.slice(1) } : {}),
    };
  }

  private createArchiveStrategies(): GitArchiveStrategy[] {
    return [
      {
        name: 'API archive',
        execute: (integration, sourceUrl, token) =>
          this.resolveByArchiveApi(integration, sourceUrl, token),
      },
      {
        name: 'CLI archive',
        execute: (integration, sourceUrl, token) =>
          this.resolveByArchiveCli(integration, sourceUrl, token),
      },
    ];
  }

  protected async resolveByArchiveApi(
    integration: Integration,
    sourceUrl: string,
    token?: string,
  ): Promise<PlatformInjectConfig | null> {
    const repoInfo = this.resolveRepositoryInfo(integration, sourceUrl);
    const archiveUrl =
      repoInfo.platform === 'gitlab'
        ? this.buildGitLabArchiveUrl(repoInfo, integration)
        : this.buildGithubArchiveUrl(repoInfo, integration);
    const headers =
      repoInfo.platform === 'gitlab'
        ? this.buildGitLabApiHeaders(token)
        : this.buildGithubApiHeaders(token);
    const filePath =
      repoInfo.platform === 'gitlab'
        ? await this.downloadGitLabArchiveFile(archiveUrl, headers)
        : await this.fetchArchiveFile(archiveUrl, headers);

    return {
      tempFile: {
        fileName: this.buildArchiveFileName(repoInfo),
        filePath,
        cleanupAfterUpload: true,
        mimeType: ARCHIVE_MIME_TYPE,
      },
      waitForCompletion: GIT_ARCHIVE_WAIT_FOR_COMPLETION,
    };
  }

  protected async fetchArchiveFile(
    archiveUrl: string,
    headers: Record<string, string>,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(archiveUrl, {
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${await this.readResponsePreview(response)}`,
      );
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    this.assertArchiveContentLength(contentLength);
    if (!response.body) {
      throw new Error('Git archive 下载响应缺少正文');
    }
    return this.writeArchiveStreamToTempFile(
      Readable.fromWeb(response.body as never),
    );
  }

  protected async downloadGitLabArchiveFile(
    archiveUrl: string,
    headers: Record<string, string>,
  ) {
    return this.requestArchiveFile(archiveUrl, headers);
  }

  private requestArchiveFile(
    archiveUrl: string,
    headers: Record<string, string>,
    redirects = 0,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(archiveUrl);
      const request = url.protocol === 'http:' ? httpRequest : httpsRequest;
      const req = request(url, { method: 'GET', headers }, (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          if (redirects >= MAX_ARCHIVE_REDIRECTS) {
            reject(new Error('HTTP archive 下载重定向次数过多'));
            return;
          }
          this.requestArchiveFile(
            new URL(location, url).toString(),
            headers,
            redirects + 1,
          )
            .then(resolve)
            .catch(reject);
          return;
        }
        const contentLength = Number(response.headers['content-length'] ?? 0);
        try {
          this.assertArchiveContentLength(contentLength);
        } catch (error) {
          response.resume();
          reject(error);
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            reject(
              new Error(
                `HTTP ${statusCode} ${response.statusMessage}: ${this.maskSensitiveText(
                  buffer.toString('utf8').slice(0, 200),
                )}`,
              ),
            );
          });
          return;
        }
        this.writeArchiveStreamToTempFile(response).then(resolve).catch(reject);
      });
      req.setTimeout(API_TIMEOUT_MS, () => req.destroy(new Error('请求超时')));
      req.on('error', reject);
      req.end();
    });
  }

  private assertArchiveContentLength(contentLength: number) {
    const archiveMaxBytes = this.resolveArchiveMaxBytes();
    if (Number.isFinite(contentLength) && contentLength > archiveMaxBytes) {
      throw new Error(
        `Git archive 超过大小限制 ${Math.round(archiveMaxBytes / 1024 / 1024)}MB`,
      );
    }
  }

  private resolveArchiveMaxBytes() {
    const configured = Number(
      this.configService?.get<string>(GIT_ARCHIVE_MAX_BYTES_ENV),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_ARCHIVE_MAX_BYTES;
  }

  private async writeArchiveStreamToTempFile(stream: Readable) {
    const filePath = await this.createArchiveTempFilePath();
    const output = createWriteStream(filePath, { flags: 'wx' });
    let totalSize = 0;

    try {
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buffer.length;
        if (totalSize > this.resolveArchiveMaxBytes()) {
          throw new Error(
            `Git archive 超过大小限制 ${Math.round(this.resolveArchiveMaxBytes() / 1024 / 1024)}MB`,
          );
        }
        if (!output.write(buffer)) {
          await new Promise((resolve) => output.once('drain', resolve));
        }
      }
      await new Promise<void>((resolve, reject) => {
        output.end(() => resolve());
        output.on('error', reject);
      });
      return filePath;
    } catch (error) {
      output.destroy();
      await rm(filePath, { force: true });
      throw error;
    }
  }

  private async createArchiveTempFilePath() {
    const archiveTempDir = this.resolveArchiveTempDir();
    await mkdir(archiveTempDir, { recursive: true });
    return path.join(
      archiveTempDir,
      `archive-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
    );
  }

  private resolveArchiveTempDir() {
    const configured = this.configService?.get<string>(
      LOCAL_IMPORT_UPLOAD_CONFIG.STORAGE_DIR_ENV,
    );
    return path.resolve(
      configured ||
        path.join(
          process.cwd(),
          ...LOCAL_IMPORT_UPLOAD_CONFIG.DEFAULT_STORAGE_SEGMENTS,
        ),
      LOCAL_IMPORT_UPLOAD_CONFIG.GIT_ARCHIVE_SEGMENT,
    );
  }

  protected async resolveByArchiveCli(
    integration: Integration,
    sourceUrl: string,
    token?: string,
  ): Promise<PlatformInjectConfig | null> {
    const repoInfo = this.resolveRepositoryInfo(integration, sourceUrl);
    const cli = repoInfo.platform === 'gitlab' ? GITLAB_CLI : GITHUB_CLI;
    if (!(await this.hasCommand(cli))) {
      throw new Error(`未检测到 ${cli} CLI`);
    }

    const filePath =
      repoInfo.platform === 'gitlab'
        ? await this.downloadGitLabArchiveByCli(repoInfo, token)
        : await this.downloadGithubArchiveByCli(repoInfo, token);
    return {
      tempFile: {
        fileName: this.buildArchiveFileName(repoInfo),
        filePath,
        cleanupAfterUpload: true,
        mimeType: ARCHIVE_MIME_TYPE,
      },
      waitForCompletion: GIT_ARCHIVE_WAIT_FOR_COMPLETION,
    };
  }

  private resolveRepositoryInfo(
    integration: Integration,
    sourceUrl: string,
  ): GitRepositoryInfo {
    const url = new URL(sourceUrl);
    const projectPath = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    const parts = projectPath.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`Git 仓库地址缺少 owner/group 或 repo：${sourceUrl}`);
    }
    const repo = parts.at(-1)!;
    const platform = integration.type === 'gitlab' ? 'gitlab' : 'github';
    return {
      platform,
      host: url.hostname,
      origin: url.origin,
      projectPath,
      owner: parts.length === 2 ? parts[0] : undefined,
      repo,
      ref: this.resolveArchiveRef(integration),
    };
  }

  private resolveArchiveRef(integration: Integration) {
    const ref = integration.config?.branch;
    return typeof ref === 'string' && ref.trim().length > 0
      ? ref.trim()
      : DEFAULT_ARCHIVE_REF;
  }

  private buildGitLabArchiveUrl(
    repoInfo: GitRepositoryInfo,
    integration: Integration,
  ) {
    const baseUrl =
      typeof integration.credentials?.baseUrl === 'string' &&
      integration.credentials.baseUrl.trim().length > 0
        ? integration.credentials.baseUrl.trim()
        : repoInfo.origin;
    const url = new URL(
      `/api/v4/projects/${encodeURIComponent(repoInfo.projectPath)}/repository/archive.zip`,
      baseUrl,
    );
    if (repoInfo.ref !== DEFAULT_ARCHIVE_REF) {
      url.searchParams.set('sha', repoInfo.ref);
    }
    return url.toString();
  }

  private buildGithubArchiveUrl(
    repoInfo: GitRepositoryInfo,
    integration: Integration,
  ) {
    if (!repoInfo.owner) {
      throw new Error(
        `GitHub 仓库地址不支持多级 group：${repoInfo.projectPath}`,
      );
    }
    const apiBaseUrl =
      typeof integration.credentials?.apiBaseUrl === 'string'
        ? integration.credentials.apiBaseUrl.replace(/\/+$/, '')
        : repoInfo.host === 'github.com'
          ? 'https://api.github.com'
          : `${repoInfo.origin}/api/v3`;
    return `${apiBaseUrl}/repos/${repoInfo.owner}/${repoInfo.repo}/zipball/${encodeURIComponent(repoInfo.ref)}`;
  }

  private buildGitLabApiHeaders(token?: string): Record<string, string> {
    return {
      Accept: ARCHIVE_MIME_TYPE,
      'User-Agent': API_USER_AGENT,
      ...(token ? { 'PRIVATE-TOKEN': token } : {}),
    };
  }

  private buildGithubApiHeaders(token?: string): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      'User-Agent': API_USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async downloadGitLabArchiveByCli(
    repoInfo: GitRepositoryInfo,
    token?: string,
  ) {
    const endpoint = `/projects/${encodeURIComponent(
      repoInfo.projectPath,
    )}/repository/archive.zip${
      repoInfo.ref === DEFAULT_ARCHIVE_REF
        ? ''
        : `?sha=${encodeURIComponent(repoInfo.ref)}`
    }`;
    return this.execCliToArchiveFile(
      GITLAB_CLI,
      ['api', '--hostname', repoInfo.host, endpoint],
      {
        GITLAB_TOKEN: token ?? '',
        GITLAB_HOST: repoInfo.host,
      },
    );
  }

  private async downloadGithubArchiveByCli(
    repoInfo: GitRepositoryInfo,
    token?: string,
  ) {
    if (!repoInfo.owner) {
      throw new Error(
        `GitHub 仓库地址不支持多级 group：${repoInfo.projectPath}`,
      );
    }
    return this.execCliToArchiveFile(
      GITHUB_CLI,
      [
        'api',
        `repos/${repoInfo.owner}/${repoInfo.repo}/zipball/${repoInfo.ref}`,
      ],
      {
        GH_TOKEN: token ?? '',
        GITHUB_TOKEN: token ?? '',
        GH_HOST: repoInfo.host,
      },
    );
  }

  protected async hasCommand(command: string) {
    try {
      await this.execCli(command, ['--version'], {});
      return true;
    } catch {
      return false;
    }
  }

  protected execCli(
    command: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          encoding: 'buffer',
          timeout: CLI_TIMEOUT_MS,
          maxBuffer: CLI_MAX_BUFFER_BYTES,
          env: { ...process.env, ...env },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `${error.message}${stderr?.length ? `: ${stderr.toString('utf8')}` : ''}`,
              ),
            );
            return;
          }
          resolve(Buffer.from(stdout));
        },
      );
    });
  }

  private async execCliToArchiveFile(
    command: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<string> {
    const filePath = await this.createArchiveTempFilePath();
    return new Promise((resolve, reject) => {
      const output = createWriteStream(filePath, { flags: 'wx' });
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stderrChunks: Buffer[] = [];
      let totalSize = 0;
      let settled = false;
      const timeout = setTimeout(() => child.kill('SIGTERM'), CLI_TIMEOUT_MS);

      const fail = async (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        output.destroy();
        await rm(filePath, { force: true });
        reject(error);
      };

      child.stdout.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > this.resolveArchiveMaxBytes()) {
          child.kill('SIGTERM');
          void fail(
            new Error(
              `Git archive 超过大小限制 ${Math.round(this.resolveArchiveMaxBytes() / 1024 / 1024)}MB`,
            ),
          );
          return;
        }
        if (!output.write(chunk)) {
          child.stdout.pause();
          output.once('drain', () => child.stdout.resume());
        }
      });

      child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
      child.on('error', (error) => void fail(error));
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        if (code !== 0) {
          void fail(
            new Error(
              `${command} ${args.join(' ')} exited with ${code}: ${Buffer.concat(
                stderrChunks,
              )
                .toString('utf8')
                .slice(0, 200)}`,
            ),
          );
          return;
        }
        output.end(() => {
          settled = true;
          resolve(filePath);
        });
      });
    });
  }

  private buildArchiveFileName(repoInfo: GitRepositoryInfo) {
    return `${repoInfo.repo}-${repoInfo.ref}.zip`;
  }

  private async readResponsePreview(response: Response) {
    const text = await response.text().catch(() => '');
    return this.maskSensitiveText(text).slice(0, 200);
  }

  private toLogMessage(error: unknown, token?: string) {
    const message =
      error instanceof Error ? error.message : String(error ?? '未知错误');
    return this.maskSensitiveText(message, token);
  }

  private maskSensitiveText(value: string, token?: string) {
    const masked = value.replace(
      /(https?:\/\/)([^@\s/]+)@/g,
      `$1${MASKED_CREDENTIAL}@`,
    );
    return token ? masked.replaceAll(token, MASKED_CREDENTIAL) : masked;
  }

  private buildCredentialPaths(
    integration: Integration,
    sourceUrl: string,
    token: string,
  ) {
    try {
      const variants =
        integration.type === 'gitlab'
          ? this.buildGitLabCredentialPaths(
              sourceUrl,
              token,
              integration.credentials,
            )
          : this.buildGithubCredentialPaths(
              sourceUrl,
              token,
              integration.credentials,
            );
      return Array.from(new Set(variants.filter(Boolean)));
    } catch {
      return [sourceUrl];
    }
  }

  private buildGithubCredentialPaths(
    sourceUrl: string,
    token: string,
    credentials: Record<string, unknown>,
  ) {
    const primaryPath = this.withCredential(sourceUrl, token);
    if (this.isPublicGithubHost(sourceUrl)) {
      return [primaryPath];
    }

    return [
      ...this.buildGitLabCredentialPaths(sourceUrl, token, credentials),
      primaryPath,
    ];
  }

  private buildGitLabCredentialPaths(
    sourceUrl: string,
    token: string,
    credentials: Record<string, unknown>,
  ) {
    const usernames = GITLAB_USERNAME_KEYS.map(
      (key) => credentials?.[key],
    ).filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    return [
      this.withCredential(sourceUrl, GITLAB_TOKEN_USERNAME, token, 'http:'),
      ...usernames.map((username) =>
        this.withCredential(sourceUrl, username, token, 'http:'),
      ),
      this.withCredential(sourceUrl, GITLAB_TOKEN_USERNAME, token),
      ...usernames.map((username) =>
        this.withCredential(sourceUrl, username, token),
      ),
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
