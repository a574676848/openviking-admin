import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';

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
  status?: string;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}
