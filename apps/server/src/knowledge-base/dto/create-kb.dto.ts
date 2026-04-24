import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateKnowledgeBaseDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}
