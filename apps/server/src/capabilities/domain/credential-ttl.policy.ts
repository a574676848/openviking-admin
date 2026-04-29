export type SelectableCredentialType =
  | 'capability_access_token'
  | 'session_key'
  | 'api_key';

export interface CredentialTtlOption {
  label: string;
  value: number | null;
  default?: boolean;
}

interface CredentialTtlPolicy {
  defaultTtlSeconds: number | null;
  options: CredentialTtlOption[];
}

const MINUTES_15 = 15 * 60;
const MINUTES_30 = 30 * 60;
const HOUR_1 = 60 * 60;
const HOURS_2 = 2 * 60 * 60;
const HOURS_8 = 8 * 60 * 60;
const HOURS_24 = 24 * 60 * 60;
const DAYS_7 = 7 * 24 * 60 * 60;
const DAYS_30 = 30 * 24 * 60 * 60;
const DAYS_90 = 90 * 24 * 60 * 60;
const DAYS_180 = 180 * 24 * 60 * 60;

export const CREDENTIAL_TTL_POLICIES: Record<
  SelectableCredentialType,
  CredentialTtlPolicy
> = {
  capability_access_token: {
    defaultTtlSeconds: HOURS_2,
    options: [
      { label: '30 分钟', value: MINUTES_30 },
      { label: '1 小时', value: HOUR_1 },
      { label: '2 小时', value: HOURS_2, default: true },
      { label: '8 小时', value: HOURS_8 },
      { label: '24 小时', value: HOURS_24 },
    ],
  },
  session_key: {
    defaultTtlSeconds: MINUTES_30,
    options: [
      { label: '15 分钟', value: MINUTES_15 },
      { label: '30 分钟', value: MINUTES_30, default: true },
      { label: '1 小时', value: HOUR_1 },
      { label: '8 小时', value: HOURS_8 },
    ],
  },
  api_key: {
    defaultTtlSeconds: DAYS_30,
    options: [
      { label: '7 天', value: DAYS_7 },
      { label: '30 天', value: DAYS_30, default: true },
      { label: '90 天', value: DAYS_90 },
      { label: '180 天', value: DAYS_180 },
      { label: '长期有效', value: null },
    ],
  },
};

export function getCredentialTtlPolicy(
  credentialType: SelectableCredentialType,
): CredentialTtlPolicy {
  return CREDENTIAL_TTL_POLICIES[credentialType];
}

export function resolveCredentialTtlSeconds(
  credentialType: SelectableCredentialType,
  requestedTtlSeconds?: number | null,
): number | null {
  const policy = getCredentialTtlPolicy(credentialType);

  if (requestedTtlSeconds === undefined) {
    return policy.defaultTtlSeconds;
  }

  const matched = policy.options.some(
    (option) => option.value === requestedTtlSeconds,
  );

  if (!matched) {
    throw new Error(`unsupported ttl for ${credentialType}`);
  }

  return requestedTtlSeconds;
}
