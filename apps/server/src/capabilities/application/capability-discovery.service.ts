import { Injectable } from '@nestjs/common';
import { CapabilityCatalogService } from './capability-catalog.service';
import { CapabilityId } from '../domain/capability.types';

@Injectable()
export class CapabilityDiscoveryService {
  constructor(
    private readonly capabilityCatalogService: CapabilityCatalogService,
  ) {}

  listCapabilities() {
    return this.capabilityCatalogService.listCapabilities();
  }

  getCapability(id: CapabilityId) {
    return this.capabilityCatalogService.getCapability(id);
  }
}
