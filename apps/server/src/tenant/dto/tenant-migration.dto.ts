import { IsString } from 'class-validator';

export class TenantMigrationRequestDto {
  @IsString()
  tenantId: string;
}
