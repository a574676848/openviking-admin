import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateIntegrationDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, string>;
}

export class UpdateIntegrationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
