import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EncryptionService } from '../common/encryption.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { buildTenantIdentityWhere } from '../tenant/tenant-identity.util';
import { SystemConfig } from './entities/system-config.entity';

export interface ResolvedOVConfig {
  baseUrl: string | null;
  apiKey: string | null;
  account: string | null;
  user: string | null;
  rerankEndpoint: string | null;
  rerankApiKey: string | null;
  rerankModel: string | null;
}

const DEFAULT_OV_CONFIG_KEY = 'DEFAULT_OV_CONFIG';
const DEFAULT_OV_ACCOUNT = 'default';
const LEGACY_OV_CONFIG_KEYS = {
  baseUrl: 'ov.base_url',
  apiKey: 'ov.api_key',
  account: 'ov.account',
  user: 'ov.user',
  rerankEndpoint: 'rerank.endpoint',
  rerankApiKey: 'rerank.api_key',
  rerankModel: 'rerank.model',
} as const;

@Injectable()
export class OvConfigResolverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  async resolve(tenantId?: string | null): Promise<ResolvedOVConfig> {
    const global = await this.resolveDefaultOVConfig();

    if (!tenantId) return global;

    const tenant = await this.dataSource.getRepository(Tenant).findOne({
      where: buildTenantIdentityWhere(tenantId),
    });
    if (!tenant || !tenant.ovConfig) return global;

    return {
      baseUrl: tenant.ovConfig.baseUrl || global.baseUrl,
      apiKey: tenant.ovConfig.apiKey
        ? this.encryptionService.decrypt(tenant.ovConfig.apiKey)
        : global.apiKey,
      account:
        tenant.vikingAccount ||
        tenant.ovConfig.account ||
        global.account ||
        DEFAULT_OV_ACCOUNT,
      user: tenant.ovConfig.user || global.user,
      rerankEndpoint: tenant.ovConfig.rerankEndpoint || global.rerankEndpoint,
      rerankApiKey: tenant.ovConfig.rerankApiKey
        ? this.encryptionService.decrypt(tenant.ovConfig.rerankApiKey)
        : global.rerankApiKey,
      rerankModel: tenant.ovConfig.rerankModel || global.rerankModel,
    };
  }

  private async resolveDefaultOVConfig(): Promise<ResolvedOVConfig> {
    const envConfig = this.resolveEnvOVConfig();
    const legacy = await this.resolveLegacyOVConfig();
    const row = await this.dataSource.getRepository(SystemConfig).findOne({
      where: { key: DEFAULT_OV_CONFIG_KEY },
    });

    if (!row?.value) return this.mergeOVConfig(envConfig, legacy);

    const parsed = this.parseDefaultOVConfig(row.value);
    return this.mergeOVConfig(parsed, envConfig, legacy);
  }

  private resolveEnvOVConfig(): ResolvedOVConfig {
    return {
      baseUrl: this.configService.get<string>('OV_BASE_URL') ?? null,
      apiKey: this.configService.get<string>('OV_API_KEY') ?? null,
      account: this.configService.get<string>('OV_ACCOUNT') ?? null,
      user: this.configService.get<string>('OV_USER') ?? null,
      rerankEndpoint: this.configService.get<string>('RERANK_ENDPOINT') ?? null,
      rerankApiKey: this.configService.get<string>('RERANK_API_KEY') ?? null,
      rerankModel: this.configService.get<string>('RERANK_MODEL') ?? null,
    };
  }

  private async resolveLegacyOVConfig(): Promise<ResolvedOVConfig> {
    return {
      baseUrl: await this.getConfigValue(LEGACY_OV_CONFIG_KEYS.baseUrl),
      apiKey: await this.getConfigValue(LEGACY_OV_CONFIG_KEYS.apiKey),
      account: await this.getConfigValue(LEGACY_OV_CONFIG_KEYS.account),
      user: await this.getConfigValue(LEGACY_OV_CONFIG_KEYS.user),
      rerankEndpoint: await this.getConfigValue(
        LEGACY_OV_CONFIG_KEYS.rerankEndpoint,
      ),
      rerankApiKey: await this.getConfigValue(
        LEGACY_OV_CONFIG_KEYS.rerankApiKey,
      ),
      rerankModel: await this.getConfigValue(LEGACY_OV_CONFIG_KEYS.rerankModel),
    };
  }

  private async getConfigValue(key: string): Promise<string | null> {
    const row = await this.dataSource.getRepository(SystemConfig).findOne({
      where: { key },
    });
    return row?.value || null;
  }

  private parseDefaultOVConfig(value: string): Partial<ResolvedOVConfig> {
    try {
      return JSON.parse(
        this.encryptionService.decrypt(value),
      ) as Partial<ResolvedOVConfig>;
    } catch {
      return {};
    }
  }

  private mergeOVConfig(
    ...configs: Array<Partial<ResolvedOVConfig>>
  ): ResolvedOVConfig {
    return {
      baseUrl: configs.find((config) => config.baseUrl)?.baseUrl ?? null,
      apiKey: configs.find((config) => config.apiKey)?.apiKey ?? null,
      account:
        configs.find((config) => config.account)?.account ?? DEFAULT_OV_ACCOUNT,
      user: configs.find((config) => config.user)?.user ?? null,
      rerankEndpoint:
        configs.find((config) => config.rerankEndpoint)?.rerankEndpoint ?? null,
      rerankApiKey:
        configs.find((config) => config.rerankApiKey)?.rerankApiKey ?? null,
      rerankModel:
        configs.find((config) => config.rerankModel)?.rerankModel ?? null,
    };
  }
}
