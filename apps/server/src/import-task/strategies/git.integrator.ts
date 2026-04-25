import { Injectable } from '@nestjs/common';
import {
  IPlatformIntegrator,
  PlatformInjectConfig,
} from './platform-integrator.interface';
import { Integration } from '../../tenant/entities/integration.entity';

@Injectable()
export class GitIntegrator implements IPlatformIntegrator {
  supports(type: string): boolean {
    return ['github', 'gitlab'].includes(type);
  }

  resolveConfig(
    integration: Integration,
    sourceUrl: string,
  ): Promise<PlatformInjectConfig> {
    const token = integration.credentials?.token;
    let finalPath = sourceUrl;

    if (token) {
      try {
        const urlObj = new URL(sourceUrl);
        urlObj.username = token;
        finalPath = urlObj.toString();
      } catch {
        // 非标准 URL 保持原样
      }
    }

    return Promise.resolve({
      path: finalPath,
      config: { source_type: 'git_repo' },
    });
  }
}
