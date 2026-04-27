import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TenantStatus } from '../../common/constants/system.enum';

export class CreateTenantDto {
  @IsString()
  @MaxLength(64)
  tenantId: string;

  @IsString()
  @MaxLength(128)
  displayName: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  isolationLevel?: string;

  @IsOptional()
  dbConfig?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };

  @IsOptional()
  @IsString()
  @MaxLength(128)
  vikingAccount?: string;

  @IsOptional()
  quota?: Record<string, any>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  ovConfig?: {
    baseUrl?: string;
    apiKey?: string;
    account?: string;
    rerankEndpoint?: string;
    rerankApiKey?: string;
    rerankModel?: string;
  };
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  dbConfig?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };

  @IsOptional()
  @IsString()
  @MaxLength(128)
  vikingAccount?: string;

  @IsOptional()
  quota?: Record<string, any>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  ovConfig?: {
    baseUrl?: string;
    apiKey?: string;
    account?: string;
    rerankEndpoint?: string;
    rerankApiKey?: string;
    rerankModel?: string;
  };
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status: TenantStatus;
}
