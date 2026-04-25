import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';
import type { KbStatus } from '../entities/knowledge-base.entity';

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
  status?: KbStatus;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}
