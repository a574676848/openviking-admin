import type {
  CapabilityContract,
  CapabilityId,
} from '../domain/capability.types';
import type { KnowledgeCapabilityGateway } from '../infrastructure/knowledge-capability.gateway';

type GatewayHandlerName = keyof Pick<
  KnowledgeCapabilityGateway,
  'search' | 'grep' | 'listResources' | 'treeResources'
>;

interface CapabilityRegistryEntry {
  contract: CapabilityContract;
  gatewayHandler: GatewayHandlerName;
}

export const capabilityRegistry: Record<CapabilityId, CapabilityRegistryEntry> = {
  'knowledge.search': {
    gatewayHandler: 'search',
    contract: {
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
      http: { method: 'POST', path: '/api/v1/knowledge/search' },
      cli: { command: 'ova knowledge search' },
    },
  },
  'knowledge.grep': {
    gatewayHandler: 'grep',
    contract: {
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
      http: { method: 'POST', path: '/api/v1/knowledge/grep' },
      cli: { command: 'ova knowledge grep' },
    },
  },
  'resources.list': {
    gatewayHandler: 'listResources',
    contract: {
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
      http: { method: 'GET', path: '/api/v1/resources' },
      cli: { command: 'ova resources list' },
    },
  },
  'resources.tree': {
    gatewayHandler: 'treeResources',
    contract: {
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
      http: { method: 'GET', path: '/api/v1/resources/tree' },
      cli: { command: 'ova resources tree' },
    },
  },
};

export function getCapabilityContracts(): CapabilityContract[] {
  return Object.values(capabilityRegistry).map((entry) => entry.contract);
}

export function getCapabilityRegistryEntry(id: CapabilityId) {
  return capabilityRegistry[id];
}
