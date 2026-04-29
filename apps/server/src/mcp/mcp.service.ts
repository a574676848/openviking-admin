import { Injectable } from '@nestjs/common';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';

@Injectable()
export class McpService {
  constructor(
    private readonly capabilityCredentialService: CapabilityCredentialService,
  ) {}

  async validateKeyAndGetConfig(apiKey: string) {
    return this.capabilityCredentialService.resolvePrincipalFromApiKey(
      apiKey,
      'mcp',
    );
  }

  async createCapabilityKey(
    userId: string,
    tenantId: string,
    name: string,
    ttlSeconds?: number | null,
  ) {
    return this.capabilityCredentialService.createApiKey(
      userId,
      tenantId,
      name,
      ttlSeconds,
    );
  }

  async getCapabilityKeysByTenant(tenantId: string) {
    return this.capabilityCredentialService.getKeysByTenant(tenantId);
  }

  async deleteCapabilityKey(id: string, tenantId: string) {
    return this.capabilityCredentialService.deleteKey(id, tenantId);
  }
}
