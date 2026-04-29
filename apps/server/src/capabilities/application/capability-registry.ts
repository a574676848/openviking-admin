import type {
  CapabilityContract,
  CapabilityId,
} from '../domain/capability.types';
import type { KnowledgeCapabilityGateway } from '../infrastructure/knowledge-capability.gateway';

type GatewayHandlerName = keyof Pick<
  KnowledgeCapabilityGateway,
  | 'search'
  | 'grep'
  | 'listResources'
  | 'treeResources'
  | 'listKnowledgeBases'
  | 'getKnowledgeBaseDetail'
  | 'listKnowledgeTree'
  | 'getKnowledgeTreeDetail'
  | 'createDocumentImport'
  | 'getDocumentImportStatus'
  | 'listDocumentImports'
  | 'cancelDocumentImport'
  | 'retryDocumentImport'
  | 'watchDocumentImportEvents'
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
  'knowledgeBases.list': {
    gatewayHandler: 'listKnowledgeBases',
    contract: {
      id: 'knowledgeBases.list',
      version: 'v1',
      displayName: 'Knowledge Bases List',
      description: '列出当前租户可导入的知识库',
      inputSchema: {
        type: 'object',
        properties: {},
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
      http: { method: 'GET', path: '/api/v1/knowledge-bases' },
      cli: { command: 'ova kb list' },
    },
  },
  'knowledgeBases.detail': {
    gatewayHandler: 'getKnowledgeBaseDetail',
    contract: {
      id: 'knowledgeBases.detail',
      version: 'v1',
      displayName: 'Knowledge Base Detail',
      description: '查看知识库详情与导入目标根路径',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '知识库 ID' },
        },
        required: ['id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/v1/knowledge-bases/:id' },
      cli: { command: 'ova kb detail' },
    },
  },
  'knowledgeTree.list': {
    gatewayHandler: 'listKnowledgeTree',
    contract: {
      id: 'knowledgeTree.list',
      version: 'v1',
      displayName: 'Knowledge Tree List',
      description: '列出知识库下可作为导入目标的知识树节点',
      inputSchema: {
        type: 'object',
        properties: {
          kbId: { type: 'string', description: '知识库 ID' },
        },
        required: ['kbId'],
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
      http: { method: 'GET', path: '/api/v1/knowledge-bases/:id/tree' },
      cli: { command: 'ova tree list' },
    },
  },
  'knowledgeTree.detail': {
    gatewayHandler: 'getKnowledgeTreeDetail',
    contract: {
      id: 'knowledgeTree.detail',
      version: 'v1',
      displayName: 'Knowledge Tree Detail',
      description: '查看知识树节点详情与导入目标路径',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '知识树节点 ID' },
        },
        required: ['id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/v1/knowledge-tree/:id' },
      cli: { command: 'ova tree detail' },
    },
  },
  'documents.import.create': {
    gatewayHandler: 'createDocumentImport',
    contract: {
      id: 'documents.import.create',
      version: 'v1',
      displayName: 'Documents Import Create',
      description: '创建本地文件、URL 或 manifest 文档导入任务',
      inputSchema: {
        type: 'object',
        properties: {
          sourceType: { type: 'string', description: 'local、url 或 manifest' },
          knowledgeBaseId: { type: 'string', description: '目标知识库 ID' },
          sourceUrl: { type: 'string', description: '单个来源地址' },
          sourceUrls: { type: 'array', items: { type: 'string' } },
          parentNodeId: { type: 'string', description: '目标知识树节点 ID', nullable: true },
        },
        required: ['sourceType', 'knowledgeBaseId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string' },
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_operator',
      auditLevel: 'standard',
      http: { method: 'POST', path: '/api/v1/import-tasks/documents' },
      cli: { command: 'ova documents import' },
    },
  },
  'documents.import.status': {
    gatewayHandler: 'getDocumentImportStatus',
    contract: {
      id: 'documents.import.status',
      version: 'v1',
      displayName: 'Documents Import Status',
      description: '查看文档导入任务进度',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '导入任务 ID' },
        },
        required: ['taskId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string' },
          progress: { type: 'number' },
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/v1/import-tasks/:id' },
      cli: { command: 'ova documents import status' },
    },
  },
  'documents.import.list': {
    gatewayHandler: 'listDocumentImports',
    contract: {
      id: 'documents.import.list',
      version: 'v1',
      displayName: 'Documents Import List',
      description: '列出当前租户文档导入任务',
      inputSchema: {
        type: 'object',
        properties: {},
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
      http: { method: 'GET', path: '/api/v1/import-tasks' },
      cli: { command: 'ova documents import list' },
    },
  },
  'documents.import.cancel': {
    gatewayHandler: 'cancelDocumentImport',
    contract: {
      id: 'documents.import.cancel',
      version: 'v1',
      displayName: 'Documents Import Cancel',
      description: '取消排队中的文档导入任务',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '导入任务 ID' },
        },
        required: ['taskId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string' },
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_operator',
      auditLevel: 'standard',
      http: { method: 'POST', path: '/api/v1/import-tasks/:id/cancel' },
      cli: { command: 'ova documents import cancel' },
    },
  },
  'documents.import.retry': {
    gatewayHandler: 'retryDocumentImport',
    contract: {
      id: 'documents.import.retry',
      version: 'v1',
      displayName: 'Documents Import Retry',
      description: '重试失败或已取消的文档导入任务',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '导入任务 ID' },
        },
        required: ['taskId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string' },
          item: { type: 'object' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_operator',
      auditLevel: 'standard',
      http: { method: 'POST', path: '/api/v1/import-tasks/:id/retry' },
      cli: { command: 'ova documents import retry' },
    },
  },
  'documents.import.events': {
    gatewayHandler: 'watchDocumentImportEvents',
    contract: {
      id: 'documents.import.events',
      version: 'v1',
      displayName: 'Documents Import Events',
      description: '查看文档导入任务的进度事件快照',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: '导入任务 ID' },
        },
        required: ['taskId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          events: { type: 'array' },
        },
      },
      permissionRequirement: 'tenant',
      minimumRole: 'tenant_viewer',
      auditLevel: 'standard',
      http: { method: 'GET', path: '/api/v1/import-tasks/:id/events' },
      cli: { command: 'ova documents import status --watch' },
    },
  },
};

export function getCapabilityContracts(): CapabilityContract[] {
  return Object.values(capabilityRegistry).map((entry) => entry.contract);
}

export function getCapabilityRegistryEntry(id: CapabilityId) {
  return capabilityRegistry[id];
}
