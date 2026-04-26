import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';
import type { KnowledgeBaseStatus } from '../domain/knowledge-base.model';

export class UpdateKnowledgeBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'building', 'archived'])
  status?: KnowledgeBaseStatus;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}
