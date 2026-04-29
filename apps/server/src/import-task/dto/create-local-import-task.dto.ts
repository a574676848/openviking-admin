import { IsOptional, IsString } from 'class-validator';

export class CreateLocalImportTaskDto {
  @IsString()
  kbId: string;

  @IsString()
  @IsOptional()
  targetUri?: string;
}
