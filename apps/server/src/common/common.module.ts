import { Module, Global } from '@nestjs/common';
import { OVClientService } from './ov-client.service';
import { DynamicDataSourceService } from './dynamic-datasource.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [OVClientService, DynamicDataSourceService, EncryptionService],
  exports: [OVClientService, DynamicDataSourceService, EncryptionService],
})
export class CommonModule {}
