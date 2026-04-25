import { randomBytes } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemConfig } from '../settings/entities/system-config.entity';
import { EncryptionService } from '../common/encryption.service';
import {
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';
import { MCP_KEY_REPOSITORY } from './domain/repositories/mcp-key.repository.interface';
import type { IMcpKeyRepository } from './domain/repositories/mcp-key.repository.interface';

interface OVConfig {
  baseUrl: string;
  apiKey: string;
  account: string;
  rerankEndpoint?: string;
  rerankModel?: string;
}

interface SearchArgs {
  query: string;
  limit?: number;
  score_threshold?: number;
}

interface GrepArgs {
  pattern: string;
  uri?: string;
  case_insensitive?: boolean;
}

interface ResourceArgs {
  uri?: string;
  depth?: number;
}

interface OVResource {
  uri: string;
  score: number;
  abstract?: string;
  content?: string;
  title?: string;
}

interface OVGrepMatch {
  line: number;
  uri: string;
  content: string;
}

interface OVFsNode {
  uri: string;
  isDir: boolean;
  rel_path?: string;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    @Inject(MCP_KEY_REPOSITORY)
    private readonly mcpKeyRepo: IMcpKeyRepository,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    private readonly encryptionService: EncryptionService,
    private readonly ovClient: OVClientService,
  ) {}

  async validateKeyAndGetConfig(apiKey: string) {
    const keyRecord = await this.mcpKeyRepo.findOne({ where: { apiKey } });
    if (!keyRecord) {
      throw new UnauthorizedException('无效的 MCP API Key');
    }

    await this.mcpKeyRepo.update(keyRecord.id, { lastUsedAt: new Date() });

    const tenant = await this.tenantRepo.findOne({
      where: { tenantId: keyRecord.tenantId },
    });

    let ovConfig: OVConfig | null = null;
    if (tenant?.ovConfig?.apiKey) {
      ovConfig = {
        ...tenant.ovConfig,
        apiKey: this.encryptionService.decrypt(tenant.ovConfig.apiKey),
        account: tenant.vikingAccount || tenant.ovConfig.account || 'default',
      } as OVConfig;
    } else {
      const defaultConfig = await this.configRepo.findOne({
        where: { key: 'DEFAULT_OV_CONFIG' },
      });
      if (defaultConfig) {
        try {
          const parsed = JSON.parse(
            this.encryptionService.decrypt(defaultConfig.value),
          ) as OVConfig;
          ovConfig = parsed;
        } catch {
          this.logger.error('Failed to parse default OV config');
        }
      }
    }

    if (!ovConfig?.apiKey || !ovConfig?.baseUrl) {
      throw new NotFoundException('该租户未配置 OpenViking 引擎连接');
    }

    return {
      ovConfig,
      tenantId: keyRecord.tenantId,
      userId: keyRecord.userId,
    };
  }

  async createKey(userId: string, tenantId: string, name: string) {
    const count = await this.mcpKeyRepo.count({ where: { userId } });
    if (count >= 10)
      throw new ForbiddenException('每个用户最多创建 10 个 MCP Key');

    const apiKey = `ov-sk-${randomBytes(24).toString('base64url')}`;

    const key = this.mcpKeyRepo.create({
      name: name || '未命名 Key',
      apiKey,
      userId,
      tenantId,
    });

    return await this.mcpKeyRepo.save(key);
  }

  async getKeysByUser(userId: string) {
    return this.mcpKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteKey(id: string, userId: string) {
    const key = await this.mcpKeyRepo.findOne({ where: { id, userId } });
    if (!key) throw new NotFoundException('Key 不存在或无权操作');
    await this.mcpKeyRepo.remove(key);
    return { success: true };
  }

  async handleToolCall(apiKey: string, name: string, args: unknown) {
    const { ovConfig, tenantId } = await this.validateKeyAndGetConfig(apiKey);

    const connection: OVConnection = {
      baseUrl: ovConfig.baseUrl,
      apiKey: ovConfig.apiKey,
      account: ovConfig.account,
    };

    const tenantScope = `viking://resources/tenants/${tenantId}/`;

    try {
      switch (name) {
        case 'search_knowledge':
          return await this.searchKnowledge(
            connection,
            tenantScope,
            args as SearchArgs,
          );
        case 'grep_knowledge':
          return await this.grepKnowledge(
            connection,
            tenantScope,
            args as GrepArgs,
          );
        case 'list_resources':
          return await this.listResources(
            connection,
            tenantScope,
            args as ResourceArgs,
          );
        case 'tree_resources':
          return await this.treeResources(
            connection,
            tenantScope,
            args as ResourceArgs,
          );
        default:
          throw new Error(`未知工具: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(`MCP Tool Call Error [${name}]: ${message}`);
      return {
        content: [{ type: 'text', text: `调用失败: ${message}` }],
        isError: true,
      };
    }
  }

  private async searchKnowledge(
    conn: OVConnection,
    scope: string,
    args: SearchArgs,
  ) {
    const { query, limit, score_threshold } = args;
    const res = await this.ovClient.request(
      conn,
      '/api/v1/search/find',
      'POST',
      {
        query,
        scope,
        limit: limit ?? 5,
        score_threshold: score_threshold ?? 0.5,
      },
    );

    const result = res.result as { resources: OVResource[] } | undefined;
    if (!result || result.resources.length === 0) {
      return {
        content: [{ type: 'text', text: `未找到与"${query}"相关的知识。` }],
      };
    }

    const lines = result.resources.map((r, i) => {
      return [
        `## ${i + 1}. [score=${r.score.toFixed(3)}]`,
        `**URI**: ${r.uri}`,
        `**摘要**: ${r.abstract || '（无摘要）'}`,
      ].join('\n');
    });

    return {
      content: [
        {
          type: 'text',
          text: `找到 ${result.resources.length} 条结果：\n\n${lines.join('\n\n')}`,
        },
      ],
    };
  }

  private async grepKnowledge(
    conn: OVConnection,
    scope: string,
    args: GrepArgs,
  ) {
    const { pattern, uri, case_insensitive } = args;
    const targetUri = uri && uri.startsWith(scope) ? uri : scope;

    const res = await this.ovClient.request(
      conn,
      '/api/v1/search/grep',
      'POST',
      {
        pattern,
        uri: targetUri,
        case_insensitive: case_insensitive ?? true,
        level_limit: 5,
      },
    );

    const result = res.result as { matches?: OVGrepMatch[] } | undefined;
    const matches: OVGrepMatch[] = result?.matches || [];
    if (matches.length === 0) {
      return {
        content: [{ type: 'text', text: `未找到包含"${pattern}"的内容。` }],
      };
    }

    const lines = matches
      .slice(0, 20)
      .map((m) => `L${m.line} | ${m.uri}\n  > ${m.content.trim()}`);

    return {
      content: [
        {
          type: 'text',
          text: `找到 ${matches.length} 处匹配：\n\n${lines.join('\n\n')}`,
        },
      ],
    };
  }

  private async listResources(
    conn: OVConnection,
    scope: string,
    args: ResourceArgs,
  ) {
    const { uri } = args;
    const targetUri = uri && uri.startsWith(scope) ? uri : scope;
    const encoded = encodeURIComponent(targetUri);
    const res = await this.ovClient.request(
      conn,
      `/api/v1/fs/ls?uri=${encoded}`,
    );

    const nodes: OVFsNode[] = (res.result as OVFsNode[]) || [];
    const lines = nodes.map((n) => {
      const icon = n.isDir ? '[DIR]' : '[FILE]';
      return `${icon} ${n.uri}`;
    });

    return {
      content: [
        {
          type: 'text',
          text: `${targetUri} 下共 ${nodes.length} 个节点：\n\n${lines.join('\n')}`,
        },
      ],
    };
  }

  private async treeResources(
    conn: OVConnection,
    scope: string,
    args: ResourceArgs,
  ) {
    const { uri, depth } = args;
    const targetUri = uri && uri.startsWith(scope) ? uri : scope;
    const encoded = encodeURIComponent(targetUri);
    const res = await this.ovClient.request(
      conn,
      `/api/v1/fs/tree?uri=${encoded}&depth=${depth ?? 2}`,
    );

    const nodes: OVFsNode[] = (res.result as OVFsNode[]) || [];
    const lines = nodes.map((n) => {
      const level = (n.rel_path || '').split('/').length - 1;
      const icon = n.isDir ? '[DIR]' : '[FILE]';
      const name = n.uri.split('/').pop() || n.uri;
      return '  '.repeat(level > 0 ? level : 0) + `${icon} ${name}`;
    });

    return {
      content: [
        { type: 'text', text: `${targetUri} 目录树：\n\n${lines.join('\n')}` },
      ],
    };
  }
}
