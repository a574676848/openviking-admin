import { IsIn, ValidateIf } from 'class-validator';
import { CREDENTIAL_TTL_POLICIES } from '../domain/credential-ttl.policy';

const EXCHANGE_TTL_VALUES = [
  ...new Set(
    [
      ...CREDENTIAL_TTL_POLICIES.capability_access_token.options,
      ...CREDENTIAL_TTL_POLICIES.session_key.options,
    ]
      .map((option) => option.value)
      .filter((value): value is number => value !== null),
  ),
];

export class CredentialTtlDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsIn(EXCHANGE_TTL_VALUES, { message: '不支持的凭证有效期' })
  ttlSeconds?: number | null;
}
