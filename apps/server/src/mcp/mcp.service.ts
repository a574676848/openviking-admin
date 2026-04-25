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

  async createCapabilityKey(userId: string, tenantId: string, name: string) {
    return this.capabilityCredentialService.createApiKey(userId, tenantId, name);
  }

  async getCapabilityKeysByUser(userId: string) {
    return this.capabilityCredentialService.getKeysByUser(userId);
  }

  async deleteCapabilityKey(id: string, userId: string) {
    return this.capabilityCredentialService.deleteKey(id, userId);
  }
}
