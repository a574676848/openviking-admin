import { IsString, IsOptional, IsNumber } from 'class-validator';

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
  parentId?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  vikingUri?: string;
}
