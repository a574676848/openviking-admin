import { Injectable } from '@nestjs/common';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';

@Injectable()
export class CapabilityKeyService {
  constructor(
    private readonly capabilityCredentialService: CapabilityCredentialService,
  ) {}

  createCapabilityKey(
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

  getCapabilityKeysByTenant(tenantId: string) {
    return this.capabilityCredentialService.getKeysByTenant(tenantId);
  }

  deleteCapabilityKey(id: string, tenantId: string) {
    return this.capabilityCredentialService.deleteKey(id, tenantId);
  }
}
