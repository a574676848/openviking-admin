export interface CapabilityKey {
  id: string;
  name: string;
  apiKey: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateCapabilityKeyResult {
  apiKey: string;
}

export interface IssuedCredential {
  credentialType: string;
  accessToken?: string;
  sessionKey?: string;
  apiKey?: string;
  expiresInSeconds?: number | null;
}

export interface CredentialOption {
  channel: string;
  credentialType: string;
  issueEndpoint: string;
  ttlSeconds: number | null;
  recommendedFor: string[];
}

export interface CredentialOptionsResponse {
  data: {
    capabilities: CredentialOption[];
  };
}

export interface ConnectionDiagnostic {
  status: "idle" | "testing" | "success" | "error";
  title: string;
  description: string;
  checkedAt: string | null;
}
