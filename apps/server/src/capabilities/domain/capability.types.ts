export type CapabilityId =
  | 'knowledge.search'
  | 'knowledge.grep'
  | 'resources.list'
  | 'resources.tree';

export type CapabilityVersion = 'v1';

export type CapabilityChannel = 'http' | 'mcp' | 'cli' | 'skill';

export type CredentialType =
  | 'jwt_access_token'
  | 'capability_access_token'
  | 'session_key'
  | 'api_key'
  | 'scoped_api_key'
  | 'client_credentials';

export type ClientType = 'human' | 'cli' | 'mcp' | 'skill' | 'service';

export type CapabilityRoleRequirement =
  | 'tenant_viewer'
  | 'tenant_operator'
  | 'tenant_admin';

export type CapabilityErrorCode =
  | 'CAPABILITY_NOT_FOUND'
  | 'CAPABILITY_FORBIDDEN'
  | 'CAPABILITY_UNAUTHORIZED'
  | 'CAPABILITY_INVALID_INPUT'
  | 'CAPABILITY_RATE_LIMITED'
  | 'CAPABILITY_DOWNSTREAM_ERROR'
  | 'CAPABILITY_EXECUTION_FAILED'
  | 'CAPABILITY_TENANT_REQUIRED';

export interface CapabilityContract {
  id: CapabilityId;
  version: CapabilityVersion;
  displayName: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  outputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
  };
  permissionRequirement: 'tenant';
  minimumRole?: CapabilityRoleRequirement;
  auditLevel: 'standard';
  http: {
    method: 'GET' | 'POST';
    path: string;
  };
  cli: {
    command: string;
  };
}

export interface OVConfigProfile {
  baseUrl: string;
  apiKey: string;
  account: string;
}

export interface Principal {
  userId: string;
  username?: string;
  tenantId: string | null;
  role?: string;
  scope: string;
  credentialType: CredentialType;
  clientType: ClientType;
  ovConfig: OVConfigProfile;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  requestId: string;
  tenantId: string | null;
  userId: string;
  channel: CapabilityChannel;
  clientType: ClientType;
  credentialType: CredentialType;
  capability: CapabilityId;
}

export interface CapabilityContext {
  principal: Principal;
  trace: TraceContext;
}

export interface CapabilityInvocationMeta {
  capability: CapabilityId;
  channel: CapabilityChannel;
  version: CapabilityVersion;
  durationMs: number;
}

export interface CapabilityInvocationResult<T = Record<string, unknown>> {
  data: T;
  meta: CapabilityInvocationMeta;
  traceId: string;
  error: null;
}
