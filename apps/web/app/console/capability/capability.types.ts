export interface CapabilityKey {
  id: string;
  name: string;
  apiKey: string;
  userId: string;
  lastUsedAt: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface TenantUserOption {
  id: string;
  username: string;
  role: string;
  active: boolean;
}

export interface CreateCapabilityKeyResult {
  apiKey: string;
  expiresAt?: string | null;
}

export interface IssuedCredential {
  credentialType: string;
  accessToken?: string;
  sessionKey?: string;
  apiKey?: string;
  expiresInSeconds?: number | null;
  expiresAt?: string | null;
}

export interface CredentialTtlOption {
  label: string;
  value: number | null;
  default?: boolean;
}

export interface CredentialOption {
  channel: string;
  credentialType: string;
  issueEndpoint: string;
  ttlSeconds: number | null;
  ttlOptions: CredentialTtlOption[];
  recommendedFor: string[];
}

export interface CredentialOptionsResponse {
  capabilities: CredentialOption[];
}

export interface ConnectionDiagnostic {
  status: "idle" | "testing" | "success" | "error";
  title: string;
  description: string;
  checkedAt: string | null;
}
