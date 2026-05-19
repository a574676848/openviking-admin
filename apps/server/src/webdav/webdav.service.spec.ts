import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { WebdavService } from './webdav.service';
import { SystemRoles } from '../users/entities/user.entity';
import { DocumentSessionRegistry } from '../common/document-session-registry';
import type { Principal } from '../capabilities/domain/capability.types';

describe('WebdavService 日志', () => {
  type LoggerStub = {
    warn: jest.Mock;
    error: jest.Mock;
  };

  function createService(overrides: Record<string, unknown> = {}) {
    const capabilityCredentialService = {
      resolvePrincipalFromApiKey: jest.fn(),
      ...overrides,
    };
    const knowledgeBaseService =
      (overrides.knowledgeBaseService as Record<string, unknown>) ?? {};
    const knowledgeTreeService =
      (overrides.knowledgeTreeService as Record<string, unknown>) ?? {};
    const ovClientService =
      (overrides.ovClientService as Record<string, unknown>) ?? {};
    const auditService = (overrides.auditService as Record<
      string,
      unknown
    >) ?? {
      log: jest.fn(),
    };
    const documentSessionRegistry =
      (overrides.documentSessionRegistry as Record<string, unknown>) ?? {
        assertNoActiveWriteSession: jest.fn(),
        assertNoActiveSessionInNodes: jest.fn(),
        hasActiveSessionInKb: jest.fn(() => false),
      };
    const documentService = (overrides.documentService as Record<
      string,
      unknown
    >) ?? {
      saveMarkdownContent: jest.fn().mockResolvedValue({
        contentUri: 'viking://resources/tenant-a/kb-1/node-1/content.md',
        draftVersion: 1,
        indexStatus: 'dirty',
        updatedAt: new Date('2026-05-12T00:00:00.000Z'),
      }),
    };
    const tenantCacheService = {
      getIsolationConfigByTenantRecordId: jest.fn(
        async (identifier: string) => ({
          tenantId: identifier,
          level: 'small',
        }),
      ),
    };
    const service = new WebdavService(
      capabilityCredentialService as never,
      tenantCacheService as never,
      {} as never,
      knowledgeBaseService as never,
      knowledgeTreeService as never,
      auditService as never,
      {} as never,
      documentSessionRegistry as never,
      documentService as never,
    );
    const logger: LoggerStub = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    (service as unknown as { logger: LoggerStub }).logger = logger;

    return {
      service,
      logger,
      capabilityCredentialService,
      knowledgeBaseService,
      knowledgeTreeService,
      ovClientService,
      auditService,
      documentSessionRegistry,
    };
  }

  function createRequest(
    headers: Record<string, string | undefined> = {},
    method = 'PROPFIND',
  ) {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );

    return {
      method,
      header: (name: string) => normalizedHeaders[name.toLowerCase()],
      ip: '127.0.0.1',
    } as Request;
  }

  const principal: Principal = {
    userId: 'user-1',
    username: '张三',
    tenantId: 'tenant-a',
    role: SystemRoles.TENANT_OPERATOR,
    scope: 'tenant',
    credentialType: 'api_key',
    clientType: 'human',
    ovConfig: {
      baseUrl: 'http://ov.local',
      apiKey: 'ov-key',
      account: 'tenant-a',
    },
  };

  const knowledgeBase = {
    id: 'kb-1',
    name: '知识库',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  const documentNode = {
    id: 'node-doc',
    kbId: 'kb-1',
    parentId: null,
    name: '说明.md',
    sortOrder: 0,
    acl: null,
    kind: 'document' as const,
    vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-doc/',
    contentUri: 'viking://resources/tenants/tenant-a/kb-1/node-doc/old.md',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  it('缺少 Basic Authorization 时应记录 WebDAV 鉴权失败原因', async () => {
    const { service, logger } = createService();

    const response = await service.buildResponse(createRequest(), 'tenant-a');

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing_basic_authorization'),
    );
  });

  it('凭证解析异常时应记录脱敏后的 WebDAV 失败原因', async () => {
    const { service, logger } = createService({
      resolvePrincipalFromApiKey: jest.fn(async () => {
        throw new Error('凭证不可用');
      }),
    });

    const response = await service.buildResponse(
      createRequest({
        Authorization:
          'Basic ' + Buffer.from('tenant-a:secret-value').toString('base64'),
      }),
      'tenant-a',
    );

    expect(response.status).toBe(401);
    expect(logger.error.mock.calls[0][0]).toContain(
      'credential_resolve_failed',
    );
    expect(logger.error.mock.calls[0][0]).not.toContain('secret-value');
  });

  it('覆盖 PUT 遇到可写协作会话时应返回 423', async () => {
    const documentSessionRegistry = new DocumentSessionRegistry();
    documentSessionRegistry.register(
      'kb-1',
      'node-doc',
      'collab-conn-1',
      'write',
    );
    const assertNoActiveWriteSessionSpy = jest.spyOn(
      documentSessionRegistry,
      'assertNoActiveWriteSession',
    );
    const ovClientService = {
      uploadTempFile: jest.fn(),
      request: jest.fn(),
    };
    const { service } = createService({
      documentSessionRegistry,
      ovClientService,
    });

    const response = await (
      service as unknown as {
        overwritePutFile(input: Record<string, unknown>): Promise<{
          status: number;
          body: string;
        }>;
      }
    ).overwritePutFile({
      request: createRequest({}, 'PUT'),
      principal,
      tenantScope: 'tenant-a',
      resourcePath: 'kb-1/说明.md',
      knowledgeBaseId: 'kb-1',
      node: documentNode,
      body: Buffer.from('新正文'),
    });

    expect(response.status).toBe(HttpStatus.LOCKED);
    expect(response.body).toBe('目标节点正在被协作编辑');
    expect(assertNoActiveWriteSessionSpy).toHaveBeenCalledWith('node-doc');
    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
    expect(ovClientService.request).not.toHaveBeenCalled();
  });

  it('覆盖 PUT 应只替换正文叶子并保留 assets 容器', async () => {
    const updatedAt = new Date('2026-05-12T12:00:00.000Z');
    const knowledgeTreeService = {
      syncContentUri: jest.fn(async (_nodeId: string, contentUri: string) => ({
        ...documentNode,
        contentUri,
        updatedAt,
      })),
    };
    const ovClientService = {
      uploadTempFile: jest.fn().mockResolvedValue({
        result: { temp_file_id: 'temp-overwrite' },
      }),
      request: jest.fn().mockResolvedValue({
        result: { status: 'success' },
      }),
    };
    const { service, auditService, documentSessionRegistry } = createService({
      knowledgeTreeService,
      ovClientService,
    });

    const response = await (
      service as unknown as {
        overwritePutFile(input: Record<string, unknown>): Promise<{
          status: number;
        }>;
      }
    ).overwritePutFile({
      request: createRequest({ 'x-request-id': 'req-1' }, 'PUT'),
      principal,
      tenantScope: 'tenant-a',
      resourcePath: 'kb-1/说明.md',
      knowledgeBaseId: 'kb-1',
      node: documentNode,
      body: Buffer.from('新正文', 'utf8'),
    });

    expect(response.status).toBe(HttpStatus.NO_CONTENT);
    expect(
      documentSessionRegistry.assertNoActiveWriteSession,
    ).toHaveBeenCalledWith('node-doc');
    expect(ovClientService.uploadTempFile).not.toHaveBeenCalled();
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(
      (
        service as unknown as {
          documentService: { saveMarkdownContent: jest.Mock };
        }
      ).documentService.saveMarkdownContent,
    ).toHaveBeenCalledWith(
      'node-doc',
      'tenant-a',
      '新正文',
      {},
      { id: 'user-1', username: '张三' },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_put_update',
        meta: expect.objectContaining({
          contentUri: 'viking://resources/tenant-a/kb-1/node-1/content.md',
          draftVersion: 1,
          indexStatus: 'dirty',
          requestId: 'req-1',
        }),
      }),
    );
  });

  it('DELETE 遇到目标子树活跃会话时应返回 423', async () => {
    const childNode = {
      ...documentNode,
      id: 'child-doc',
      parentId: 'node-doc',
      name: '子文档.md',
    };
    const knowledgeBaseService = {
      findAll: jest.fn().mockResolvedValue([knowledgeBase]),
    };
    const knowledgeTreeService = {
      findByKb: jest.fn().mockResolvedValue([documentNode, childNode]),
      remove: jest.fn(),
    };
    const documentSessionRegistry = {
      assertNoActiveWriteSession: jest.fn(),
      assertNoActiveSessionInNodes: jest.fn(() => {
        throw new HttpException(
          '目标节点或子节点正在被协作编辑',
          HttpStatus.LOCKED,
        );
      }),
      hasActiveSessionInKb: jest.fn(() => false),
    };
    const { service } = createService({
      knowledgeBaseService,
      knowledgeTreeService,
      documentSessionRegistry,
    });

    const response = await (
      service as unknown as {
        buildDeleteResponse(
          request: Request,
          principal: Principal,
          tenantScope: string,
          resourcePath: string,
        ): Promise<{ status: number; body: string }>;
      }
    ).buildDeleteResponse(
      createRequest({}, 'DELETE'),
      principal,
      'tenant-a',
      'kb-1/说明.md',
    );

    expect(response.status).toBe(HttpStatus.LOCKED);
    expect(response.body).toBe('目标节点或子节点正在被协作编辑');
    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).toHaveBeenCalledWith(['node-doc', 'child-doc']);
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
  });

  it('MOVE 遇到目标子树活跃会话时应返回 423', async () => {
    const knowledgeBaseService = {
      findAll: jest.fn().mockResolvedValue([knowledgeBase]),
    };
    const knowledgeTreeService = {
      findByKb: jest.fn().mockResolvedValue([documentNode]),
      update: jest.fn(),
    };
    const documentSessionRegistry = {
      assertNoActiveWriteSession: jest.fn(),
      assertNoActiveSessionInNodes: jest.fn(() => {
        throw new HttpException(
          '目标节点或子节点正在被协作编辑',
          HttpStatus.LOCKED,
        );
      }),
      hasActiveSessionInKb: jest.fn(() => false),
    };
    const { service } = createService({
      knowledgeBaseService,
      knowledgeTreeService,
      documentSessionRegistry,
    });

    const response = await (
      service as unknown as {
        buildMoveResponse(
          request: Request,
          principal: Principal,
          tenantScope: string,
          tenantId: string,
          resourcePath: string,
        ): Promise<{ status: number; body: string }>;
      }
    ).buildMoveResponse(
      createRequest(
        {
          Destination: '/webdav/tenant-a/kb-1/新说明.md',
        },
        'MOVE',
      ),
      principal,
      'tenant-a',
      'tenant-a',
      'kb-1/说明.md',
    );

    expect(response.status).toBe(HttpStatus.LOCKED);
    expect(response.body).toBe('目标节点或子节点正在被协作编辑');
    expect(
      documentSessionRegistry.assertNoActiveSessionInNodes,
    ).toHaveBeenCalledWith(['node-doc']);
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('DELETE 知识库遇到活跃协作会话时应返回 423', async () => {
    const knowledgeBaseService = {
      findAll: jest.fn().mockResolvedValue([knowledgeBase]),
      remove: jest.fn(),
    };
    const documentSessionRegistry = {
      assertNoActiveWriteSession: jest.fn(),
      assertNoActiveSessionInNodes: jest.fn(),
      hasActiveSessionInKb: jest.fn(() => true),
    };
    const { service } = createService({
      knowledgeBaseService,
      documentSessionRegistry,
    });

    const response = await (
      service as unknown as {
        buildDeleteKnowledgeBaseResponse(
          request: Request,
          principal: Principal,
          tenantScope: string,
          resourcePath: string,
          target: { kind: 'knowledge-base'; knowledgeBaseId: string },
        ): Promise<{ status: number; body: string }>;
      }
    ).buildDeleteKnowledgeBaseResponse(
      createRequest({}, 'DELETE'),
      principal,
      'tenant-a',
      'kb-1',
      { kind: 'knowledge-base', knowledgeBaseId: 'kb-1' },
    );

    expect(response.status).toBe(HttpStatus.LOCKED);
    expect(response.body).toBe('目标知识库正在被协作编辑');
    expect(documentSessionRegistry.hasActiveSessionInKb).toHaveBeenCalledWith(
      'kb-1',
    );
    expect(knowledgeBaseService.remove).not.toHaveBeenCalled();
  });

  it('MOVE 知识库遇到活跃协作会话时应返回 423', async () => {
    const knowledgeBaseService = {
      findAll: jest.fn().mockResolvedValue([knowledgeBase]),
      update: jest.fn(),
    };
    const documentSessionRegistry = {
      assertNoActiveWriteSession: jest.fn(),
      assertNoActiveSessionInNodes: jest.fn(),
      hasActiveSessionInKb: jest.fn(() => true),
    };
    const { service } = createService({
      knowledgeBaseService,
      documentSessionRegistry,
    });

    const response = await (
      service as unknown as {
        buildMoveKnowledgeBaseResponse(
          request: Request,
          principal: Principal,
          tenantScope: string,
          resourcePath: string,
          destinationResourcePath: string,
          sourceTarget: { kind: 'knowledge-base'; knowledgeBaseId: string },
          destinationTarget: {
            kind: 'knowledge-base';
            knowledgeBaseId: string;
          },
        ): Promise<{ status: number; body: string }>;
      }
    ).buildMoveKnowledgeBaseResponse(
      createRequest({}, 'MOVE'),
      principal,
      'tenant-a',
      'kb-1',
      '新知识库',
      { kind: 'knowledge-base', knowledgeBaseId: 'kb-1' },
      { kind: 'knowledge-base', knowledgeBaseId: '新知识库' },
    );

    expect(response.status).toBe(HttpStatus.LOCKED);
    expect(response.body).toBe('目标知识库正在被协作编辑');
    expect(documentSessionRegistry.hasActiveSessionInKb).toHaveBeenCalledWith(
      'kb-1',
    );
    expect(knowledgeBaseService.update).not.toHaveBeenCalled();
  });
});
