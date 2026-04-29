import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { ISystemConfigRepository } from './domain/repositories/system-config.repository.interface';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption.service';
import { OVClientService } from '../common/ov-client.service';
import { OvConfigResolverService } from './ov-config-resolver.service';

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
  'ov.user': { value: '', description: '默认 OpenViking 用户标识' },
  'rerank.endpoint': {
    value: '',
    description: '推荐填写完整 Rerank 地址，例如 http://host:port/v1/rerank',
  },
  'rerank.api_key': {
    value: '',
    description: 'OpenAI 兼容 Rerank 访问令牌 (Bearer Token)',
  },
  'rerank.model': {
    value: 'bge-reranker-v2-m3',
    description: '重排序模型名称',
  },
  DEFAULT_OV_CONFIG: {
    value: '{}',
    description: '默认 OpenViking 连接配置 JSON',
  },
};

interface TestConnectionInput {
  type: 'engine' | 'rerank';
  baseUrl?: string;
  apiKey?: string;
  account?: string;
  endpoint?: string;
  model?: string;
}

interface TestConnectionResult {
  ok: true;
  type: 'engine' | 'rerank';
  message: string;
  target: string;
}

const DEFAULT_OV_CONFIG_KEY = 'DEFAULT_OV_CONFIG';
const OV_HEALTH_PATH = '/health';
const RERANK_CANDIDATE_PATHS = [
  '/v1/rerank',
  '/v1/reranks',
  '/rerank',
  '/reranks',
];
const RERANK_TEST_QUERY = '连通性测试';
const RERANK_TEST_DOCUMENTS = ['这是一次 Rerank 连通性探测请求。'];
const RERANK_TEST_SERVICE_LABEL = 'Rerank Test';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @Inject(ISystemConfigRepository)
    private readonly repo: ISystemConfigRepository,
    private readonly auditService: AuditService,
    private readonly encryptionService: EncryptionService,
    private readonly ovClient: OVClientService,
    private readonly ovConfigResolver: OvConfigResolverService,
  ) {}

  async testConnection(
    input: TestConnectionInput,
  ): Promise<TestConnectionResult> {
    if (input.type === 'engine') {
      return this.testEngineConnection(input);
    }

    if (input.type === 'rerank') {
      return this.testRerankConnection(input);
    }

    throw new BadRequestException('不支持的连接测试类型');
  }

  async resolveOVConfig(tenantId?: string | null) {
    return this.ovConfigResolver.resolve(tenantId);
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
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    return rows.map((row) => {
      if (row.key === DEFAULT_OV_CONFIG_KEY && row.value) {
        try {
          row.value = this.encryptionService.decrypt(row.value);
        } catch {
          // 解密失败则返回原始值（可能是明文或损坏数据）
        }
      }
      return row;
    });
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
      const finalValue =
        key === DEFAULT_OV_CONFIG_KEY && value
          ? this.encryptionService.encrypt(value)
          : value;
      results.push(await this.set(key, finalValue));
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

  private async testEngineConnection(
    input: TestConnectionInput,
  ): Promise<TestConnectionResult> {
    const baseUrl = input.baseUrl?.trim();
    if (!baseUrl) {
      throw new BadRequestException('请先填写核心引擎地址');
    }

    const health = await this.ovClient.getHealth(baseUrl);
    if (!health) {
      throw new BadGatewayException('核心引擎健康检查失败');
    }

    return {
      ok: true,
      type: 'engine',
      message: '核心引擎连接成功',
      target: `${baseUrl}${OV_HEALTH_PATH}`,
    };
  }

  private async testRerankConnection(
    input: TestConnectionInput,
  ): Promise<TestConnectionResult> {
    const endpoint = input.endpoint?.trim();
    if (!endpoint) {
      throw new BadRequestException('请先填写 Rerank 接口地址');
    }

    const model = input.model?.trim();
    if (!model) {
      throw new BadRequestException('请先填写 Rerank 模型名');
    }

    const headers = input.apiKey?.trim()
      ? { Authorization: `Bearer ${input.apiKey.trim()}` }
      : undefined;
    const target = await this.resolveReachableRerankTarget(
      endpoint,
      headers,
      model,
    );

    return {
      ok: true,
      type: 'rerank',
      message: 'Rerank 接口连接成功',
      target,
    };
  }

  private async resolveReachableRerankTarget(
    endpoint: string,
    headers: Record<string, string> | undefined,
    model: string,
  ) {
    const targets = this.buildRerankTargets(endpoint);
    let lastError: unknown;

    for (const target of targets) {
      try {
        await this.ovClient.requestExternal(
          target,
          'POST',
          {
            model,
            query: RERANK_TEST_QUERY,
            documents: RERANK_TEST_DOCUMENTS,
          },
          undefined,
          {
            headers,
            serviceLabel: RERANK_TEST_SERVICE_LABEL,
          },
        );
        return target;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private buildRerankTargets(endpoint: string) {
    const normalized = endpoint.trim().replace(/\/+$/, '');
    if (normalized.endsWith('/rerank') || normalized.endsWith('/reranks')) {
      return [normalized];
    }

    if (normalized.endsWith('/v1')) {
      return [`${normalized}/rerank`, `${normalized}/reranks`];
    }

    return RERANK_CANDIDATE_PATHS.map((suffix) => `${normalized}${suffix}`);
  }
}
