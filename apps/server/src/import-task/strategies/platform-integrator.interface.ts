import { Integration } from '../../tenant/entities/integration.entity';

export interface PlatformInjectConfig {
  path: string;
  config: Record<string, any>;
}

export interface IPlatformIntegrator {
  /** 是否支持该类型 */
  supports(type: string): boolean;

  /** 获取注入所需的配置（含 Token 等） */
  resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig>;
}
