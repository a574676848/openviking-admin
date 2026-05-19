import { ForbiddenException } from '@nestjs/common';
import { KnowledgeCapabilityGateway } from './knowledge-capability.gateway';
import type { Principal, TraceContext } from '../domain/capability.types';

describe('KnowledgeCapabilityGateway', () => {
  const ovKnowledgeGateway = {
    findKnowledge: jest.fn(),
    grepKnowledge: jest.fn(),
    listResources: jest.fn(),
    treeResources: jest.fn(),
  };
  const importTaskService = {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
  };
  const documentService = {
    indexContent: jest.fn(),
    loadContent: jest.fn(),
  };
  const searchService = {
    find: jest.fn(),
  };
  const knowledgeNodeAclService = {
    getAllowedUris: jest.fn(),
    assertCanReadNode: jest.fn(),
    filterReadableNodes: jest.fn((items) => items),
  };
  const knowledgeBaseService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const knowledgeTreeService = {
    findByKb: jest.fn(),
    findOne: jest.fn(),
  };
  const gateway = new KnowledgeCapabilityGateway(
    ovKnowledgeGateway as never,
    knowledgeBaseService as never,
    knowledgeTreeService as never,
    knowledgeNodeAclService as never,
    importTaskService as never,
    documentService as never,
    searchService as never,
  );

  const principal: Principal = {
    userId: 'user-1',
    tenantId: 'tenant-a',
    role: 'tenant_operator',
    scope: 'tenant',
    credentialType: 'jwt_access_token',
    clientType: 'service',
    ovConfig: {
      baseUrl: 'http://ov.local',
      apiKey: 'secret',
      account: 'default',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    knowledgeNodeAclService.getAllowedUris.mockResolvedValue([
      'viking://resources/tenants/tenant-a/doc-1',
    ]);
  });

  it('should reject cross-tenant resource access', async () => {
    await expect(
      gateway.listResources(principal, {
        uri: 'viking://resources/tenants/tenant-b/',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should call OV with tenant scoped uri', async () => {
    ovKnowledgeGateway.listResources.mockResolvedValue({
      result: [
        { uri: 'viking://resources/tenants/tenant-a/doc-1', isDir: false },
        { uri: 'viking://resources/tenants/tenant-a/doc-2', isDir: false },
      ],
    });

    const result = await gateway.listResources(
      principal,
      {
        uri: 'viking://resources/tenants/tenant-a/',
      },
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        requestId: 'request-1',
        tenantId: 'tenant-a',
        userId: 'user-1',
        channel: 'http',
        clientType: 'service',
        credentialType: 'jwt_access_token',
        capability: 'resources.list',
      },
    );

    expect(ovKnowledgeGateway.listResources).toHaveBeenCalledWith(
      expect.anything(),
      'viking://resources/tenants/tenant-a/',
      expect.objectContaining({
        traceId: 'trace-1',
        requestId: 'request-1',
      }),
    );

    expect(result.items).toEqual([
      {
        uri: 'viking://resources/tenants/tenant-a/doc-1',
        isDir: false,
        relPath: null,
      },
    ]);
  });

  it('should pass tenant custom account and user into shared search service', async () => {
    searchService.find.mockResolvedValue({
      resources: [],
      latencyMs: 3,
      logId: 'log-1',
      rerankApplied: false,
    });

    await gateway.search(
      {
        ...principal,
        ovConfig: {
          ...principal.ovConfig,
          account: 'tenant-custom-account',
          user: 'tenant-custom-user',
        },
      },
      { query: '面授课堂', limit: 10 },
    );

    expect(searchService.find).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '面授课堂',
        topK: 10,
        scoreThreshold: 0.5,
      }),
      'tenant-a',
      {
        id: 'user-1',
        role: 'tenant_operator',
      },
      undefined,
      {
        connection: expect.objectContaining({
          account: 'tenant-custom-account',
          user: 'tenant-custom-user',
        }),
      },
    );
  });

  it('创建文档导入任务时应透传来源展示名', async () => {
    knowledgeBaseService.findOne.mockResolvedValue({
      id: 'kb-1',
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/',
    });
    knowledgeTreeService.findByKb.mockResolvedValue([]);
    importTaskService.create.mockResolvedValue({
      id: 'task-1',
      status: 'pending',
      sourceName: '产品手册.md',
    });

    await gateway.createDocumentImport(principal, {
      knowledgeBaseId: 'kb-1',
      sourceType: 'url',
      sourceUrl: 'https://docs.example.com/manual.md',
      sourceName: '产品手册.md',
    });

    expect(importTaskService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: '产品手册.md',
      }),
      'tenant-a',
      expect.objectContaining({
        id: 'user-1',
      }),
      {
        userId: 'user-1',
        role: 'tenant_operator',
      },
    );
  });

  it('导入任务列表应过滤掉当前用户无 ACL 可见权限的任务', async () => {
    importTaskService.findAll.mockResolvedValue([
      {
        id: 'task-visible',
        kbId: 'kb-1',
        targetUri: 'viking://resources/tenants/tenant-a/doc-1',
        autoCreatedNodeId: null,
        sourceType: 'url',
        sourceUrl: 'https://example.com/a.md',
        sourceName: 'a.md',
        status: 'pending',
        nodeCount: 0,
        vectorCount: 0,
        errorMsg: null,
        tenantId: 'tenant-a',
        integrationId: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await gateway.listDocumentImports(principal);

    expect(importTaskService.findAll).toHaveBeenCalledWith('tenant-a', {
      userId: 'user-1',
      role: 'tenant_operator',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'task-visible' }));
  });

  it('导入任务状态查询应拒绝访问无 ACL 可见权限的任务', async () => {
    knowledgeTreeService.findByKb.mockResolvedValue([{ id: 'node-1', acl: null }]);
    importTaskService.findOne.mockResolvedValue({
      id: 'task-hidden',
      kbId: 'kb-1',
      targetUri: 'viking://resources/tenants/tenant-a/hidden',
      autoCreatedNodeId: null,
      sourceType: 'url',
      sourceUrl: 'https://example.com/b.md',
      sourceName: 'b.md',
      status: 'pending',
      nodeCount: 0,
      vectorCount: 0,
      errorMsg: null,
      tenantId: 'tenant-a',
      integrationId: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      gateway.getDocumentImportStatus(principal, { taskId: 'task-hidden' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('导入任务事件查询应拒绝访问无 ACL 可见权限的任务', async () => {
    knowledgeTreeService.findByKb.mockResolvedValue([{ id: 'node-1', acl: null }]);
    importTaskService.findOne.mockResolvedValue({
      id: 'task-hidden',
      kbId: 'kb-1',
      targetUri: 'viking://resources/tenants/tenant-a/hidden',
      autoCreatedNodeId: null,
      sourceType: 'url',
      sourceUrl: 'https://example.com/b.md',
      sourceName: 'b.md',
      status: 'pending',
      nodeCount: 0,
      vectorCount: 0,
      errorMsg: null,
      tenantId: 'tenant-a',
      integrationId: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      gateway.watchDocumentImportEvents(principal, { taskId: 'task-hidden' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
