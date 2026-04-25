import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ISystemConfigRepository } from './domain/repositories/system-config.repository.interface';
import { TENANT_REPOSITORY } from '../tenant/domain/repositories/tenant.repository.interface';
import type { ITenantRepository } from '../tenant/domain/repositories/tenant.repository.interface';
import { AuditService } from '../audit/audit.service';

interface AdminContext {
  id: string;
  username: string;
}

const DEFAULTS: Record<string, { value: string; description: string }> = {
  'search.top_k': { value: '5', description: '默认返回结果数量' },
  'search.score_threshold': {
    value: '0.5',
    description: '语义相似度阈值 (0~1)',
  },
  'search.rerank_enabled': { value: 'false', description: '是否启用重排序' },
  'search.grep_context_lines': {
    value: '2',
    description: 'Grep 前后上下文行数',
  },
  'ov.base_url': {
    value: '',
    description: 'OpenViking 引擎基础地址',
  },
  'ov.api_key': { value: '', description: 'OpenViking 访问令牌 (X-API-KEY)' },
  'ov.account': { value: 'default', description: '默认 OpenViking 业务账号' },
  'rerank.endpoint': {
    value: '',
    description: '重排序模型 API 地址 (可选，留空则跳过 Rerank)',
  },
  'rerank.model': {
    value: 'bge-reranker-v2-m3',
    description: '重排序模型名称',
  },
};

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @Inject(ISystemConfigRepository)
    private readonly repo: ISystemConfigRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
  ) {}

  async resolveOVConfig(tenantId?: string | null) {
    const global = {
      baseUrl: await this.get('ov.base_url'),
      apiKey: await this.get('ov.api_key'),
      account: await this.get('ov.account'),
      rerankEndpoint: await this.get('rerank.endpoint'),
      rerankModel: await this.get('rerank.model'),
    };

    if (!tenantId) return global;

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || !tenant.ovConfig) return global;

    return {
      baseUrl: tenant.ovConfig.baseUrl || global.baseUrl,
      apiKey: tenant.ovConfig.apiKey || global.apiKey,
      account: tenant.ovConfig.account || global.account,
      rerankEndpoint: tenant.ovConfig.rerankEndpoint || global.rerankEndpoint,
      rerankModel: tenant.ovConfig.rerankModel || global.rerankModel,
    };
  }

  async onModuleInit() {
    for (const [key, { value, description }] of Object.entries(DEFAULTS)) {
      const exists = await this.repo.findOne({ where: { key } });
      if (!exists) {
        await this.repo.save({ key, value, description });
      }
    }
  }

  async findAll() {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : (DEFAULTS[key]?.value ?? null);
  }

  async set(key: string, value: string) {
    const row = await this.repo.findOne({ where: { key } });
    if (row) {
      row.value = value;
      return this.repo.save(row);
    }
    return this.repo.save({ key, value });
  }

  async batchSet(updates: Record<string, string>, adminContext?: AdminContext) {
    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      results.push(await this.set(key, value));
    }

    if (adminContext) {
      await this.auditService.log({
        tenantId: undefined,
        userId: adminContext.id,
        username: adminContext.username,
        action: 'settings_change',
        meta: { updates },
      });
    }

    return results;
  }
}
