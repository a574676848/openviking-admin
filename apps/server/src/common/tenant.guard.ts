import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SystemRoles } from '../users/entities/user.entity';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { DynamicDataSourceService } from './dynamic-datasource.service';
import { TenantIsolationLevel } from './constants/system.enum';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private defaultDataSource: DataSource,
    private tenantCache: TenantCacheService,
    private dynamicDS: DynamicDataSourceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const tenantId =
      user.role === SystemRoles.SUPER_ADMIN ? null : user.tenantId;
    request.tenantScope = tenantId;

    try {
      if (tenantId) {
        const config = await this.tenantCache.getIsolationConfig(tenantId);

        // 1. LARGE 等级：动态路由到完全独立的外部数据库
        if (config?.level === TenantIsolationLevel.LARGE && config.dbConfig) {
          const tenantDS = await this.dynamicDS.getTenantDataSource(
            tenantId,
            config.dbConfig,
          );
          // 将专属 DataSource 注入 request，供 BaseService/Repository 提取使用
          request.tenantDataSource = tenantDS;
          return true;
        }

        // 2. MEDIUM 等级：动态切换当前主库的 Schema 寻址路径
        if (config?.level === TenantIsolationLevel.MEDIUM) {
          const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
          const queryRunner = this.defaultDataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.query(`SET search_path TO "${schemaName}", public`);
          // 贯穿请求：将带上下文的 queryRunner 挂载到 request
          // 注意：需要在系统级的 Interceptor 或 Middleware 中负责 release
          request.tenantQueryRunner = queryRunner;
        }

        // 3. SMALL 等级：字段隔离，强制使用主库 public schema
        else {
          const queryRunner = this.defaultDataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.query(`SET search_path TO public`);
          request.tenantQueryRunner = queryRunner;
        }
      } else {
        // 超管视角：固定 public
        const queryRunner = this.defaultDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.query(`SET search_path TO public`);
        request.tenantQueryRunner = queryRunner;
      }
    } catch (err) {
      this.logger.error(`Tenant routing fatal error: ${err.message}`);
      return false;
    }

    return true;
  }
}
