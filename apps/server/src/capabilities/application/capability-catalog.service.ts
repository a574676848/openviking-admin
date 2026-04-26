import { Injectable } from '@nestjs/common';
import {
  CapabilityContract,
  CapabilityId,
} from '../domain/capability.types';
import {
  getCapabilityContracts,
  getCapabilityRegistryEntry,
} from './capability-registry';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: CapabilityContract['inputSchema'];
}

@Injectable()
export class CapabilityCatalogService {
  private readonly contracts: CapabilityContract[] = getCapabilityContracts();

  listCapabilities(): CapabilityContract[] {
    return this.contracts;
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
}
