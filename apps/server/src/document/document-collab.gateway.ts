import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { HttpAdapterHost, ModuleRef, ContextIdFactory } from '@nestjs/core';
import type {
  Hocuspocus,
  WebSocketLike,
  connectedPayload,
  onAuthenticatePayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';
import type { Message, Peer, WSError } from 'crossws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { DataSource, type QueryRunner } from 'typeorm';
import type { Doc } from 'yjs';
import {
  AuthService,
  type VerifiedAccessTokenPayload,
} from '../auth/auth.service';
import { DocumentSessionRegistry } from '../common/document-session-registry';
import { importEsmModule } from '../common/esm-import.util';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import type { RepositoryRequest } from '../common/repository-request.interface';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import type { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { SystemRoles } from '../users/entities/user.entity';
import { DocumentContentCodec } from './document-content-codec';
import { DocumentService } from './document.service';
import {
  DOCUMENT_COLLAB_NAME_PREFIX,
  DOCUMENT_COLLAB_PATH,
  DOCUMENT_WRITE_ROLE_SET,
} from './constants';

const HOCUSPOCUS_SERVER_MODULE = '@hocuspocus/server';
const CROSSWS_NODE_ADAPTER_MODULE = 'crossws/adapters/node';
const DOCUMENT_COLLAB_GATEWAY_NAME = 'openviking-document-collab';
const DOCUMENT_COLLAB_DEBOUNCE_MS = 30_000;
const DOCUMENT_COLLAB_MAX_DEBOUNCE_MS = 60_000;
// OV 引擎拉取正文的最大等待时间：超时直接抛错而不是把租户 DB 连接锁在 Hocuspocus 队列里，
// 避免 /api/v1/readyz 等其他接口因 DB 连接池耗尽而无响应。
const DOCUMENT_COLLAB_OV_FETCH_TIMEOUT_MS = 8_000;
const DOCUMENT_COLLAB_TOKEN_QUERY_PARAM = 'token';
const DOCUMENT_COLLAB_ACCESS_TOKEN_QUERY_PARAM = 'access_token';
const DOCUMENT_COLLAB_SHUTDOWN_CLOSE_CODE = 1001;
const DOCUMENT_COLLAB_SHUTDOWN_CLOSE_REASON = '文档协作服务关闭';
const DOCUMENT_COLLAB_ROOM_PATH_PREFIX = `${DOCUMENT_COLLAB_PATH}/`;

interface DocumentCollabUserContext {
  id: string;
  username: string;
  role: string;
  tenantRecordId: string | null;
  scope: string;
}

type DocumentSessionMode = 'readonly' | 'write';

interface DocumentTenantRuntimeContext {
  tenantScope: string | null;
  tenantDataSource?: DataSource;
  tenantQueryRunner?: QueryRunner;
}

interface DocumentCollabContext {
  user?: DocumentCollabUserContext;
  tenantScope?: string | null;
  nodeId?: string;
  kbId?: string;
  mode?: DocumentSessionMode;
  connectionId?: string;
  registered?: boolean;
  loadedMarkdownLength?: number;
  skippedInitialEmptyStore?: boolean;
}

interface HocuspocusServerModule {
  Hocuspocus: new (configuration: {
    name: string;
    quiet: boolean;
    debounce: number;
    maxDebounce: number;
    onAuthenticate: (
      payload: onAuthenticatePayload<DocumentCollabContext>,
    ) => Promise<Partial<DocumentCollabContext>>;
    connected: (
      payload: connectedPayload<DocumentCollabContext>,
    ) => Promise<void>;
    onLoadDocument: (
      payload: onLoadDocumentPayload<DocumentCollabContext>,
    ) => Promise<Doc>;
    onStoreDocument: (
      payload: onStoreDocumentPayload<DocumentCollabContext>,
    ) => Promise<void>;
    onDisconnect: (
      payload: onDisconnectPayload<DocumentCollabContext>,
    ) => Promise<void>;
  }) => Hocuspocus<DocumentCollabContext>;
}

type CrosswsNodeAdapterFactory = typeof import('crossws/adapters/node').default;
type CrosswsNodeAdapter = ReturnType<CrosswsNodeAdapterFactory>;

interface CrosswsNodeAdapterModule {
  default: CrosswsNodeAdapterFactory;
}

interface HocuspocusClientConnection {
  handleMessage(data: Uint8Array): void;
  handleClose(event?: { code?: number; reason?: string }): void;
}

interface HocuspocusPeer extends Peer {
  websocket: WebSocketLike;
  request: Request;
  hocuspocusConnection?: HocuspocusClientConnection;
}

class DocumentCollabProtocolError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

@Injectable()
export class DocumentCollabGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentCollabGateway.name);
  private hocuspocus?: Hocuspocus<DocumentCollabContext>;
  private adapter?: CrosswsNodeAdapter;
  private httpServer?: HttpServer;
  private upgradeListener?: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly moduleRef: ModuleRef,
    private readonly defaultDataSource: DataSource,
    private readonly authService: AuthService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly dynamicDataSourceService: DynamicDataSourceService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly documentService: DocumentService,
    private readonly documentContentCodec: DocumentContentCodec,
    private readonly documentSessionRegistry: DocumentSessionRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeCollabRuntime();
    const candidateServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    if (this.isAttachableHttpServer(candidateServer)) {
      await this.attachToHttpServer(candidateServer);
    }
  }

  async attachToHttpServer(httpServer: HttpServer): Promise<void> {
    await this.initializeCollabRuntime();

    if (this.httpServer === httpServer && this.upgradeListener) {
      return;
    }

    if (this.httpServer && this.upgradeListener) {
      this.httpServer.off('upgrade', this.upgradeListener);
    }

    if (!this.upgradeListener) {
      this.upgradeListener = (request, socket, head) => {
        void this.handleUpgrade(request, socket, head);
      };
    }

    this.httpServer = httpServer;
    this.httpServer.on('upgrade', this.upgradeListener);
    this.logger.log(`协作 WebSocket 已挂载到 ${DOCUMENT_COLLAB_PATH}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.httpServer && this.upgradeListener) {
      this.httpServer.off('upgrade', this.upgradeListener);
    }

    this.adapter?.closeAll(
      DOCUMENT_COLLAB_SHUTDOWN_CLOSE_CODE,
      DOCUMENT_COLLAB_SHUTDOWN_CLOSE_REASON,
      false,
    );
    this.hocuspocus?.closeConnections();
    this.hocuspocus?.flushPendingStores();
  }

  private async initializeCollabRuntime(): Promise<void> {
    if (this.hocuspocus && this.adapter) {
      return;
    }

    const [hocuspocusModule, crosswsModule] = await Promise.all([
      importEsmModule<HocuspocusServerModule>(HOCUSPOCUS_SERVER_MODULE),
      importEsmModule<CrosswsNodeAdapterModule>(CROSSWS_NODE_ADAPTER_MODULE),
    ]);

    this.hocuspocus = new hocuspocusModule.Hocuspocus({
      name: DOCUMENT_COLLAB_GATEWAY_NAME,
      quiet: true,
      debounce: DOCUMENT_COLLAB_DEBOUNCE_MS,
      maxDebounce: DOCUMENT_COLLAB_MAX_DEBOUNCE_MS,
      onAuthenticate: (payload) => this.authenticate(payload),
      connected: (payload) => this.registerSession(payload),
      onLoadDocument: (payload) => this.loadDocument(payload),
      onStoreDocument: (payload) => this.storeDocument(payload),
      onDisconnect: (payload) => this.unregisterSession(payload),
    });
    this.adapter = this.createCrosswsAdapter(crosswsModule.default);
  }

  private isAttachableHttpServer(candidate: unknown): candidate is HttpServer {
    return Boolean(
      candidate &&
      typeof candidate === 'object' &&
      'on' in candidate &&
      'off' in candidate,
    );
  }

  private createCrosswsAdapter(
    createNodeAdapter: CrosswsNodeAdapterFactory,
  ): CrosswsNodeAdapter {
    return createNodeAdapter({
      hooks: {
        open: (peer: Peer) => {
          if (!this.hocuspocus) {
            throw new DocumentCollabProtocolError('协作服务尚未初始化。');
          }

          const hocuspocusPeer = peer as HocuspocusPeer;
          hocuspocusPeer.hocuspocusConnection =
            this.hocuspocus.handleConnection(
              hocuspocusPeer.websocket,
              hocuspocusPeer.request,
            );
        },
        message: (peer: Peer, message: Message) => {
          const hocuspocusPeer = peer as HocuspocusPeer;
          hocuspocusPeer.hocuspocusConnection?.handleMessage(
            message.uint8Array(),
          );
        },
        close: (peer: Peer, event) => {
          const hocuspocusPeer = peer as HocuspocusPeer;
          hocuspocusPeer.hocuspocusConnection?.handleClose({
            code: event.code,
            reason: event.reason,
          });
        },
        error: (_peer: Peer, error: WSError) => {
          const message = error instanceof Error ? error.message : '未知错误';
          this.logger.warn(`协作 WebSocket 连接异常: ${message}`);
        },
      },
    });
  }

  private async handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    if (!this.isCollabRequestPath(this.resolveRequestPath(request))) {
      return;
    }

    try {
      if (!this.hocuspocus || !this.adapter) {
        throw new DocumentCollabProtocolError('协作服务尚未初始化。');
      }

      await this.hocuspocus.hooks('onUpgrade', {
        request,
        socket,
        head,
        instance: this.hocuspocus,
      });
      await this.adapter.handleUpgrade(request, socket, head);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`协作 WebSocket upgrade 失败: ${message}`);
      socket.destroy();
    }
  }

  private async authenticate(
    payload: onAuthenticatePayload<DocumentCollabContext>,
  ): Promise<Partial<DocumentCollabContext>> {
    try {
      const token = this.extractToken(payload);
      const authPayload = this.authService.verifyAccessToken(token);
      const user = await this.authService.validateUser(authPayload.sub);
      if (!user) {
        throw new DocumentCollabProtocolError('用户不存在。');
      }

      const tenantScope = await this.resolveTenantScope(authPayload);
      const { nodeId } = this.parseDocumentName(payload.documentName);
      const node = await this.withTenantRequestContext(
        tenantScope,
        async (knowledgeTreeService) =>
          knowledgeTreeService.findOne(nodeId, tenantScope),
      );
      this.assertDocumentAccessible(node, authPayload);

      const mode = DOCUMENT_WRITE_ROLE_SET.has(authPayload.role)
        ? 'write'
        : 'readonly';
      payload.connectionConfig.readOnly = mode === 'readonly';
      this.logger.log(
        `协作鉴权通过 nodeId=${node.id} kbId=${node.kbId} tenantScope=${tenantScope ?? 'global'} mode=${mode} user=${authPayload.username}`,
      );

      return {
        user: {
          id: authPayload.sub,
          username: authPayload.username,
          role: authPayload.role,
          tenantRecordId: authPayload.tenantId,
          scope: authPayload.scope,
        },
        tenantScope,
        nodeId: node.id,
        kbId: node.kbId,
        mode,
        connectionId: payload.socketId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(
        `协作鉴权失败 documentName=${payload.documentName} socketId=${payload.socketId} reason=${message}`,
      );
      throw error;
    }
  }

  private async registerSession(
    payload: connectedPayload<DocumentCollabContext>,
  ): Promise<void> {
    const context = payload.context;
    if (
      context.registered ||
      !context.kbId ||
      !context.nodeId ||
      !context.mode
    ) {
      return;
    }

    this.documentSessionRegistry.register(
      context.kbId,
      context.nodeId,
      payload.socketId,
      context.mode,
    );
    context.connectionId = payload.socketId;
    context.registered = true;
  }

  private async unregisterSession(
    payload: onDisconnectPayload<DocumentCollabContext>,
  ): Promise<void> {
    const context = payload.context;
    if (!context.registered || !context.kbId || !context.nodeId) {
      return;
    }

    this.documentSessionRegistry.unregister(
      context.kbId,
      context.nodeId,
      context.connectionId ?? payload.socketId,
    );
    context.registered = false;
  }

  private async loadDocument(
    payload: onLoadDocumentPayload<DocumentCollabContext>,
  ): Promise<Doc> {
    try {
      const context = this.requireContext(payload.context);
      const snapshot = await this.withTenantRequestContext(
        context.tenantScope,
        async (_knowledgeTreeService, documentService) =>
          documentService.loadContent(
            context.nodeId,
            context.tenantScope,
            undefined,
            { ovFetchTimeoutMs: DOCUMENT_COLLAB_OV_FETCH_TIMEOUT_MS },
          ),
      );
      this.logger.log(
        `协作文档加载 nodeId=${context.nodeId} tenantScope=${context.tenantScope ?? 'global'} markdownLength=${snapshot.markdown.length}`,
      );
      payload.context.loadedMarkdownLength = snapshot.markdown.trim().length;

      return this.documentContentCodec.markdownToYDoc(snapshot.markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`协作文档加载失败: ${message}`);
      throw error;
    }
  }

  private async storeDocument(
    payload: onStoreDocumentPayload<DocumentCollabContext>,
  ): Promise<void> {
    try {
      const context = this.requireContext(payload.lastContext);
      if (context.mode !== 'write') {
        return;
      }

      const blocks = await this.documentContentCodec.yDocToBlocks(
        payload.document,
      );
      if (this.shouldSkipInitialEmptyStore(payload.lastContext, blocks)) {
        payload.lastContext.skippedInitialEmptyStore = true;
        this.logger.warn(
          `跳过协作文档首次空内容落盘 nodeId=${context.nodeId} tenantScope=${context.tenantScope ?? 'global'}`,
        );
        return;
      }
      await this.withTenantRequestContext(
        context.tenantScope,
        async (_knowledgeTreeService, documentService) =>
          documentService.saveContent(
            context.nodeId,
            context.tenantScope,
            blocks,
          ),
      );
      this.logger.log(
        `协作文档已落盘 nodeId=${context.nodeId} tenantScope=${context.tenantScope ?? 'global'} blocks=${blocks.length}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`协作文档落盘失败: ${message}`);
      throw error;
    }
  }

  private shouldSkipInitialEmptyStore(
    context: DocumentCollabContext,
    blocks: unknown[],
  ): boolean {
    return Boolean(
      context.loadedMarkdownLength &&
      context.loadedMarkdownLength > 0 &&
      !context.skippedInitialEmptyStore &&
      this.isEmptyDocumentBlocks(blocks),
    );
  }

  private isEmptyDocumentBlocks(blocks: unknown[]): boolean {
    if (blocks.length === 0) {
      return true;
    }
    if (blocks.length > 1) {
      return false;
    }
    const block = blocks[0];
    if (!block || typeof block !== 'object') {
      return false;
    }
    const typedBlock = block as { type?: unknown; content?: unknown };
    if (typedBlock.type !== 'paragraph') {
      return false;
    }
    return (
      typedBlock.content === '' ||
      typedBlock.content === undefined ||
      (Array.isArray(typedBlock.content) && typedBlock.content.length === 0)
    );
  }

  private extractToken(
    payload: onAuthenticatePayload<DocumentCollabContext>,
  ): string {
    const token =
      payload.token ||
      payload.requestParameters.get(DOCUMENT_COLLAB_TOKEN_QUERY_PARAM) ||
      payload.requestParameters.get(DOCUMENT_COLLAB_ACCESS_TOKEN_QUERY_PARAM);
    if (!token) {
      throw new DocumentCollabProtocolError('缺少协作访问凭据。');
    }
    return token;
  }

  private async resolveTenantScope(
    authPayload: VerifiedAccessTokenPayload,
  ): Promise<string | null> {
    if (!authPayload.tenantId) {
      return null;
    }

    const isolationConfig =
      await this.tenantCacheService.getIsolationConfigByTenantRecordId(
        authPayload.tenantId,
      );
    if (!isolationConfig) {
      throw new DocumentCollabProtocolError('租户信息无效。');
    }

    return isolationConfig.tenantId;
  }

  private parseDocumentName(documentName: string): { nodeId: string } {
    const parts = documentName.split(':');
    if (
      parts.length !== 3 ||
      parts[0] !== DOCUMENT_COLLAB_NAME_PREFIX ||
      !parts[1] ||
      !parts[2]
    ) {
      throw new DocumentCollabProtocolError('协作文档名格式无效。');
    }

    return { nodeId: parts[2] };
  }

  private assertDocumentAccessible(
    node: KnowledgeNodeModel,
    authPayload: VerifiedAccessTokenPayload,
  ): void {
    if (node.kind !== 'document') {
      throw new DocumentCollabProtocolError('目标节点不是文档节点。');
    }
    if (this.canReadNode(node, authPayload)) {
      return;
    }

    throw new DocumentCollabProtocolError('无权访问文档。');
  }

  private canReadNode(
    node: KnowledgeNodeModel,
    authPayload: VerifiedAccessTokenPayload,
  ): boolean {
    if (authPayload.role === SystemRoles.SUPER_ADMIN) {
      return true;
    }
    if (!node.acl || node.acl.isPublic) {
      return true;
    }

    return Boolean(
      node.acl.roles?.includes(authPayload.role) ||
      node.acl.users?.includes(authPayload.sub),
    );
  }

  private requireContext(
    context: DocumentCollabContext,
  ): Required<Pick<DocumentCollabContext, 'nodeId' | 'tenantScope' | 'mode'>> {
    if (!context.nodeId || !context.mode) {
      throw new DocumentCollabProtocolError('协作上下文缺失。');
    }

    return {
      nodeId: context.nodeId,
      tenantScope: context.tenantScope ?? null,
      mode: context.mode,
    };
  }

  private resolveRequestPath(request: IncomingMessage): string {
    const host = request.headers.host ?? 'localhost';
    const requestUrl = new URL(request.url ?? '/', `http://${host}`);
    return requestUrl.pathname;
  }

  private isCollabRequestPath(path: string): boolean {
    return (
      path === DOCUMENT_COLLAB_PATH ||
      path.startsWith(DOCUMENT_COLLAB_ROOM_PATH_PREFIX)
    );
  }

  private async withTenantRequestContext<T>(
    tenantScope: string | null,
    work: (
      knowledgeTreeService: KnowledgeTreeService,
      documentService: DocumentService,
    ) => Promise<T>,
  ): Promise<T> {
    const runtimeContext = await this.createTenantRuntimeContext(tenantScope);
    const contextId = ContextIdFactory.create();
    const request = this.createRepositoryRequest(runtimeContext);
    this.moduleRef.registerRequestByContextId(request, contextId);

    try {
      const knowledgeTreeService = await this.moduleRef.resolve(
        KnowledgeTreeService,
        contextId,
        { strict: false },
      );
      const documentService = await this.moduleRef.resolve(
        DocumentService,
        contextId,
        { strict: false },
      );
      return await work(knowledgeTreeService, documentService);
    } finally {
      if (
        runtimeContext.tenantQueryRunner &&
        !runtimeContext.tenantQueryRunner.isReleased
      ) {
        await runtimeContext.tenantQueryRunner.release();
      }
    }
  }

  private createRepositoryRequest(
    runtimeContext: DocumentTenantRuntimeContext,
  ): RepositoryRequest {
    return {
      tenantDataSource: runtimeContext.tenantDataSource,
      tenantQueryRunner: runtimeContext.tenantQueryRunner,
    };
  }

  private async createTenantRuntimeContext(
    tenantScope: string | null,
  ): Promise<DocumentTenantRuntimeContext> {
    if (!tenantScope) {
      return { tenantScope: null };
    }

    const isolationConfig =
      await this.tenantCacheService.getIsolationConfig(tenantScope);
    if (!isolationConfig) {
      throw new DocumentCollabProtocolError('租户隔离配置不存在。');
    }

    if (isolationConfig.level === TenantIsolationLevel.LARGE) {
      if (!isolationConfig.dbConfig) {
        throw new DocumentCollabProtocolError('LARGE 租户缺少独立库配置。');
      }

      const tenantDataSource =
        await this.dynamicDataSourceService.getTenantDataSource(
          isolationConfig.tenantId,
          isolationConfig.dbConfig,
        );
      return {
        tenantScope,
        tenantDataSource,
      };
    }

    if (isolationConfig.level === TenantIsolationLevel.MEDIUM) {
      const queryRunner = this.defaultDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.query(
        `SET search_path TO "tenant_${isolationConfig.tenantId.replace(/-/g, '_')}", public`,
      );
      return {
        tenantScope,
        tenantQueryRunner: queryRunner,
      };
    }

    return { tenantScope };
  }
}
