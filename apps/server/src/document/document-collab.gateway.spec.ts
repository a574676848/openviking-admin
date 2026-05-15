import { HttpAdapterHost } from '@nestjs/core';
import type {
  connectedPayload,
  onAuthenticatePayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import * as Y from 'yjs';
import { AuthService } from '../auth/auth.service';
import { DocumentSessionRegistry } from '../common/document-session-registry';
import { importEsmModule } from '../common/esm-import.util';
import type { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { SystemRoles } from '../users/entities/user.entity';
import { DocumentContentCodec } from './document-content-codec';
import { DocumentCollabGateway } from './document-collab.gateway';
import { DocumentService } from './document.service';

const HOCUSPOCUS_SERVER_MODULE = '@hocuspocus/server';
const CROSSWS_NODE_ADAPTER_MODULE = 'crossws/adapters/node';
const COLLAB_DOCUMENT_NAME = 'document:tenant-a:node-1';
const SOCKET_ID = 'socket-1';
const TENANT_RECORD_ID = 'tenant-record-1';
const TENANT_SCOPE = 'tenant-a';

jest.mock('../common/esm-import.util', () => ({
  importEsmModule: jest.fn(),
}));

interface CapturedHocuspocusConfig {
  debounce: number;
  maxDebounce: number;
  onAuthenticate: (
    payload: onAuthenticatePayload<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>;
  connected: (payload: connectedPayload<Record<string, unknown>>) => Promise<void>;
  onLoadDocument: (
    payload: onLoadDocumentPayload<Record<string, unknown>>,
  ) => Promise<Y.Doc>;
  onStoreDocument: (
    payload: onStoreDocumentPayload<Record<string, unknown>>,
  ) => Promise<void>;
  onDisconnect: (
    payload: onDisconnectPayload<Record<string, unknown>>,
  ) => Promise<void>;
}

function createNode(): KnowledgeNodeModel {
  return {
    id: 'node-1',
    tenantId: TENANT_SCOPE,
    kbId: 'kb-1',
    parentId: null,
    name: '协作文档',
    path: null,
    sortOrder: 1,
    acl: null,
    kind: 'document',
    vikingUri: 'viking://resources/tenants/tenant-a/kb-1/node-1/',
    contentUri: null,
    indexStatus: 'clean',
    draftVersion: 0,
    indexedVersion: 0,
    vectorCount: null,
    lastIndexedAt: null,
    indexError: null,
    createdAt: new Date('2026-05-12T00:00:00.000Z'),
    updatedAt: new Date('2026-05-12T00:00:00.000Z'),
  };
}

function createAuthenticatePayload(
  overrides: Partial<onAuthenticatePayload<Record<string, unknown>>> = {},
): onAuthenticatePayload<Record<string, unknown>> {
  return {
    token: 'access-token',
    documentName: COLLAB_DOCUMENT_NAME,
    instance: {} as never,
    request: new Request('http://localhost/collab'),
    requestHeaders: new Headers(),
    requestParameters: new URLSearchParams(),
    socketId: SOCKET_ID,
    context: {},
    connectionConfig: { readOnly: false, isAuthenticated: false },
    providerVersion: null,
    ...overrides,
  };
}

describe('DocumentCollabGateway', () => {
  let capturedConfig: CapturedHocuspocusConfig;
  let httpServer: {
    on: jest.Mock;
    off: jest.Mock;
  };
  let adapter: {
    handleUpgrade: jest.Mock;
    closeAll: jest.Mock;
  };
  let hocuspocus: {
    hooks: jest.Mock;
    handleConnection: jest.Mock;
    closeConnections: jest.Mock;
    flushPendingStores: jest.Mock;
  };
  let gateway: DocumentCollabGateway;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken' | 'validateUser'>>;
  let tenantCacheService: jest.Mocked<
    Pick<TenantCacheService, 'getIsolationConfigByTenantRecordId'>
  >;
  let knowledgeTreeService: jest.Mocked<Pick<KnowledgeTreeService, 'findOne'>>;
  let documentService: jest.Mocked<Pick<DocumentService, 'loadContent' | 'saveContent'>>;
  let documentContentCodec: jest.Mocked<
    Pick<DocumentContentCodec, 'markdownToYDoc' | 'yDocToBlocks'>
  >;
  let documentSessionRegistry: jest.Mocked<
    Pick<DocumentSessionRegistry, 'register' | 'unregister'>
  >;
  const importEsmModuleMock = jest.mocked(importEsmModule);

  beforeEach(async () => {
    httpServer = {
      on: jest.fn(),
      off: jest.fn(),
    };
    adapter = {
      handleUpgrade: jest.fn(),
      closeAll: jest.fn(),
    };
    hocuspocus = {
      hooks: jest.fn().mockResolvedValue(undefined),
      handleConnection: jest.fn(),
      closeConnections: jest.fn(),
      flushPendingStores: jest.fn(),
    };
    authService = {
      verifyAccessToken: jest.fn().mockReturnValue({
        sub: 'user-1',
        username: 'alice',
        role: SystemRoles.TENANT_OPERATOR,
        tenantId: TENANT_RECORD_ID,
        scope: 'tenant',
        tokenType: 'access_token',
      }),
      validateUser: jest.fn().mockResolvedValue({ id: 'user-1' } as never),
    };
    tenantCacheService = {
      getIsolationConfigByTenantRecordId: jest.fn().mockResolvedValue({
        tenantId: TENANT_SCOPE,
        level: 'SMALL',
      }),
    };
    knowledgeTreeService = {
      findOne: jest.fn().mockResolvedValue(createNode()),
    };
    documentService = {
      loadContent: jest.fn().mockResolvedValue({
        markdown: '# 文档',
      } as never),
      saveContent: jest.fn(),
    };
    documentContentCodec = {
      markdownToYDoc: jest.fn().mockResolvedValue(new Y.Doc()),
      yDocToBlocks: jest.fn().mockResolvedValue([
        { type: 'paragraph', content: '正文' },
      ] as never),
    };
    documentSessionRegistry = {
      register: jest.fn(),
      unregister: jest.fn(),
    };
    importEsmModuleMock.mockImplementation(async (specifier: string) => {
      if (specifier === HOCUSPOCUS_SERVER_MODULE) {
        return {
          Hocuspocus: class {
            constructor(config: CapturedHocuspocusConfig) {
              capturedConfig = config;
              return hocuspocus;
            }
          },
        };
      }
      if (specifier === CROSSWS_NODE_ADAPTER_MODULE) {
        return {
          default: jest.fn(() => adapter),
        };
      }
      throw new Error(`未配置的 ESM 测试模块：${specifier}`);
    });

    gateway = new DocumentCollabGateway(
      { httpAdapter: { getHttpServer: () => httpServer } } as unknown as HttpAdapterHost,
      { resolve: jest.fn() } as never,
      {} as never,
      authService as unknown as AuthService,
      tenantCacheService as unknown as TenantCacheService,
      {} as never,
      knowledgeTreeService as unknown as KnowledgeTreeService,
      documentService as unknown as DocumentService,
      documentContentCodec as unknown as DocumentContentCodec,
      documentSessionRegistry as unknown as DocumentSessionRegistry,
    );
    await gateway.onModuleInit();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('应该挂载 Nest HTTP server upgrade 监听并配置防抖参数', () => {
    expect(importEsmModuleMock).toHaveBeenCalledWith(HOCUSPOCUS_SERVER_MODULE);
    expect(importEsmModuleMock).toHaveBeenCalledWith(CROSSWS_NODE_ADAPTER_MODULE);
    expect(httpServer.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
    expect(capturedConfig.debounce).toBe(30_000);
    expect(capturedConfig.maxDebounce).toBe(60_000);
  });

  it('应该校验 token、解析租户并按写角色建立可写上下文', async () => {
    const payload = createAuthenticatePayload();

    const context = await capturedConfig.onAuthenticate(payload);

    expect(authService.verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(tenantCacheService.getIsolationConfigByTenantRecordId).toHaveBeenCalledWith(
      TENANT_RECORD_ID,
    );
    expect(knowledgeTreeService.findOne).toHaveBeenCalledWith('node-1', TENANT_SCOPE);
    expect(payload.connectionConfig.readOnly).toBe(false);
    expect(context).toMatchObject({
      tenantScope: TENANT_SCOPE,
      nodeId: 'node-1',
      kbId: 'kb-1',
      mode: 'write',
      connectionId: SOCKET_ID,
    });
  });

  it('viewer 应建立只读上下文且不能写入', async () => {
    authService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      username: 'alice',
      role: SystemRoles.TENANT_VIEWER,
      tenantId: TENANT_RECORD_ID,
      scope: 'tenant',
      tokenType: 'access_token',
    });
    const payload = createAuthenticatePayload();

    const context = await capturedConfig.onAuthenticate(payload);

    expect(payload.connectionConfig.readOnly).toBe(true);
    expect(context).toMatchObject({ mode: 'readonly' });
  });

  it('ACL 不允许访问时应该拒绝认证', async () => {
    knowledgeTreeService.findOne.mockResolvedValue({
      ...createNode(),
      acl: {
        isPublic: false,
        roles: [SystemRoles.TENANT_ADMIN],
        users: [],
      },
    });
    authService.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      username: 'alice',
      role: SystemRoles.TENANT_VIEWER,
      tenantId: TENANT_RECORD_ID,
      scope: 'tenant',
      tokenType: 'access_token',
    });

    await expect(
      capturedConfig.onAuthenticate(createAuthenticatePayload()),
    ).rejects.toThrow('无权访问文档。');
  });

  it('connected 与 onDisconnect 应注册和注销协作会话', async () => {
    const context = {
      nodeId: 'node-1',
      kbId: 'kb-1',
      mode: 'write',
      tenantScope: TENANT_SCOPE,
    };

    await capturedConfig.connected(({
      context,
      socketId: SOCKET_ID,
    } as unknown) as connectedPayload<Record<string, unknown>>);
    await capturedConfig.onDisconnect(({
      context,
      socketId: SOCKET_ID,
    } as unknown) as onDisconnectPayload<Record<string, unknown>>);

    expect(documentSessionRegistry.register).toHaveBeenCalledWith(
      'kb-1',
      'node-1',
      SOCKET_ID,
      'write',
    );
    expect(documentSessionRegistry.unregister).toHaveBeenCalledWith(
      'kb-1',
      'node-1',
      SOCKET_ID,
    );
  });

  it('onLoadDocument 应从 OpenViking Markdown 初始化 Y.Doc', async () => {
    const yDoc = await capturedConfig.onLoadDocument(
      ({
        context: {
          nodeId: 'node-1',
          tenantScope: TENANT_SCOPE,
          mode: 'write',
        },
      } as unknown) as onLoadDocumentPayload<Record<string, unknown>>,
    );

    expect(documentService.loadContent).toHaveBeenCalledWith('node-1', TENANT_SCOPE);
    expect(documentContentCodec.markdownToYDoc).toHaveBeenCalledWith('# 文档');
    expect(yDoc).toBeInstanceOf(Y.Doc);
  });

  it('onStoreDocument 应把可写连接的 Y.Doc 保存为 Markdown 内容', async () => {
    const yDoc = new Y.Doc();

    await capturedConfig.onStoreDocument(
      ({
        document: yDoc,
        lastContext: {
          nodeId: 'node-1',
          tenantScope: TENANT_SCOPE,
          mode: 'write',
        },
      } as unknown) as onStoreDocumentPayload<Record<string, unknown>>,
    );

    expect(documentContentCodec.yDocToBlocks).toHaveBeenCalledWith(yDoc);
    expect(documentService.saveContent).toHaveBeenCalledWith(
      'node-1',
      TENANT_SCOPE,
      [{ type: 'paragraph', content: '正文' }],
    );
  });

  it('onStoreDocument 应忽略只读连接产生的持久化请求', async () => {
    await capturedConfig.onStoreDocument(
      ({
        document: new Y.Doc(),
        lastContext: {
          nodeId: 'node-1',
          tenantScope: TENANT_SCOPE,
          mode: 'readonly',
        },
      } as unknown) as onStoreDocumentPayload<Record<string, unknown>>,
    );

    expect(documentService.saveContent).not.toHaveBeenCalled();
  });

  it('onModuleDestroy 应关闭连接并移除 upgrade 监听', async () => {
    await gateway.onModuleDestroy();

    expect(httpServer.off).toHaveBeenCalledWith('upgrade', expect.any(Function));
    expect(adapter.closeAll).toHaveBeenCalled();
    expect(hocuspocus.closeConnections).toHaveBeenCalled();
    expect(hocuspocus.flushPendingStores).toHaveBeenCalled();
  });

  it('upgrade 监听只处理 /collab 路径', async () => {
    const listener = httpServer.on.mock.calls[0][1] as (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => void;
    const socket = { destroy: jest.fn() } as unknown as Duplex;

    listener(
      {
        url: '/collab',
        headers: { host: 'localhost' },
      } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );
    await Promise.resolve();

    expect(hocuspocus.hooks).toHaveBeenCalledWith(
      'onUpgrade',
      expect.objectContaining({ request: expect.any(Object) }),
    );
    expect(adapter.handleUpgrade).toHaveBeenCalled();
  });

  it('upgrade 监听应兼容 y-websocket 的 /collab/:documentName 路径', async () => {
    const listener = httpServer.on.mock.calls[0][1] as (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => void;
    const socket = { destroy: jest.fn() } as unknown as Duplex;

    listener(
      {
        url: `/collab/${encodeURIComponent(COLLAB_DOCUMENT_NAME)}?token=access-token`,
        headers: { host: 'localhost' },
      } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );
    await Promise.resolve();

    expect(hocuspocus.hooks).toHaveBeenCalledWith(
      'onUpgrade',
      expect.objectContaining({ request: expect.any(Object) }),
    );
    expect(adapter.handleUpgrade).toHaveBeenCalled();
  });
});
