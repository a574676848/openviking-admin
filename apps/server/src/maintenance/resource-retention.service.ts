import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { LocalImportStorageService } from '../import-task/local-import-storage.service';
import { McpSession } from '../mcp/entities/mcp-session.entity';
import { McpSessionEvent } from '../mcp/entities/mcp-session-event.entity';
import { McpSessionService } from '../mcp/mcp-session.service';
import { SearchLog } from '../search/entities/search-log.entity';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { DocumentDraftRepository } from '../document/document-draft.repository';

const RETENTION_ENV = {
  CLEANUP_INTERVAL_MS: 'RESOURCE_RETENTION_CLEANUP_INTERVAL_MS',
  SEARCH_LOG_DAYS: 'SEARCH_LOG_RETENTION_DAYS',
  AUDIT_LOG_DAYS: 'AUDIT_LOG_RETENTION_DAYS',
  MCP_SESSION_DAYS: 'MCP_SESSION_RETENTION_DAYS',
  LOCAL_IMPORT_DAYS: 'LOCAL_IMPORT_RETENTION_DAYS',
  DATASOURCE_IDLE_MS: 'DYNAMIC_DATASOURCE_IDLE_TTL_MS',
} as const;

const DEFAULT_RETENTION = {
  CLEANUP_INTERVAL_MS: 6 * 60 * 60_000,
  SEARCH_LOG_DAYS: 90,
  AUDIT_LOG_DAYS: 180,
  MCP_SESSION_DAYS: 7,
  LOCAL_IMPORT_DAYS: 7,
  DATASOURCE_IDLE_MS: 30 * 60_000,
} as const;

const MS_PER_DAY = 24 * 60 * 60_000;

@Injectable()
export class ResourceRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceRetentionService.name);
  private cleanupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SearchLog)
    private readonly searchLogRepo: Repository<SearchLog>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(McpSession)
    private readonly mcpSessionRepo: Repository<McpSession>,
    @InjectRepository(McpSessionEvent)
    private readonly mcpSessionEventRepo: Repository<McpSessionEvent>,
    private readonly mcpSessionService: McpSessionService,
    private readonly localImportStorage: LocalImportStorageService,
    private readonly dynamicDataSourceService: DynamicDataSourceService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly documentDraftRepository: DocumentDraftRepository,
  ) {}

  onModuleInit() {
    this.runCleanupSafely();
    this.cleanupTimer = setInterval(
      () => this.runCleanupSafely(),
      this.resolveNumber(
        RETENTION_ENV.CLEANUP_INTERVAL_MS,
        DEFAULT_RETENTION.CLEANUP_INTERVAL_MS,
      ),
    );
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  runCleanupSafely() {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.cleanup()
      .catch((error) => {
        this.logger.warn(`资源保留期清理失败: ${this.formatError(error)}`);
      })
      .finally(() => {
        this.running = false;
      });
  }

  async cleanup() {
    const now = Date.now();
    await this.mcpSessionService.cleanupExpiredRecords();
    const [searchLogs, auditLogs, mcpEvents, mcpSessions, localFiles] =
      await Promise.all([
        this.deleteOlderThan(
          this.searchLogRepo,
          this.resolveDays(
            RETENTION_ENV.SEARCH_LOG_DAYS,
            DEFAULT_RETENTION.SEARCH_LOG_DAYS,
          ),
          now,
        ),
        this.deleteOlderThan(
          this.auditLogRepo,
          this.resolveDays(
            RETENTION_ENV.AUDIT_LOG_DAYS,
            DEFAULT_RETENTION.AUDIT_LOG_DAYS,
          ),
          now,
        ),
        this.deleteOlderThan(
          this.mcpSessionEventRepo,
          this.resolveDays(
            RETENTION_ENV.MCP_SESSION_DAYS,
            DEFAULT_RETENTION.MCP_SESSION_DAYS,
          ),
          now,
        ),
        this.deleteOlderThan(
          this.mcpSessionRepo,
          this.resolveDays(
            RETENTION_ENV.MCP_SESSION_DAYS,
            DEFAULT_RETENTION.MCP_SESSION_DAYS,
          ),
          now,
        ),
        this.localImportStorage.cleanupExpiredManagedFiles(
          this.resolveDays(
            RETENTION_ENV.LOCAL_IMPORT_DAYS,
            DEFAULT_RETENTION.LOCAL_IMPORT_DAYS,
          ) * MS_PER_DAY,
        ),
      ]);
    const evictedDataSources =
      await this.dynamicDataSourceService.evictIdleTenants(
        this.resolveNumber(
          RETENTION_ENV.DATASOURCE_IDLE_MS,
          DEFAULT_RETENTION.DATASOURCE_IDLE_MS,
        ),
      );
    const expiredTenantCaches = this.tenantCacheService.cleanupExpired(now);
    const orphanDrafts = await this.documentDraftRepository
      .deleteOrphanDrafts(null)
      .catch((err) => {
        this.logger.warn(`孤儿草稿清理失败: ${this.formatError(err)}`);
        return 0;
      });

    this.logger.log(
      `资源保留期清理完成: search_logs=${searchLogs}, audit_logs=${auditLogs}, mcp_events=${mcpEvents}, mcp_sessions=${mcpSessions}, local_files=${localFiles.deletedFiles}, local_dirs=${localFiles.deletedDirectories}, evicted_datasources=${evictedDataSources}, tenant_cache=${expiredTenantCaches}, orphan_drafts=${orphanDrafts}`,
    );
  }

  private async deleteOlderThan<T extends { createdAt: Date }>(
    repo: Repository<T>,
    retentionDays: number,
    now: number,
  ) {
    if (retentionDays <= 0) {
      return 0;
    }
    const result = await repo.delete({
      createdAt: LessThan(new Date(now - retentionDays * MS_PER_DAY)),
    } as never);
    return result.affected ?? 0;
  }

  private resolveDays(key: string, fallback: number) {
    return this.resolveNumber(key, fallback);
  }

  private resolveNumber(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
