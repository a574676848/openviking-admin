import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class FindDto {
  @IsString()
  query: string;

  @IsString()
  @IsOptional()
  uri?: string;

  @IsNumber()
  @IsOptional()
  topK?: number;

  @IsNumber()
  @IsOptional()
  scoreThreshold?: number;

  @IsBoolean()
  @IsOptional()
  useRerank?: boolean;
}

export class GrepDto {
  @IsString()
  pattern: string;

  @IsString()
  uri: string;
}

export class FeedbackDto {
  @IsString()
  feedback: string;

  @IsString()
  @IsOptional()
  note?: string;
}
