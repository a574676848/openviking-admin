import { Injectable } from '@nestjs/common';
import {
  CapabilityContract,
  CapabilityId,
  Principal,
} from '../domain/capability.types';
import {
  getCapabilityContracts,
  getCapabilityRegistryEntry,
} from './capability-registry';
import { CapabilityAuthorizationService } from './capability-authorization.service';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: CapabilityContract['inputSchema'];
}

@Injectable()
export class CapabilityCatalogService {
  private readonly contracts: CapabilityContract[] = getCapabilityContracts();

  constructor(
    private readonly capabilityAuthorizationService: CapabilityAuthorizationService,
  ) {}

  listCapabilities(): CapabilityContract[] {
    return this.contracts;
  }

  listCapabilitiesForPrincipal(principal: Principal): CapabilityContract[] {
    return this.contracts.filter((contract) =>
      this.capabilityAuthorizationService.canAccess(contract, principal),
    );
  }

  getCapability(id: CapabilityId): CapabilityContract {
    const entry = getCapabilityRegistryEntry(id);
    if (!entry) {
      throw new Error(`未知 capability: ${id}`);
    }

    return entry.contract;
  }

  toMcpTools(): McpToolDefinition[] {
    return this.contracts.map((contract) => ({
      name: contract.id,
      description: contract.description,
      inputSchema: contract.inputSchema,
    }));
  }

  toMcpToolsForPrincipal(principal: Principal): McpToolDefinition[] {
    return this.listCapabilitiesForPrincipal(principal).map((contract) => ({
      name: contract.id,
      description: contract.description,
      inputSchema: contract.inputSchema,
    }));
  }
}
