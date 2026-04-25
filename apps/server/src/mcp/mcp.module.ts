import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpSession } from './entities/mcp-session.entity';
import { McpSessionEvent } from './entities/mcp-session-event.entity';
import { McpSessionService } from './mcp-session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([McpSession, McpSessionEvent]),
    CapabilitiesModule,
  ],
  controllers: [McpController],
  providers: [McpService, McpSessionService],
  exports: [McpService, McpSessionService],
})
export class McpModule {}
