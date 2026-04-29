import { OvConfigResolverService } from './ov-config-resolver.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemConfig } from './entities/system-config.entity';

describe('OvConfigResolverService', () => {
  function createResolver(options: {
    rows?: Map<string, string>;
    tenant?: Partial<Tenant> | null;
    env?: Record<string, string | undefined>;
    decrypt?: (value: string) => string;
  }) {
    const rows = options.rows ?? new Map<string, string>();
    const systemConfigRepo = {
      findOne: jest.fn(({ where }: { where: { key: string } }) => {
        const value = rows.get(where.key);
        return Promise.resolve(
          value ? ({ key: where.key, value } as SystemConfig) : null,
        );
      }),
    };
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(options.tenant ?? null),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === SystemConfig) return systemConfigRepo;
        if (entity === Tenant) return tenantRepo;
        throw new Error('unexpected repository');
      }),
    };
    const encryptionService = {
      decrypt: jest.fn(options.decrypt ?? ((value: string) => value)),
    };
    const configService = {
      get: jest.fn((key: string) => options.env?.[key]),
    };

    return {
      resolver: new OvConfigResolverService(
        dataSource as never,
        encryptionService as never,
        configService as never,
      ),
      tenantRepo,
      encryptionService,
    };
  }

  it('应使用默认配置行、环境变量和旧配置行解析全局 OV 配置', async () => {
    const rows = new Map<string, string>([
      ['DEFAULT_OV_CONFIG', 'encrypted-default'],
      ['ov.api_key', 'legacy-key'],
      ['rerank.model', 'legacy-rerank'],
    ]);
    const { resolver } = createResolver({
      rows,
      env: {
        OV_BASE_URL: 'http://ov.env',
        OV_ACCOUNT: 'env-account',
      },
      decrypt: (value) =>
        value === 'encrypted-default'
          ? JSON.stringify({ baseUrl: 'http://ov.default' })
          : value,
    });

    await expect(resolver.resolve()).resolves.toEqual({
      baseUrl: 'http://ov.default',
      apiKey: 'legacy-key',
      account: 'env-account',
      user: null,
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: 'legacy-rerank',
    });
  });

  it('应使用租户 OV 配置覆盖全局配置并解密敏感字段', async () => {
    const { resolver, tenantRepo, encryptionService } = createResolver({
      env: {
        OV_BASE_URL: 'http://ov.env',
        OV_API_KEY: 'env-key',
        OV_ACCOUNT: 'env-account',
        OV_USER: 'env-user',
      },
      tenant: {
        id: 'tenant-record',
        tenantId: 'test3',
        vikingAccount: 'test3-account',
        ovConfig: {
          apiKey: 'encrypted-tenant-key',
          rerankApiKey: 'encrypted-rerank-key',
          rerankEndpoint: 'http://rerank.local/v1',
        },
      } as Tenant,
      decrypt: (value) => `plain-${value}`,
    });

    await expect(resolver.resolve('test3')).resolves.toEqual({
      baseUrl: 'http://ov.env',
      apiKey: 'plain-encrypted-tenant-key',
      account: 'test3-account',
      user: 'env-user',
      rerankEndpoint: 'http://rerank.local/v1',
      rerankApiKey: 'plain-encrypted-rerank-key',
      rerankModel: null,
    });
    expect(tenantRepo.findOne).toHaveBeenCalledWith({
      where: [{ tenantId: 'test3' }],
    });
    expect(encryptionService.decrypt).toHaveBeenCalledWith(
      'encrypted-tenant-key',
    );
  });
});
