import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { UserMcpKey } from './entities/user-mcp-key.entity';
import { McpSession } from './entities/mcp-session.entity';
import { McpSessionEvent } from './entities/mcp-session-event.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemConfig } from '../settings/entities/system-config.entity';
import { MCP_KEY_REPOSITORY } from './domain/repositories/mcp-key.repository.interface';
import { TypeOrmMcpKeyRepository } from './infrastructure/repositories/mcp-key.repository';
import { McpSessionService } from './mcp-session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserMcpKey,
      McpSession,
      McpSessionEvent,
      Tenant,
      SystemConfig,
    ]),
  ],
  controllers: [McpController],
  providers: [
    McpService,
    McpSessionService,
    {
      provide: MCP_KEY_REPOSITORY,
      useClass: TypeOrmMcpKeyRepository,
    },
  ],
  exports: [McpService, McpSessionService],
})
export class McpModule {}
