import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { McpController } from './mcp.controller';
import { McpProtocolService } from './mcp-protocol.service';
import { McpSseService } from './mcp-sse.service';
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
  providers: [McpService, McpSessionService, McpProtocolService, McpSseService],
  exports: [McpService, McpSessionService, McpProtocolService, McpSseService],
})
export class McpModule {}
