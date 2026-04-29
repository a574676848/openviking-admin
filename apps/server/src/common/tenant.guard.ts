import {
  Injectable,
  CanActivate,
  ExecutionContext,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemRoles } from '../users/entities/user.entity';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { DynamicDataSourceService } from './dynamic-datasource.service';
import { TenantIsolationLevel } from './constants/system.enum';
import type { AuthenticatedRequest } from './authenticated-request.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private defaultDataSource: DataSource,
    private tenantCache: TenantCacheService,
    private dynamicDS: DynamicDataSourceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return false;

    const tenantRecordId =
      user.role === SystemRoles.SUPER_ADMIN ? null : user.tenantId;
    request.tenantScope = null;

    try {
      if (tenantRecordId) {
        const config = await this.tenantCache.getIsolationConfigByTenantRecordId(
          tenantRecordId,
        );
        if (!config) {
          throw new InternalServerErrorException(
            `租户隔离配置不存在：${tenantRecordId}`,
          );
        }

        request.tenantScope = config.tenantId;

        if (config?.level === TenantIsolationLevel.LARGE && config.dbConfig) {
          const tenantDS = await this.dynamicDS.getTenantDataSource(
            config.tenantId,
            config.dbConfig,
          );
          request.tenantDataSource = tenantDS;
          return true;
        }

        if (config.level === TenantIsolationLevel.LARGE) {
          throw new InternalServerErrorException(
            `LARGE 租户缺少独立库配置：${config.tenantId}`,
          );
        }

        if (config.level === TenantIsolationLevel.MEDIUM) {
          const schemaName = `tenant_${config.tenantId.replace(/-/g, '_')}`;
          const queryRunner = this.defaultDataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.query(`SET search_path TO "${schemaName}", public`);
          request.tenantQueryRunner = queryRunner;
        } else {
          const queryRunner = this.defaultDataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.query(`SET search_path TO public`);
          request.tenantQueryRunner = queryRunner;
        }
      } else {
        const queryRunner = this.defaultDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.query(`SET search_path TO public`);
        request.tenantQueryRunner = queryRunner;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      this.logger.error(`Tenant routing fatal error: ${message}`);
      throw err;
    }

    return true;
  }
}
