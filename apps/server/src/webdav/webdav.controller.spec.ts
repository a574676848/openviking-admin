import {
  HttpException,
  INestApplication,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SuccessResponseInterceptor } from '../common/success-response.interceptor';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { ImportTaskService } from '../import-task/import-task.service';
import { OVClientService } from '../common/ov-client.service';
import { OvConfigResolverService } from '../settings/ov-config-resolver.service';
import { WebdavController } from './webdav.controller';
import { WebdavService } from './webdav.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';

describe('WebdavController', () => {
  let app: INestApplication<App>;

  const principal = {
    tenantId: 'tenant-a',
    userId: 'user-a',
  };

  const knowledgeBases = [
    {
      id: 'kb-1',
      name: '知识库一',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    },
    {
      id: 'kb-2',
      name: '知识库二',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    },
  ];

  const knowledgeNodes = [
    {
      id: 'node-dir',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: null,
      name: '章节一',
      path: null,
      sortOrder: 0,
      acl: null,
      vikingUri: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-03T00:00:00.000Z'),
    },
    {
      id: 'node-file',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: 'node-dir',
      name: '说明.md',
      path: 'docs/说明.md',
      sortOrder: 1,
      acl: null,
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    },
    {
      id: 'node-uri-dir',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: null,
      name: '空目录',
      path: null,
      sortOrder: 2,
      acl: null,
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-uri-dir/',
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
      updatedAt: new Date('2026-05-05T00:00:00.000Z'),
    },
    {
      id: 'node-denied',
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: 'node-dir',
      name: '内部说明.md',
      path: 'docs/内部说明.md',
      sortOrder: 3,
      acl: { isPublic: false, roles: ['tenant_admin'], users: ['user-b'] },
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-denied.md',
      createdAt: new Date('2026-03-04T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
    },
  ];

  const queryRunner = {
    connect: jest.fn(async () => undefined),
    query: jest.fn(async () => undefined),
  };

  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const dynamicDataSourceService = {
    getTenantDataSource: jest.fn(),
  };

  const ovClientService = {
    request: jest.fn(),
    requestStream: jest.fn(),
  };

  const ovConfigResolver = {
    resolve: jest.fn(),
  };

  const importTaskService = {
    createLocalUpload: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  const capabilityCredentialService = {
    resolvePrincipalFromApiKey: jest.fn(async () => ({
      tenantId: principal.tenantId,
      userId: principal.userId,
      username: 'alice',
      role: 'tenant_viewer',
      scope: 'tenant',
      credentialType: 'api_key',
      clientType: 'service',
      ovConfig: {
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-a',
      },
    })),
  };

  const tenantCacheService = {
    getIsolationConfigByTenantRecordId: jest.fn(async () => ({
      tenantId: 'tenant-a',
      level: TenantIsolationLevel.SMALL,
    })),
  };

  const knowledgeBaseService = {
    findAll: jest.fn(async () => knowledgeBases),
    findOne: jest.fn(async (id: string) =>
      knowledgeBases.find((item) => item.id === id),
    ),
    update: jest.fn(),
    remove: jest.fn(async () => undefined),
    create: jest.fn(async (input: { name: string; tenantId: string }) => ({
      id: 'kb-created',
      name: input.name,
      tenantId: input.tenantId,
      description: '',
      status: 'active',
      vikingUri: `viking://resources/tenants/${input.tenantId}/kb-created/`,
      docCount: 0,
      vectorCount: 0,
      createdAt: new Date('2026-05-07T00:00:00.000Z'),
      updatedAt: new Date('2026-05-07T00:00:00.000Z'),
    })),
  };

  const knowledgeTreeService = {
    findByKb: jest.fn(async (kbId: string) =>
      knowledgeNodes.filter((item) => item.kbId === kbId),
    ),
    findOne: jest.fn(async (id: string) =>
      knowledgeNodes.find((item) => item.id === id),
    ),
    create: jest.fn(
      async (input: {
        kbId: string;
        parentId?: string;
        name: string;
        tenantId: string;
        sortOrder?: number;
      }) => ({
        id: 'node-created',
        tenantId: input.tenantId,
        kbId: input.kbId,
        parentId: input.parentId ?? null,
        name: input.name,
        path: null,
        sortOrder: input.sortOrder ?? 0,
        acl: null,
        vikingUri: `viking://resources/tenants/${input.tenantId}/${input.kbId}/node-created/`,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      }),
    ),
    createFile: jest.fn(
      async (input: {
        kbId: string;
        parentId?: string;
        name: string;
        path?: string;
        tenantId: string;
        sortOrder?: number;
        fileExtension: string;
      }) => ({
        id: 'node-created-file',
        tenantId: input.tenantId,
        kbId: input.kbId,
        parentId: input.parentId ?? null,
        name: input.name,
        path: input.path ?? null,
        sortOrder: input.sortOrder ?? 0,
        acl: null,
        vikingUri: `viking://resources/tenants/${input.tenantId}/${input.kbId}/node-created-file${input.fileExtension}`,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      }),
    ),
    touch: jest.fn(async (id: string) => ({
      id,
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: 'node-dir',
      name: '说明.md',
      path: 'docs/说明.md',
      sortOrder: 1,
      acl: null,
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })),
    update: jest.fn(),
    remove: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WebdavController],
      providers: [
        WebdavService,
        {
          provide: CapabilityCredentialService,
          useValue: capabilityCredentialService,
        },
        { provide: TenantCacheService, useValue: tenantCacheService },
        {
          provide: DynamicDataSourceService,
          useValue: dynamicDataSourceService,
        },
        { provide: ImportTaskService, useValue: importTaskService },
        { provide: OVClientService, useValue: ovClientService },
        { provide: OvConfigResolverService, useValue: ovConfigResolver },
        { provide: AuditService, useValue: auditService },
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
        { provide: KnowledgeTreeService, useValue: knowledgeTreeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'webdav/{*path}', method: RequestMethod.ALL }],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalInterceptors(new SuccessResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tenantCacheService.getIsolationConfigByTenantRecordId.mockResolvedValue({
      tenantId: 'tenant-a',
      level: TenantIsolationLevel.SMALL,
    });
    ovConfigResolver.resolve.mockResolvedValue({
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-sk-test',
      account: 'tenant-a',
      user: null,
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: null,
    });
    knowledgeBaseService.findAll.mockResolvedValue(knowledgeBases);
    knowledgeBaseService.findOne.mockImplementation(async (id: string) =>
      knowledgeBases.find((item) => item.id === id),
    );
    knowledgeBaseService.update.mockImplementation(
      async (id: string, dto: Record<string, unknown>) => {
        const existing = knowledgeBases.find((item) => item.id === id);
        return {
          ...existing,
          ...dto,
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
        };
      },
    );
    knowledgeBaseService.remove.mockResolvedValue(undefined);
    knowledgeBaseService.create.mockImplementation(
      async (input: { name: string; tenantId: string }) => ({
        id: 'kb-created',
        name: input.name,
        tenantId: input.tenantId,
        description: '',
        status: 'active',
        vikingUri: `viking://resources/tenants/${input.tenantId}/kb-created/`,
        docCount: 0,
        vectorCount: 0,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      }),
    );
    knowledgeTreeService.findByKb.mockImplementation(async (kbId: string) =>
      knowledgeNodes.filter((item) => item.kbId === kbId),
    );
    knowledgeTreeService.findOne.mockImplementation(async (id: string) =>
      knowledgeNodes.find((item) => item.id === id),
    );
    knowledgeTreeService.create.mockImplementation(
      async (input: {
        kbId: string;
        parentId?: string;
        name: string;
        tenantId: string;
        sortOrder?: number;
      }) => ({
        id: 'node-created',
        tenantId: input.tenantId,
        kbId: input.kbId,
        parentId: input.parentId ?? null,
        name: input.name,
        path: null,
        sortOrder: input.sortOrder ?? 0,
        acl: null,
        vikingUri: `viking://resources/tenants/${input.tenantId}/${input.kbId}/node-created/`,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      }),
    );
    knowledgeTreeService.createFile.mockImplementation(
      async (input: {
        kbId: string;
        parentId?: string;
        name: string;
        path?: string;
        tenantId: string;
        sortOrder?: number;
        fileExtension: string;
      }) => ({
        id: 'node-created-file',
        tenantId: input.tenantId,
        kbId: input.kbId,
        parentId: input.parentId ?? null,
        name: input.name,
        path: input.path ?? null,
        sortOrder: input.sortOrder ?? 0,
        acl: null,
        vikingUri: `viking://resources/tenants/${input.tenantId}/${input.kbId}/node-created-file${input.fileExtension}`,
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      }),
    );
    knowledgeTreeService.touch.mockImplementation(async (id: string) => ({
      id,
      tenantId: 'tenant-a',
      kbId: 'kb-1',
      parentId: 'node-dir',
      name: '说明.md',
      path: 'docs/说明.md',
      sortOrder: 1,
      acl: null,
      vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    }));
    knowledgeTreeService.update.mockImplementation(
      async (id: string, dto: Record<string, unknown>) => {
        const existing = knowledgeNodes.find((item) => item.id === id);
        return {
          ...existing,
          ...dto,
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
        };
      },
    );
    knowledgeTreeService.remove.mockResolvedValue(undefined);
    importTaskService.createLocalUpload.mockResolvedValue({
      id: 'task-webdav-put-1',
      targetUri:
        'viking://resources/tenants/tenant-a/kb-1/node-created-file.md',
    });
    auditService.log.mockResolvedValue({ id: 'audit-1' });
    ovClientService.request.mockResolvedValue({});
    ovClientService.requestStream.mockResolvedValue({
      stream: Readable.from(['# 标题\n正文']),
      contentType: 'text/markdown; charset=utf-8',
      contentLength: String(Buffer.byteLength('# 标题\n正文', 'utf8')),
    });
  });

  function webdavRequest(method: string, path: string) {
    const TestRequest = (request as any).Test;
    return new TestRequest(app.getHttpServer(), method, path);
  }

  it('OPTIONS 应返回 WebDAV 头且不走 JSON envelope', async () => {
    const response = await webdavRequest('OPTIONS', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(response.headers.allow).toContain('PROPFIND');
    expect(response.headers.dav).toBe('1, 2');
    expect(response.text).toBe('');
  });

  it('PROPFIND Depth:0 应返回根目录 multistatus XML', async () => {
    const response = await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(207);

    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.text).toContain('<D:multistatus');
    expect(response.text).toContain('/webdav/tenant-a/');
    expect(response.text).not.toContain('知识库一');
    expect(knowledgeBaseService.findAll).toHaveBeenCalledWith('tenant-a');
  });

  it('PROPFIND Depth:1 应返回知识库下一级资源', async () => {
    const response = await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '1')
      .expect(207);

    expect(response.text).toContain(
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}/`,
    );
    expect(response.text).toContain('知识库一');
    expect(response.text).toContain(
      `/webdav/tenant-a/${encodeURIComponent('知识库二')}/`,
    );
  });

  it('PROPFIND 知识库目录应返回一级知识树节点', async () => {
    const response = await webdavRequest('PROPFIND', '/webdav/tenant-a/kb-1/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '1')
      .expect(207);

    expect(response.text).toContain(
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}/${encodeURIComponent('章节一')}/`,
    );
    expect(response.text).toContain(
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}/${encodeURIComponent('空目录')}/`,
    );
    expect(response.text).not.toContain('node-denied');
    expect(response.text).not.toContain('内部说明.md');
    expect(response.text).toContain('httpd/unix-directory');
    expect(knowledgeTreeService.findByKb).toHaveBeenCalledWith(
      'kb-1',
      'tenant-a',
    );
  });

  it('PROPFIND 叶子节点应按文件资源输出', async () => {
    const response = await webdavRequest(
      'PROPFIND',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(207);

    expect(response.text).toContain(
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}/${encodeURIComponent('章节一')}/${encodeURIComponent('说明.md')}`,
    );
    expect(response.text).toContain('text/markdown; charset=utf-8');
    expect(response.text).toContain('说明.md');
  });

  it('PROPFIND 目录时应过滤无权限子节点', async () => {
    const response = await webdavRequest(
      'PROPFIND',
      '/webdav/tenant-a/kb-1/node-dir/',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '1')
      .expect(207);

    expect(response.text).toContain('说明.md');
    expect(response.text).not.toContain('node-denied');
    expect(response.text).not.toContain('内部说明.md');
  });

  it('MKCOL 租户根目录时应创建知识库并写入审计', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/Obsidian%20Vault',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('x-request-id', 'request-root-mkcol-1')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeBaseService.create).toHaveBeenCalledWith({
      name: 'Obsidian Vault',
      description: '',
      tenantId: 'tenant-a',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_mkcol',
        target: 'kb-created',
        meta: expect.objectContaining({
          resourceKind: 'knowledge-base',
          name: 'Obsidian Vault',
          requestId: 'request-root-mkcol-1',
        }),
      }),
    );
  });

  it('GET 叶子节点应返回 Markdown 正文', async () => {
    const response = await webdavRequest(
      'GET',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text).toBe('# 标题\n正文');
    expect(ovClientService.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-a',
      }),
      '/api/v1/content/download?uri=' +
        encodeURIComponent(
          'viking://resources/tenants/tenant-a/kb-1/node-file.md',
        ),
      'GET',
      undefined,
      undefined,
      expect.objectContaining({
        serviceLabel: 'OpenViking 内容下载',
      }),
    );
    expect(ovClientService.requestStream.mock.calls[0]?.[0]).not.toHaveProperty(
      'user',
    );
  });

  it('GET 叶子节点在 ovConfig.user 存在时应透传 OpenViking 用户头', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_viewer',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
          user: 'tenant-ov-user',
        },
      } as any,
    );

    await webdavRequest('GET', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(ovClientService.requestStream.mock.calls[0]?.[0]).toMatchObject({
      user: 'tenant-ov-user',
    });
  });

  it('GET 叶子节点在 resolver 提供全局 OV_USER 时应透传该用户', async () => {
    ovConfigResolver.resolve.mockResolvedValueOnce({
      baseUrl: 'https://ov.example.com',
      apiKey: 'ov-sk-test',
      account: 'tenant-a',
      user: 'global-admin',
      rerankEndpoint: null,
      rerankApiKey: null,
      rerankModel: null,
    });

    await webdavRequest('GET', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(ovClientService.requestStream.mock.calls[0]?.[0]).toMatchObject({
      user: 'global-admin',
    });
  });

  it('GET 命中文件容器 URI 时应回退到唯一叶子正文', async () => {
    ovClientService.requestStream
      .mockRejectedValueOnce(new HttpException('not found', 404))
      .mockResolvedValueOnce({
        stream: Readable.from(['报告1']),
        contentType: 'text/plain; charset=utf-8',
        contentLength: '7',
      });
    ovClientService.request.mockResolvedValueOnce({
      result: [
        {
          uri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md/child.md',
          isDir: false,
        },
      ],
    });

    const response = await webdavRequest(
      'GET',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(response.text).toBe('报告1');
    expect(ovClientService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-a',
      }),
      '/api/v1/fs/tree?uri=' +
        encodeURIComponent(
          'viking://resources/tenants/tenant-a/kb-1/node-file.md',
        ) +
        '&depth=1',
      'GET',
      undefined,
      undefined,
      expect.objectContaining({
        serviceLabel: 'OpenViking 资源树',
      }),
    );
    expect(ovClientService.requestStream).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseUrl: 'https://ov.example.com',
        apiKey: 'ov-sk-test',
        account: 'tenant-a',
      }),
      '/api/v1/content/download?uri=' +
        encodeURIComponent(
          'viking://resources/tenants/tenant-a/kb-1/node-file.md/child.md',
        ),
      'GET',
      undefined,
      undefined,
      expect.objectContaining({
        serviceLabel: 'OpenViking 内容下载',
      }),
    );
  });

  it('GET 目录资源应返回稳定错误，不触发正文下载', async () => {
    const response = await webdavRequest('GET', '/webdav/tenant-a/kb-1/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(405);

    expect(response.headers.allow).toContain('PROPFIND');
    expect(response.text).toContain('当前仅支持');
    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });

  it('GET 目录 URI 节点应返回稳定错误', async () => {
    await webdavRequest('GET', '/webdav/tenant-a/kb-1/node-uri-dir/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(405);

    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });

  it('GET 正文上游失败时应返回 WebDAV 文本错误', async () => {
    ovClientService.requestStream.mockRejectedValueOnce(
      new HttpException('上游拒绝读取', 400),
    );

    const response = await webdavRequest(
      'GET',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(502);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toBe('WebDAV 正文读取失败。');
    expect(response.text).not.toContain('"data"');
  });

  it('GET 无权限节点应返回 404', async () => {
    await webdavRequest('GET', '/webdav/tenant-a/kb-1/node-dir/node-denied')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(404);

    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });

  it('GET 命中用户 ACL 时应允许读取', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: 'user-b',
        username: 'bob',
        role: 'tenant_viewer',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('GET', '/webdav/tenant-a/kb-1/node-dir/node-denied')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(ovClientService.requestStream).toHaveBeenCalled();
  });

  it('HEAD 叶子节点应返回元信息但不返回正文', async () => {
    const response = await webdavRequest(
      'HEAD',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(200);

    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text ?? '').toBe('');
    expect(ovClientService.requestStream).not.toHaveBeenCalled();
  });

  it('MKCOL 应创建知识树目录节点并写入审计', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/kb-1/%E6%96%B0%E7%9B%AE%E5%BD%95',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('x-request-id', 'request-mkcol-1')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.create).toHaveBeenCalledWith({
      kbId: 'kb-1',
      parentId: undefined,
      name: '新目录',
      sortOrder: 3,
      tenantId: 'tenant-a',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        username: 'alice',
        action: 'webdav_mkcol',
        target: 'node-created',
        meta: expect.objectContaining({
          kbId: 'kb-1',
          parentId: null,
          name: '新目录',
          credentialType: 'api_key',
          clientType: 'service',
          requestId: 'request-mkcol-1',
        }),
      }),
    );
  });

  it('MKCOL 权限不足时应返回 403 且不创建节点', async () => {
    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/kb-1/%E6%96%B0%E7%9B%AE%E5%BD%95',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(403);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('tenant_operator');
    expect(knowledgeTreeService.create).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('MKCOL 同级重名时应返回 409', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/kb-1/%E7%AB%A0%E8%8A%82%E4%B8%80',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(409);

    expect(response.text).toContain('同名资源');
    expect(knowledgeTreeService.create).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('MKCOL 同级重名且 If-None-Match 星号时应返回 412', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/kb-1/%E7%AB%A0%E8%8A%82%E4%B8%80',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('If-None-Match', '*')
      .expect(412);

    expect(response.text).toContain('If-None-Match');
    expect(knowledgeTreeService.create).not.toHaveBeenCalled();
  });

  it('MKCOL 父路径不是目录时应返回 409', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MKCOL',
      '/webdav/tenant-a/kb-1/node-dir/node-file/%E5%AD%90%E7%9B%AE%E5%BD%95',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(409);

    expect(response.text).toContain('父路径不是目录');
    expect(knowledgeTreeService.create).not.toHaveBeenCalled();
  });

  it('PUT 应新建受支持文件节点、创建导入任务并写入审计', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/%E6%96%B0%E6%96%87%E6%A1%A3.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .set('x-request-id', 'request-put-1')
      .send('# 新文档\n正文')
      .expect(201);

    expect(response.text).toBe('');
    expect(response.headers['x-openviking-import-task-id']).toBe(
      'task-webdav-put-1',
    );
    expect(knowledgeTreeService.createFile).toHaveBeenCalledWith({
      kbId: 'kb-1',
      parentId: 'node-dir',
      name: '新文档.md',
      path: 'node-dir/新文档.md',
      sortOrder: 4,
      tenantId: 'tenant-a',
      fileExtension: '.md',
    });
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      {
        kbId: 'kb-1',
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-created-file.md',
      },
      [
        expect.objectContaining({
          originalname: '新文档.md',
          mimetype: 'text/markdown; charset=utf-8',
          size: Buffer.byteLength('# 新文档\n正文', 'utf8'),
          buffer: Buffer.from('# 新文档\n正文'),
        }),
      ],
      'tenant-a',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        username: 'alice',
        action: 'webdav_put_create',
        target: 'node-created-file',
        meta: expect.objectContaining({
          taskId: 'task-webdav-put-1',
          kbId: 'kb-1',
          parentId: 'node-dir',
          name: '新文档.md',
          credentialType: 'api_key',
          clientType: 'service',
          requestId: 'request-put-1',
        }),
      }),
    );
  });

  it('PUT 命中已有文件 href 时应覆盖并触发导入任务', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .set('x-request-id', 'request-put-update-1')
      .send('# 已更新\n正文')
      .expect(204);

    expect(response.text).toBe('');
    expect(response.headers['x-openviking-import-task-id']).toBe(
      'task-webdav-put-1',
    );
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
    expect(knowledgeTreeService.touch).toHaveBeenCalledWith(
      'node-file',
      'tenant-a',
    );
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      {
        kbId: 'kb-1',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
      },
      [
        expect.objectContaining({
          originalname: '说明.md',
          mimetype: 'text/markdown; charset=utf-8',
          size: Buffer.byteLength('# 已更新\n正文', 'utf8'),
          buffer: Buffer.from('# 已更新\n正文'),
        }),
      ],
      'tenant-a',
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        username: 'alice',
        action: 'webdav_put_update',
        target: 'node-file',
        meta: expect.objectContaining({
          taskId: 'task-webdav-put-1',
          kbId: 'kb-1',
          parentId: 'node-dir',
          name: '说明.md',
          requestId: 'request-put-update-1',
        }),
      }),
    );
  });

  it('PUT Obsidian JSON 元数据文件时应允许创建', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/app.json',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/plain; charset=utf-8')
      .send('{"theme":"obsidian"}')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app.json',
        path: 'node-dir/app.json',
        fileExtension: '.json',
      }),
    );
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-created-file.json',
      }),
      [
        expect.objectContaining({
          originalname: 'app.json',
          mimetype: 'application/json; charset=utf-8',
        }),
      ],
      'tenant-a',
    );
  });

  it('PUT 无扩展名探测文件时应允许创建', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/rs-test-file-probe',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'application/octet-stream')
      .send('obsidian probe')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'rs-test-file-probe',
        path: 'node-dir/rs-test-file-probe',
        fileExtension: '',
      }),
    );
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUri:
          'viking://resources/tenants/tenant-a/kb-1/node-created-file',
      }),
      [
        expect.objectContaining({
          originalname: 'rs-test-file-probe',
          mimetype: 'application/octet-stream',
        }),
      ],
      'tenant-a',
    );
  });

  it('PUT 租户根目录写探针时应返回合成成功且不落库', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/.webdav_write_test_1778129568533',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'application/octet-stream')
      .send('1')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeBaseService.create).not.toHaveBeenCalled();
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
    expect(importTaskService.createLocalUpload).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('PUT 子目录写探针时也应直接返回且不触发写入流程', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/.webdav_write_test_1778129568533',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'application/octet-stream')
      .send('1')
      .expect(201);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.findByKb).not.toHaveBeenCalled();
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
    expect(importTaskService.createLocalUpload).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('PUT 覆盖已有文件时 If-Match 过期应返回 412', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('If-Match', 'W/"stale"')
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 已更新\n正文')
      .expect(412);

    expect(response.text).toContain('If-Match');
    expect(importTaskService.createLocalUpload).not.toHaveBeenCalled();
    expect(knowledgeTreeService.touch).not.toHaveBeenCalled();
  });

  it('PUT 新建文件时 If-None-Match 星号应允许目标不存在', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/condition-new.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('If-None-Match', '*')
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 新文档')
      .expect(201);

    expect(knowledgeTreeService.createFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'condition-new.md' }),
    );
  });

  it('PUT 应兼容中文、空格和 URL 编码文件名', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/%E4%B8%AD%E6%96%87%20space.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 中文标题')
      .expect(201);

    expect(knowledgeTreeService.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '中文 space.md',
        path: 'node-dir/中文 space.md',
      }),
    );
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      expect.any(Object),
      [expect.objectContaining({ originalname: '中文 space.md' })],
      'tenant-a',
    );
  });

  it('PUT 权限不足时应返回 403 且不创建任务', async () => {
    await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/%E6%96%B0%E6%96%87%E6%A1%A3.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 新文档')
      .expect(403);

    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
    expect(importTaskService.createLocalUpload).not.toHaveBeenCalled();
  });

  it('PUT 命中同名现有文件时应视为覆盖', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/%E8%AF%B4%E6%98%8E.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 重名')
      .expect(204);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
    expect(knowledgeTreeService.touch).toHaveBeenCalledWith(
      'node-file',
      'tenant-a',
    );
    expect(importTaskService.createLocalUpload).toHaveBeenCalledWith(
      {
        kbId: 'kb-1',
        targetUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
      },
      [
        expect.objectContaining({
          originalname: '说明.md',
          mimetype: 'text/markdown; charset=utf-8',
          size: Buffer.byteLength('# 重名', 'utf8'),
          buffer: Buffer.from('# 重名'),
        }),
      ],
      'tenant-a',
    );
  });

  it('PUT 新建文件遇到同名资源且 If-None-Match 星号时应返回 412', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'PUT',
      '/webdav/tenant-a/kb-1/node-dir/%E8%AF%B4%E6%98%8E.md',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('If-None-Match', '*')
      .set('Content-Type', 'text/markdown; charset=utf-8')
      .send('# 重名')
      .expect(412);

    expect(response.text).toContain('If-None-Match');
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
  });

  it('PUT 不受支持的文件格式时应返回 415', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest('PUT', '/webdav/tenant-a/kb-1/a.exe')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Content-Type', 'application/octet-stream')
      .send('文本')
      .expect(415);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('不支持');
    expect(knowledgeTreeService.createFile).not.toHaveBeenCalled();
  });

  it('DELETE 叶子文件时应通过服务层先删 OpenViking 资源再移除知识树节点', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('x-request-id', 'request-delete-1')
      .expect(204);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.remove).toHaveBeenCalledWith(
      'node-file',
      'tenant-a',
      {
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
        user: 'alice',
      },
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        username: 'alice',
        action: 'webdav_delete',
        target: 'node-file',
        meta: expect.objectContaining({
          kbId: 'kb-1',
          parentId: 'node-dir',
          name: '说明.md',
          requestId: 'request-delete-1',
        }),
      }),
    );
  });

  it('DELETE 叶子文件时 If-Match 过期应返回 412', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('If-Match', 'W/"stale"')
      .expect(412);

    expect(response.text).toContain('If-Match');
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
  });

  it('DELETE 租户根目录写探针时应返回合成成功且不删知识树节点', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/.webdav_write_test_1778129568533',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(204);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('DELETE 子目录写探针时也应直接返回且不删知识树节点', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/kb-1/node-dir/.webdav_write_test_1778129568533',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(204);

    expect(response.text).toBe('');
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('DELETE 租户根目录知识库时应委托知识库服务递归删除', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest(
      'DELETE',
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}`,
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('x-request-id', 'request-delete-kb-1')
      .expect(204);

    expect(knowledgeBaseService.remove).toHaveBeenCalledWith(
      'kb-1',
      'tenant-a',
      expect.objectContaining({ user: 'alice' }),
    );
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_delete',
        target: 'kb-1',
        meta: expect.objectContaining({
          resourceKind: 'knowledge-base',
          name: '知识库一',
          requestId: 'request-delete-kb-1',
        }),
      }),
    );
  });

  it('DELETE 空目录时应通过服务层删除目录 URI 并移除节点', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('DELETE', '/webdav/tenant-a/kb-1/node-uri-dir/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(204);

    expect(knowledgeTreeService.remove).toHaveBeenCalledWith(
      'node-uri-dir',
      'tenant-a',
      {
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
        user: 'alice',
      },
    );
  });

  it('DELETE 非空目录时应返回 409 且不删除下游资源', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/kb-1/node-dir/',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(409);

    expect(response.text).toContain('空目录或叶子文件');
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
  });

  it('DELETE 权限不足时应返回 403 且不删除资源', async () => {
    await webdavRequest('DELETE', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(403);

    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
  });

  it('DELETE 无 ACL 权限节点时应返回 404', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('DELETE', '/webdav/tenant-a/kb-1/node-dir/node-denied')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(404);

    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(knowledgeTreeService.remove).not.toHaveBeenCalled();
  });

  it('DELETE 下游删除失败时应返回 502 且保留知识树节点', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );
    knowledgeTreeService.remove.mockRejectedValueOnce(
      new HttpException('下游删除失败', 502),
    );

    const response = await webdavRequest(
      'DELETE',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(502);

    expect(response.text).toContain('下游资源删除失败');
    expect(knowledgeTreeService.remove).toHaveBeenCalledWith(
      'node-file',
      'tenant-a',
      expect.objectContaining({ user: 'alice' }),
    );
    expect(auditService.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_delete',
        target: 'node-file',
      }),
    );
  });

  it('MOVE 应重命名文件节点且保持 OpenViking URI 不变', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('MOVE', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-1/node-dir/renamed.md')
      .set('x-request-id', 'request-move-1')
      .expect(201);

    expect(knowledgeTreeService.update).toHaveBeenCalledWith(
      'node-file',
      {
        name: 'renamed.md',
        parentId: 'node-dir',
        sortOrder: 1,
        path: 'node-dir/renamed.md',
      },
      'tenant-a',
    );
    expect(ovClientService.request).not.toHaveBeenCalled();
    expect(importTaskService.createLocalUpload).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_move',
        target: 'node-file',
        meta: expect.objectContaining({
          previousName: '说明.md',
          name: 'renamed.md',
          vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-file.md',
          requestId: 'request-move-1',
        }),
      }),
    );
  });

  it('MOVE 租户根目录知识库时应重命名知识库', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest(
      'MOVE',
      `/webdav/tenant-a/${encodeURIComponent('知识库一')}`,
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set(
        'Destination',
        `/webdav/tenant-a/${encodeURIComponent('重命名知识库')}`,
      )
      .set('x-request-id', 'request-move-kb-1')
      .expect(201);

    expect(knowledgeBaseService.update).toHaveBeenCalledWith(
      'kb-1',
      { name: '重命名知识库' },
      'tenant-a',
    );
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'webdav_move',
        target: 'kb-1',
        meta: expect.objectContaining({
          resourceKind: 'knowledge-base',
          previousName: '知识库一',
          name: '重命名知识库',
          requestId: 'request-move-kb-1',
        }),
      }),
    );
  });

  it('MOVE 时 If-Match 过期应返回 412', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MOVE',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-1/node-dir/renamed.md')
      .set('If-Match', 'W/"stale"')
      .expect(412);

    expect(response.text).toContain('If-Match');
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('MOVE 应允许把文件移动到知识库根目录', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('MOVE', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', 'http://localhost/webdav/tenant-a/kb-1/root.md')
      .expect(201);

    expect(knowledgeTreeService.update).toHaveBeenCalledWith(
      'node-file',
      {
        name: 'root.md',
        parentId: null,
        sortOrder: 3,
        path: 'root.md',
      },
      'tenant-a',
    );
  });

  it('MOVE 目录时应只更新节点关系并保留目录资源 URI', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('MOVE', '/webdav/tenant-a/kb-1/node-uri-dir/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-1/node-dir/moved-dir/')
      .expect(201);

    expect(knowledgeTreeService.update).toHaveBeenCalledWith(
      'node-uri-dir',
      {
        name: 'moved-dir',
        parentId: 'node-dir',
        sortOrder: 4,
        path: null,
      },
      'tenant-a',
    );
    expect(ovClientService.request).not.toHaveBeenCalled();
  });

  it('MOVE 缺少 Destination 时应返回 400', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    await webdavRequest('MOVE', '/webdav/tenant-a/kb-1/node-dir/node-file')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .expect(400);

    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('MOVE 跨知识库时应返回 409', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MOVE',
      '/webdav/tenant-a/kb-1/node-dir/node-file',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-2/renamed.md')
      .expect(409);

    expect(response.text).toContain('同一知识库');
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('MOVE 到同级重名资源时应返回 409', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MOVE',
      '/webdav/tenant-a/kb-1/node-uri-dir/',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-1/node-dir/')
      .expect(409);

    expect(response.text).toContain('目标路径已存在');
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('MOVE 不能把目录移动到自身子节点下', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_operator',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest(
      'MOVE',
      '/webdav/tenant-a/kb-1/node-dir/',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Destination', '/webdav/tenant-a/kb-1/node-dir/moved/')
      .expect(409);

    expect(response.text).toContain('自身或子节点');
    expect(knowledgeTreeService.update).not.toHaveBeenCalled();
  });

  it('租户不匹配时应返回 401 和 Basic challenge', async () => {
    capabilityCredentialService.resolvePrincipalFromApiKey.mockResolvedValueOnce(
      {
        tenantId: 'tenant-b',
        userId: principal.userId,
        username: 'alice',
        role: 'tenant_viewer',
        scope: 'tenant',
        credentialType: 'api_key',
        clientType: 'service',
        ovConfig: {
          baseUrl: 'https://ov.example.com',
          apiKey: 'ov-sk-test',
          account: 'tenant-a',
        },
      },
    );

    const response = await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(401);

    expect(response.headers['www-authenticate']).toContain('Basic realm');
  });

  it('不支持的 Depth 应返回 400', async () => {
    await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', 'infinity')
      .expect(400);
  });

  it('非法路径编码应返回 WebDAV 文本错误', async () => {
    const response = await webdavRequest(
      'PROPFIND',
      '/webdav/tenant-a/kb-1/%252F',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(400);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('路径分隔符');
  });

  it('保留路径名称应返回 WebDAV 文本错误', async () => {
    const response = await webdavRequest(
      'PROPFIND',
      '/webdav/tenant-a/kb-1/%252E%252E',
    )
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(400);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('保留名称');
  });

  it('MEDIUM 租户应切换 search_path', async () => {
    tenantCacheService.getIsolationConfigByTenantRecordId.mockResolvedValueOnce(
      {
        tenantId: 'tenant-a',
        level: TenantIsolationLevel.MEDIUM,
      },
    );

    await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(207);

    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SET search_path TO "tenant_tenant_a", public',
    );
  });

  it('LARGE 租户应使用独立 DataSource', async () => {
    const tenantDataSource = { name: 'tenant-ds' };
    tenantCacheService.getIsolationConfigByTenantRecordId.mockResolvedValueOnce(
      {
        tenantId: 'tenant-a',
        level: TenantIsolationLevel.LARGE,
        dbConfig: { host: '127.0.0.1', database: 'tenant_a' },
      } as any,
    );
    dynamicDataSourceService.getTenantDataSource.mockResolvedValueOnce(
      tenantDataSource,
    );

    await webdavRequest('PROPFIND', '/webdav/tenant-a/')
      .set(
        'Authorization',
        'Basic ' + Buffer.from('tenant-a:ov-sk-test').toString('base64'),
      )
      .set('Depth', '0')
      .expect(207);

    expect(dynamicDataSourceService.getTenantDataSource).toHaveBeenCalledWith(
      'tenant-a',
      { host: '127.0.0.1', database: 'tenant_a' },
    );
  });
});
