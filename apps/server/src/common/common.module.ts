import { Module, Global } from '@nestjs/common';
import { OVClientService } from './ov-client.service';
import { OVKnowledgeGatewayService } from './ov-knowledge-gateway.service';
import { DynamicDataSourceService } from './dynamic-datasource.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [
    OVClientService,
    OVKnowledgeGatewayService,
    DynamicDataSourceService,
    EncryptionService,
  ],
  exports: [
    OVClientService,
    OVKnowledgeGatewayService,
    DynamicDataSourceService,
    EncryptionService,
  ],
})
export class CommonModule {}
