import type { TenantIsolationLevel } from '../../common/constants/system.enum';

export interface TenantDbConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

export interface TenantOvConfig {
  baseUrl?: string;
  apiKey?: string;
  account?: string;
  rerankEndpoint?: string;
  rerankApiKey?: string;
  rerankModel?: string;
}

export interface TenantModel {
  id: string;
  tenantId: string;
  displayName: string;
  status: string;
  isolationLevel: TenantIsolationLevel;
  dbConfig: TenantDbConfig | null;
  vikingAccount: string | null;
  quota: Record<string, unknown> | null;
  ovConfig: TenantOvConfig | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
