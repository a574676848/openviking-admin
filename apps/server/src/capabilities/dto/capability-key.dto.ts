import { IsString, IsNotEmpty, MaxLength, ValidateIf, IsIn } from 'class-validator';
import { CREDENTIAL_TTL_POLICIES } from '../domain/credential-ttl.policy';

const API_KEY_TTL_VALUES = CREDENTIAL_TTL_POLICIES.api_key.options
  .map((option) => option.value)
  .filter((value): value is number => value !== null);

export class CreateCapabilityKeyDto {
  @IsString()
  @IsNotEmpty({ message: '用户不能为空' })
  userId: string;

  @IsString()
  @IsNotEmpty({ message: 'Key 名称不能为空' })
  @MaxLength(100, { message: '名称长度不能超过 100 字符' })
  name: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsIn(API_KEY_TTL_VALUES, { message: '不支持的 API Key 有效期' })
  ttlSeconds?: number | null;
}
