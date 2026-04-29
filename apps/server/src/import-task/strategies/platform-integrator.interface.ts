import { Integration } from '../../tenant/entities/integration.entity';

export interface PlatformTempFile {
  fileName: string;
  buffer: Buffer;
  mimeType: string | null;
}

export interface PlatformInjectConfig {
  path?: string;
  fallbackPaths?: string[];
  tempFile?: PlatformTempFile;
}

export interface IPlatformIntegrator {
  /** 是否支持该类型 */
  supports(type: string): boolean;

  /** 解析平台资源为 OpenViking 支持的 path 或临时文件 */
  resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig>;
}
