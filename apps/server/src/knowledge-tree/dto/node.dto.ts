import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class KnowledgeAclDto {
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  users?: string[];
}

export class CreateNodeDto {
  @IsString()
  kbId: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}

export class UpdateNodeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  path?: string | null;

  @IsOptional()
  @IsString()
  vikingUri?: string;

  @IsOptional()
  @IsString()
  contentUri?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeAclDto)
  acl?: KnowledgeAclDto;
}
