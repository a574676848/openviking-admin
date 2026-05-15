import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';

export class CreateImportTaskDto {
  @IsString()
  kbId: string;

  @IsEnum(['git', 'local', 'url', 'manifest', 'feishu', 'dingtalk'])
  sourceType: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  sourceName?: string;

  /** 支持批量 URL */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sourceUrls?: string[];

  /** 与 sourceUrls 按下标对应的来源展示名 */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sourceNames?: string[];

  @IsString()
  @IsOptional()
  targetUri?: string;

  @IsString()
  @IsOptional()
  integrationId?: string;
}
