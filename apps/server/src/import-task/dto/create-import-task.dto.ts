import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';

export class CreateImportTaskDto {
  @IsString()
  kbId: string;

  @IsEnum(['git', 'local', 'url', 'manifest', 'feishu', 'dingtalk'])
  sourceType: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  /** 支持批量 URL */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sourceUrls?: string[];

  @IsString()
  @IsOptional()
  targetUri?: string;

  @IsString()
  @IsOptional()
  integrationId?: string;
}
