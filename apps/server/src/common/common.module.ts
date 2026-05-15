import { Module, Global } from '@nestjs/common';
import { OVClientService } from './ov-client.service';
import { OVKnowledgeGatewayService } from './ov-knowledge-gateway.service';
import { DynamicDataSourceService } from './dynamic-datasource.service';
import { EncryptionService } from './encryption.service';
import { DocumentSessionRegistry } from './document-session-registry';

@Global()
@Module({
  providers: [
    OVClientService,
    OVKnowledgeGatewayService,
    DynamicDataSourceService,
    EncryptionService,
    DocumentSessionRegistry,
  ],
  exports: [
    OVClientService,
    OVKnowledgeGatewayService,
    DynamicDataSourceService,
    EncryptionService,
    DocumentSessionRegistry,
  ],
})
export class CommonModule {}
