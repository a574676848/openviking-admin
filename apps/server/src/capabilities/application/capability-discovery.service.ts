import { Injectable } from '@nestjs/common';
import { CapabilityCatalogService } from './capability-catalog.service';
import { CapabilityId, Principal } from '../domain/capability.types';

@Injectable()
export class CapabilityDiscoveryService {
  constructor(
    private readonly capabilityCatalogService: CapabilityCatalogService,
  ) {}

  listCapabilities(principal?: Principal) {
    if (!principal) {
      return this.capabilityCatalogService.listCapabilities();
    }

    return this.capabilityCatalogService.listCapabilitiesForPrincipal(principal);
  }

  getCapability(id: CapabilityId) {
    return this.capabilityCatalogService.getCapability(id);
  }
}
