import { Injectable } from '@nestjs/common';
import {
  CapabilityContract,
  CapabilityId,
} from '../domain/capability.types';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: CapabilityContract['inputSchema'];
}

@Injectable()
export class CapabilityCatalogService {
  private readonly contracts: CapabilityContract[] = [
    {
      id: 'knowledge.search',
      version: 'v1',
      displayName: 'Knowledge Search',
      description: '在租户知识域内执行语义搜索',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回结果数量' },
          scoreThreshold: { type: 'number', description: '最低分数阈值' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'POST', path: '/api/knowledge/search' },
      cli: { command: 'ova knowledge search' },
    },
    {
      id: 'knowledge.grep',
      version: 'v1',
      displayName: 'Knowledge Grep',
      description: '在租户知识域内执行文本匹配搜索',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '关键词或正则表达式' },
          uri: { type: 'string', description: '限定搜索 URI' },
          caseInsensitive: {
            type: 'boolean',
            description: '是否忽略大小写',
          },
        },
        required: ['pattern'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'POST', path: '/api/knowledge/grep' },
      cli: { command: 'ova knowledge grep' },
    },
    {
      id: 'resources.list',
      version: 'v1',
      displayName: 'Resources List',
      description: '列出租户授权范围内的资源',
      inputSchema: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '资源 URI' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_operator',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/resources' },
      cli: { command: 'ova resources list' },
    },
    {
      id: 'resources.tree',
      version: 'v1',
      displayName: 'Resources Tree',
      description: '获取租户资源树',
      inputSchema: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '根 URI' },
          depth: { type: 'number', description: '树深度' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
          renderedTree: { type: 'string' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_operator',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/resources/tree' },
      cli: { command: 'ova resources tree' },
    },
  ];

  listCapabilities(): CapabilityContract[] {
    return this.contracts;
  }

  getCapability(id: CapabilityId): CapabilityContract {
    const contract = this.contracts.find((item) => item.id === id);
    if (!contract) {
      throw new Error(`未知 capability: ${id}`);
    }

    return contract;
  }

  toMcpTools(): McpToolDefinition[] {
    return this.contracts.map((contract) => ({
      name: contract.id,
      description: contract.description,
      inputSchema: contract.inputSchema,
    }));
  }
}
