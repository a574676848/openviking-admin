import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { KNOWLEDGE_NODE_KINDS } from '../constants';
import type { KnowledgeNodeKind } from '../domain/knowledge-node.model';

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

  @IsOptional()
  @IsIn(KNOWLEDGE_NODE_KINDS)
  kind?: KnowledgeNodeKind;
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
