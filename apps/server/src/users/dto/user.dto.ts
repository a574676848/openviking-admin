import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsIn(['super_admin', 'tenant_admin', 'tenant_operator', 'tenant_viewer'])
  role: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['super_admin', 'tenant_admin', 'tenant_operator', 'tenant_viewer'])
  role?: string;

  @IsOptional()
  active?: boolean;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
