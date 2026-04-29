import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { McpController } from './mcp.controller';
import { McpProtocolService } from './mcp-protocol.service';
import { McpSseService } from './mcp-sse.service';
import { McpSession } from './entities/mcp-session.entity';
import { McpSessionEvent } from './entities/mcp-session-event.entity';
import { McpSessionService } from './mcp-session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([McpSession, McpSessionEvent]),
    CapabilitiesModule,
  ],
  controllers: [McpController],
  providers: [McpSessionService, McpProtocolService, McpSseService],
  exports: [McpSessionService, McpProtocolService, McpSseService],
})
export class McpModule {}
