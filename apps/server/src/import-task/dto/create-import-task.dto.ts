import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';

export class CreateImportTaskDto {
  @IsString()
  kbId: string;

  @IsEnum(['git', 'webdav', 'local', 'url', 'feishu', 'dingtalk'])
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
  targetUri: string;

  @IsString()
  @IsOptional()
  integrationId?: string;
}
