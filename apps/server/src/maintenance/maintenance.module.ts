import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CommonModule } from '../common/common.module';
import { DocumentModule } from '../document/document.module';
import { ImportTaskModule } from '../import-task/import-task.module';
import { McpSession } from '../mcp/entities/mcp-session.entity';
import { McpSessionEvent } from '../mcp/entities/mcp-session-event.entity';
import { McpModule } from '../mcp/mcp.module';
import { SearchLog } from '../search/entities/search-log.entity';
import { TenantModule } from '../tenant/tenant.module';
import { ResourceRetentionService } from './resource-retention.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SearchLog,
      AuditLog,
      McpSession,
      McpSessionEvent,
    ]),
    CommonModule,
    DocumentModule,
    ImportTaskModule,
    McpModule,
    TenantModule,
  ],
  providers: [ResourceRetentionService],
  exports: [ResourceRetentionService],
})
export class MaintenanceModule {}
