import { IsString, IsOptional, MaxLength } from 'class-validator';

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
    rerankModel?: string;
  };
}
