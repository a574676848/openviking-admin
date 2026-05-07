import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { DynamicDataSourceService } from '../common/dynamic-datasource.service';
import { OVClientService } from '../common/ov-client.service';
import { LOCAL_IMPORT_UPLOAD_CONFIG } from '../import-task/constants';
import { ImportTaskService } from '../import-task/import-task.service';
import type { LocalImportUploadFile } from '../import-task/local-import-storage.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import type { Principal } from '../capabilities/domain/capability.types';
import { CapabilityCredentialService } from '../capabilities/infrastructure/capability-credential.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { SystemRoles, type UserRole } from '../users/entities/user.entity';
import { OvConfigResolverService } from '../settings/ov-config-resolver.service';
import {
  WEBDAV_ALLOW,
  WEBDAV_DAV,
  WEBDAV_ROOT_PATH,
  WEBDAV_TEXT_CONTENT_TYPE,
} from './webdav.constants';

const WEBDAV_REALM = 'OpenViking WebDAV';
const WEBDAV_XML_CONTENT_TYPE = 'application/xml; charset=utf-8';
const WEBDAV_MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
const WEBDAV_CONTENT_DOWNLOAD_PATH = '/api/v1/content/download';
const WEBDAV_FS_TREE_PATH = '/api/v1/fs/tree';
const WEBDAV_SUCCESS_STATUS = 'HTTP/1.1 200 OK';
const WEBDAV_DIRECTORY_URI_SUFFIX = '/';
const WEBDAV_MAX_PATH_SEGMENT_LENGTH = 255;
const WEBDAV_RESERVED_PATH_SEGMENTS = new Set(['.', '..']);
const WEBDAV_ROOT_WRITE_PROBE_PREFIX = '.webdav_write_test_';
const WEBDAV_MIN_WRITE_ROLE = SystemRoles.TENANT_OPERATOR;
const WEBDAV_SORT_ORDER_STEP = 1;
const WEBDAV_ALLOWED_FILE_EXTENSIONS: ReadonlySet<string> = new Set(
  LOCAL_IMPORT_UPLOAD_CONFIG.ALLOWED_EXTENSIONS,
);
const WEBDAV_ALLOW_EXTENSIONLESS_FILES = true;
const WEBDAV_TEXTLIKE_CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.canvas': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const WEBDAV_ROLE_WEIGHT: Record<UserRole, number> = {
  [SystemRoles.TENANT_VIEWER]: 1,
  [SystemRoles.TENANT_OPERATOR]: 2,
  [SystemRoles.TENANT_ADMIN]: 3,
  [SystemRoles.SUPER_ADMIN]: 4,
};

interface WebdavResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Readable;
}

interface WebdavResource {
  href: string;
  displayName: string;
  isCollection: boolean;
  contentType: string;
  etag: string;
  lastModified: Date;
  createdAt: Date;
  contentLength: number;
}

interface TenantContextHandle {
  ok: boolean;
  tenantScope?: string;
  response?: WebdavResponse;
}

interface WebdavKnowledgeNode {
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  acl: {
    roles?: string[];
    users?: string[];
    isPublic?: boolean;
  } | null;
  kind: 'collection' | 'document';
  vikingUri: string | null;
  contentUri: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WebdavTargetRoot {
  kind: 'root';
}

interface WebdavTargetKnowledgeBase {
  kind: 'knowledge-base';
  knowledgeBaseId: string;
}

interface WebdavTargetKnowledgeNode {
  kind: 'knowledge-node';
  knowledgeBaseId: string;
  nodeSegments: string[];
}

interface WebdavWritableFileTarget {
  knowledgeBaseId: string;
  node: WebdavKnowledgeNode;
}

interface WebdavKnowledgeBaseLike {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface WebdavOVConnection {
  baseUrl: string;
  apiKey: string;
  account: string;
  user?: string;
}

type WebdavTarget =
  | WebdavTargetRoot
  | WebdavTargetKnowledgeBase
  | WebdavTargetKnowledgeNode;

@Injectable()
export class WebdavService {
  constructor(
    private readonly capabilityCredentialService: CapabilityCredentialService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly dynamicDataSourceService: DynamicDataSourceService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly importTaskService: ImportTaskService,
    private readonly ovClientService: OVClientService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly ovConfigResolver: OvConfigResolverService,
  ) {}

  async buildResponse(
    request: Request,
    tenantId: string,
    resourcePath?: string,
  ): Promise<WebdavResponse> {
    const method = request.method.toUpperCase();
    const authResult = await this.resolvePrincipal(request, tenantId);
    if (!authResult.ok) {
      return authResult.response;
    }

    let contextResult: TenantContextHandle;
    try {
      contextResult = await this.attachTenantContext(
        request as AuthenticatedRequest,
        authResult.principal,
      );
    } catch {
      return this.createInternalServerErrorResponse(
        'WebDAV 租户上下文初始化失败。',
      );
    }
    if (!contextResult.ok) {
      return (
        contextResult.response ??
        this.createInternalServerErrorResponse('WebDAV 租户上下文初始化失败。')
      );
    }
    if (!contextResult.tenantScope) {
      return this.createInternalServerErrorResponse(
        'WebDAV 租户上下文缺少租户标识。',
      );
    }
    const tenantScope = contextResult.tenantScope;

    if (method === 'OPTIONS') {
      return this.createOptionsResponse();
    }

    if (method === 'GET' || method === 'HEAD') {
      return this.buildReadResponse(
        authResult.principal,
        tenantScope,
        method,
        resourcePath,
      );
    }

    if (method === 'MKCOL') {
      return this.buildMkcolResponse(
        request,
        authResult.principal,
        tenantScope,
        resourcePath,
      );
    }

    if (method === 'PUT') {
      return this.buildPutResponse(
        request,
        authResult.principal,
        tenantScope,
        resourcePath,
      );
    }

    if (method === 'DELETE') {
      return this.buildDeleteResponse(
        request,
        authResult.principal,
        tenantScope,
        resourcePath,
      );
    }

    if (method === 'MOVE') {
      return this.buildMoveResponse(
        request,
        authResult.principal,
        tenantScope,
        tenantId,
        resourcePath,
      );
    }

    if (method !== 'PROPFIND') {
      return this.createMethodNotAllowedResponse();
    }

    const depth = this.resolveDepth(request.header('depth'));
    if (depth === null) {
      return this.createBadRequestResponse('Depth 仅支持 0 或 1。');
    }

    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const target = this.parseTarget(resourcePath);
    if (!target) {
      return this.createNotFoundResponse('资源路径不存在。');
    }

    try {
      if (target.kind === 'root') {
        const knowledgeBases =
          await this.knowledgeBaseService.findAll(tenantScope);
        return this.createPropfindResponse([
          this.createRootResource(tenantId, knowledgeBases),
          ...(depth === 1
            ? knowledgeBases.map((knowledgeBase) =>
                this.createKnowledgeBaseResource(
                  tenantId,
                  knowledgeBase,
                  knowledgeBases,
                ),
              )
            : []),
        ]);
      }

      const knowledgeBases = await this.knowledgeBaseService.findAll(tenantScope);
      const knowledgeBase = this.resolveKnowledgeBaseByPathSegment(
        target.knowledgeBaseId,
        knowledgeBases,
      );
      if (!knowledgeBase) {
        throw new NotFoundException(`知识库 ${target.knowledgeBaseId} 不存在或无权访问`);
      }
      const knowledgeNodes = await this.knowledgeTreeService.findByKb(
        knowledgeBase.id,
        tenantScope,
      );
      const knowledgeBasePathSegment = this.resolveKnowledgeBasePathSegment(
        knowledgeBase,
        knowledgeBases,
      );

      if (target.kind === 'knowledge-base') {
        return this.createPropfindResponse([
          this.createKnowledgeBaseResource(
            tenantId,
            knowledgeBase,
            knowledgeBases,
          ),
          ...(depth === 1
            ? this.buildKnowledgeBaseChildren(
                tenantId,
                knowledgeBasePathSegment,
                knowledgeBase,
                knowledgeNodes,
                authResult.principal,
              )
            : []),
        ]);
      }

      const nodeResolution = this.resolveNodePath(
        target.nodeSegments,
        knowledgeNodes,
      );
      if (!nodeResolution.ok) {
        return this.createNotFoundResponse('资源路径不存在。');
      }
      if (!this.canReadNode(nodeResolution.node, authResult.principal)) {
        return this.createNotFoundResponse('资源路径不存在。');
      }

      const nodeResource = this.createKnowledgeNodeResource(
        tenantId,
        knowledgeBase.id,
        knowledgeBasePathSegment,
        nodeResolution.node,
        knowledgeNodes,
      );

      return this.createPropfindResponse([
        nodeResource,
        ...(depth === 1
          ? this.buildKnowledgeNodeChildren(
              tenantId,
              knowledgeBase.id,
              knowledgeBasePathSegment,
              nodeResolution.node.id,
              knowledgeNodes,
              authResult.principal,
            )
          : []),
      ]);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.createNotFoundResponse('资源路径不存在。');
      }

      return this.createInternalServerErrorResponse('WebDAV 资源读取失败。');
    }
  }

  private async resolvePrincipal(
    request: Request,
    tenantId: string,
  ): Promise<
    { ok: true; principal: Principal } | { ok: false; response: WebdavResponse }
  > {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Basic ')) {
      return { ok: false, response: this.createUnauthorizedResponse() };
    }

    const decoded = this.decodeBasicAuthorization(authorization);
    if (!decoded || decoded.username !== tenantId) {
      return { ok: false, response: this.createUnauthorizedResponse() };
    }

    try {
      const principal =
        await this.capabilityCredentialService.resolvePrincipalFromApiKey(
          decoded.password,
          'service',
        );

      if (!principal.tenantId || principal.tenantId !== tenantId) {
        return { ok: false, response: this.createUnauthorizedResponse() };
      }

      return {
        ok: true,
        principal,
      };
    } catch {
      return { ok: false, response: this.createUnauthorizedResponse() };
    }
  }

  private async attachTenantContext(
    request: AuthenticatedRequest,
    principal: Principal,
  ): Promise<TenantContextHandle> {
    if (!principal.tenantId) {
      return { ok: false, response: this.createUnauthorizedResponse() };
    }

    const config =
      await this.tenantCacheService.getIsolationConfigByTenantRecordId(
        principal.tenantId,
      );

    if (!config) {
      return {
        ok: false,
        response: this.createNotFoundResponse('租户不存在。'),
      };
    }

    request.tenantScope = config.tenantId;
    request.tenantDataSource = undefined;
    request.tenantQueryRunner = undefined;

    if (config.level === TenantIsolationLevel.LARGE) {
      if (!config.dbConfig) {
        return {
          ok: false,
          response: this.createInternalServerErrorResponse(
            `LARGE 租户缺少独立库配置：${config.tenantId}`,
          ),
        };
      }

      request.tenantDataSource =
        await this.dynamicDataSourceService.getTenantDataSource(
          config.tenantId,
          config.dbConfig,
        );
      return { ok: true, tenantScope: config.tenantId };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    const schemaName = `tenant_${config.tenantId.replace(/-/g, '_')}`;

    if (config.level === TenantIsolationLevel.MEDIUM) {
      await queryRunner.query(`SET search_path TO "${schemaName}", public`);
    } else {
      await queryRunner.query('SET search_path TO public');
    }

    request.tenantQueryRunner = queryRunner;
    return { ok: true, tenantScope: config.tenantId };
  }

  private createOptionsResponse(): WebdavResponse {
    return {
      status: 200,
      headers: {
        Allow: WEBDAV_ALLOW,
        DAV: WEBDAV_DAV,
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: '',
    };
  }

  private createMethodNotAllowedResponse(): WebdavResponse {
    return {
      status: 405,
      headers: {
        Allow: WEBDAV_ALLOW,
        DAV: WEBDAV_DAV,
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: '当前仅支持 OPTIONS、PROPFIND、GET、HEAD、MKCOL、PUT、DELETE 和 MOVE。',
    };
  }

  private createBadRequestResponse(message: string): WebdavResponse {
    return {
      status: 400,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createUnauthorizedResponse(): WebdavResponse {
    return {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="${WEBDAV_REALM}", charset="UTF-8"`,
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: 'Unauthorized',
    };
  }

  private createForbiddenResponse(message: string): WebdavResponse {
    return {
      status: 403,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createNotFoundResponse(message: string): WebdavResponse {
    return {
      status: 404,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createCreatedResponse(
    headers: Record<string, string> = {},
  ): WebdavResponse {
    return {
      status: 201,
      headers: {
        ...headers,
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: '',
    };
  }

  private createNoContentResponse(
    headers: Record<string, string> = {},
  ): WebdavResponse {
    return {
      status: 204,
      headers: {
        ...headers,
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: '',
    };
  }

  private createPayloadTooLargeResponse(message: string): WebdavResponse {
    return {
      status: 413,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createUnsupportedMediaTypeResponse(message: string): WebdavResponse {
    return {
      status: 415,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createConflictResponse(message: string): WebdavResponse {
    return {
      status: 409,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createPreconditionFailedResponse(message: string): WebdavResponse {
    return {
      status: 412,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createInternalServerErrorResponse(message: string): WebdavResponse {
    return {
      status: 500,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createBadGatewayResponse(message: string): WebdavResponse {
    return {
      status: 502,
      headers: {
        'Content-Type': WEBDAV_TEXT_CONTENT_TYPE,
      },
      body: message,
    };
  }

  private createPropfindResponse(resources: WebdavResource[]): WebdavResponse {
    const xml = this.renderMultiStatusXml(resources);
    return {
      status: 207,
      headers: {
        'Content-Type': WEBDAV_XML_CONTENT_TYPE,
      },
      body: xml,
    };
  }

  private parseTarget(
    resourcePath?: string,
  ):
    | WebdavTargetRoot
    | WebdavTargetKnowledgeBase
    | WebdavTargetKnowledgeNode
    | null {
    const segments = this.normalizePathSegments(resourcePath);
    if (segments.length === 0) {
      return { kind: 'root' };
    }

    if (segments.length === 1) {
      return { kind: 'knowledge-base', knowledgeBaseId: segments[0] };
    }

    return {
      kind: 'knowledge-node',
      knowledgeBaseId: segments[0],
      nodeSegments: segments.slice(1),
    };
  }

  private normalizePathSegments(resourcePath?: string | string[]) {
    const normalized = Array.isArray(resourcePath)
      ? resourcePath.join('/')
      : (resourcePath ?? '');

    return normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  }

  private validateResourcePath(resourcePath?: string | string[]) {
    const normalized = Array.isArray(resourcePath)
      ? resourcePath.join('/')
      : (resourcePath ?? '');
    if (!normalized) {
      return null;
    }

    const rawSegments = normalized.split('/');
    for (let index = 0; index < rawSegments.length; index += 1) {
      const rawSegment = rawSegments[index];
      if (!rawSegment) {
        if (index !== 0 && index !== rawSegments.length - 1) {
          return '资源路径不能包含空名称。';
        }
        continue;
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(rawSegment);
      } catch {
        return '资源路径包含非法 URL 编码。';
      }

      if (!decoded.trim()) {
        return '资源路径不能包含空名称。';
      }
      if (decoded.length > WEBDAV_MAX_PATH_SEGMENT_LENGTH) {
        return `资源路径单段名称不能超过 ${WEBDAV_MAX_PATH_SEGMENT_LENGTH} 个字符。`;
      }
      if (WEBDAV_RESERVED_PATH_SEGMENTS.has(decoded)) {
        return '资源路径不能使用保留名称。';
      }
      if (decoded.includes('/') || decoded.includes('\\')) {
        return '资源路径单段名称不能包含路径分隔符。';
      }
    }

    return null;
  }

  private resolveDepth(depthHeader: string | undefined): 0 | 1 | null {
    const normalized = (depthHeader ?? '0').trim();
    if (normalized === '0') return 0;
    if (normalized === '1') return 1;
    return null;
  }

  private decodeBasicAuthorization(authorization: string) {
    const encoded = authorization.slice('Basic '.length).trim();
    if (!encoded) {
      return null;
    }

    let decoded: string;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  }

  private createRootResource(
    tenantId: string,
    knowledgeBases: Array<{
      id: string;
      name: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ): WebdavResource {
    const lastModified = this.resolveLatestDate(
      knowledgeBases.map((knowledgeBase) => knowledgeBase.updatedAt),
    );

    return {
      href: this.toHref(tenantId, [], true),
      displayName: tenantId,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      etag: this.toEtag(
        'root',
        tenantId,
        knowledgeBases.length,
        lastModified.getTime(),
      ),
      lastModified,
      createdAt: lastModified,
      contentLength: 0,
    };
  }

  private createKnowledgeBaseResource(
    tenantId: string,
    knowledgeBase: WebdavKnowledgeBaseLike,
    knowledgeBases: WebdavKnowledgeBaseLike[],
  ): WebdavResource {
    return {
      href: this.toHref(
        tenantId,
        [this.resolveKnowledgeBasePathSegment(knowledgeBase, knowledgeBases)],
        true,
      ),
      displayName: knowledgeBase.name,
      isCollection: true,
      contentType: 'httpd/unix-directory',
      etag: this.toEtag(
        'knowledge-base',
        tenantId,
        knowledgeBase.id,
        knowledgeBase.updatedAt.toISOString(),
      ),
      lastModified: knowledgeBase.updatedAt,
      createdAt: knowledgeBase.createdAt,
      contentLength: 0,
    };
  }

  private buildKnowledgeBaseChildren(
    tenantId: string,
    knowledgeBasePathSegment: string,
    knowledgeBase: WebdavKnowledgeBaseLike,
    knowledgeNodes: WebdavKnowledgeNode[],
    principal: Principal,
  ) {
    return knowledgeNodes
      .filter((node) => node.parentId === null)
      .filter((node) => this.canReadNode(node, principal))
      .map((node) =>
        this.createKnowledgeNodeResource(
          tenantId,
          knowledgeBase.id,
          knowledgeBasePathSegment,
          node,
          knowledgeNodes,
        ),
      );
  }

  private buildKnowledgeNodeChildren(
    tenantId: string,
    kbId: string,
    knowledgeBasePathSegment: string,
    parentNodeId: string,
    knowledgeNodes: WebdavKnowledgeNode[],
    principal: Principal,
  ) {
    return knowledgeNodes
      .filter((node) => node.parentId === parentNodeId)
      .filter((node) => this.canReadNode(node, principal))
      .map((node) =>
        this.createKnowledgeNodeResource(
          tenantId,
          kbId,
          knowledgeBasePathSegment,
          node,
          knowledgeNodes,
        ),
      );
  }

  private createKnowledgeNodeResource(
    tenantId: string,
    kbId: string,
    knowledgeBasePathSegment: string,
    node: WebdavKnowledgeNode,
    knowledgeNodes: WebdavKnowledgeNode[],
    nodeSegments: string[] = this.resolveNodePathSegments(node, knowledgeNodes),
  ): WebdavResource {
    const isCollection = this.isCollectionNode(node, knowledgeNodes);
    const lastModified = node.updatedAt;
    return {
      href: this.toHref(
        tenantId,
        [knowledgeBasePathSegment, ...nodeSegments],
        isCollection,
      ),
      displayName: node.name,
      isCollection,
      contentType: isCollection
        ? 'httpd/unix-directory'
        : WEBDAV_MARKDOWN_CONTENT_TYPE,
      etag: this.toEtag(
        'knowledge-node',
        tenantId,
        kbId,
        node.id,
        node.updatedAt.toISOString(),
      ),
      lastModified,
      createdAt: node.createdAt,
      contentLength: 0,
    };
  }

  private resolveNodePath(
    nodeSegments: string[],
    knowledgeNodes: WebdavKnowledgeNode[],
  ): { ok: true; node: WebdavKnowledgeNode } | { ok: false } {
    let parentId: string | null = null;
    let current: WebdavKnowledgeNode | undefined;

    for (const segment of nodeSegments) {
      current = knowledgeNodes.find(
        (node) =>
          node.parentId === parentId &&
          (node.id === segment || node.name === segment),
      );
      if (!current) {
        return { ok: false };
      }
      parentId = current.id;
    }

    return current ? { ok: true, node: current } : { ok: false };
  }

  private async buildReadResponse(
    principal: Principal,
    tenantScope: string,
    method: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const target = this.parseTarget(resourcePath);
    if (!target) {
      return this.createNotFoundResponse('资源路径不存在。');
    }

    if (target.kind !== 'knowledge-node') {
      return this.createMethodNotAllowedResponse();
    }

    const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
      target.knowledgeBaseId,
      tenantScope,
    );
    const knowledgeNodes = await this.knowledgeTreeService.findByKb(
      knowledgeBase.id,
      tenantScope,
    );
    const nodeResolution = this.resolveNodePath(
      target.nodeSegments,
      knowledgeNodes,
    );
    if (!nodeResolution.ok) {
      return this.createNotFoundResponse('资源路径不存在。');
    }
    if (!this.canReadNode(nodeResolution.node, principal)) {
      return this.createNotFoundResponse('资源路径不存在。');
    }

    const node = nodeResolution.node;
    if (!this.isDocumentNode(node)) {
      return this.createMethodNotAllowedResponse();
    }

    const commonHeaders: Record<string, string> = {
      'Content-Type': WEBDAV_MARKDOWN_CONTENT_TYPE,
      ETag: this.toEtag(
        'webdav-content',
        tenantScope,
        knowledgeBase.id,
        node.id,
        node.updatedAt.toISOString(),
      ),
      'Last-Modified': node.updatedAt.toUTCString(),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(node.name)}`,
    };

    if (method === 'HEAD') {
      return {
        status: 200,
        headers: commonHeaders,
        body: '',
      };
    }

    const contentStream = await this.readOpenVikingContentStream(
      principal,
      node.contentUri ?? node.vikingUri ?? '',
      node.vikingUri ?? '',
    );
    if (!contentStream) {
      return this.createBadGatewayResponse('WebDAV 正文读取失败。');
    }
    if (contentStream.contentType) {
      commonHeaders['Content-Type'] = contentStream.contentType;
    }
    if (contentStream.contentLength) {
      commonHeaders['Content-Length'] = contentStream.contentLength;
    }

    return {
      status: 200,
      headers: commonHeaders,
      body: contentStream.stream,
    };
  }

  private async buildMkcolResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const roleError = this.validateWriteRole(principal);
    if (roleError) {
      return this.createForbiddenResponse(roleError);
    }

    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const segments = this.normalizePathSegments(resourcePath);
    if (segments.length === 1) {
      return this.createKnowledgeBaseFromRoot(
        request,
        principal,
        tenantScope,
        segments[0],
        resourcePath,
      );
    }
    if (segments.length < 2) {
      return this.createMethodNotAllowedResponse();
    }

    const directoryName = segments[segments.length - 1];
    const parentTarget = this.parseTarget(segments.slice(0, -1).join('/'));
    if (!parentTarget || parentTarget.kind === 'root') {
      return this.createConflictResponse('父目录不存在。');
    }

    try {
      const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
        parentTarget.knowledgeBaseId,
        tenantScope,
      );
      const knowledgeNodes = await this.knowledgeTreeService.findByKb(
        knowledgeBase.id,
        tenantScope,
      );
      const parentResolution = this.resolveMkcolParent(
        parentTarget,
        knowledgeNodes,
        principal,
      );
      if (!parentResolution.ok) {
        return parentResolution.response;
      }

      const conflictNode = knowledgeNodes.find(
        (node) =>
          node.parentId === parentResolution.parentId &&
          node.name === directoryName,
      );
      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        Boolean(conflictNode),
        conflictNode
          ? this.resolveNodeEtags(tenantScope, knowledgeBase.id, conflictNode)
          : [],
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }
      if (conflictNode) {
        return this.createConflictResponse('同级目录已存在同名资源。');
      }

      const created = await this.knowledgeTreeService.create({
        kbId: knowledgeBase.id,
        parentId: parentResolution.parentId ?? undefined,
        name: directoryName,
        sortOrder: this.resolveNextSortOrder(
          knowledgeNodes,
          parentResolution.parentId,
        ),
        tenantId: tenantScope,
      });

      await this.auditService.log({
        tenantId: tenantScope,
        userId: principal.userId,
        username: principal.username,
        action: 'webdav_mkcol',
        target: created.id,
        meta: {
          kbId: created.kbId,
          parentId: created.parentId,
          name: created.name,
          path: resourcePath ?? '',
          credentialType: principal.credentialType,
          clientType: principal.clientType,
          requestId: request.header('x-request-id'),
        },
        ip: request.ip,
      });

      return this.createCreatedResponse();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.createConflictResponse('父目录不存在。');
      }
      return this.createInternalServerErrorResponse('WebDAV 目录创建失败。');
    }
  }

  private async buildPutResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const roleError = this.validateWriteRole(principal);
    if (roleError) {
      return this.createForbiddenResponse(roleError);
    }

    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const segments = this.normalizePathSegments(resourcePath);
    if (this.isWriteProbePath(segments)) {
      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        false,
        [],
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }
      return this.createCreatedResponse();
    }

    const bodyResult = await this.readRequestBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    if (segments.length < 2) {
      return this.createMethodNotAllowedResponse();
    }

    const target = this.parseTarget(resourcePath);
    if (!target || target.kind !== 'knowledge-node') {
      return this.createMethodNotAllowedResponse();
    }

    let createdNodeId: string | null = null;
    let shouldCleanupCreatedNode = false;
    try {
      const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
        target.knowledgeBaseId,
        tenantScope,
      );
      const knowledgeNodes = await this.knowledgeTreeService.findByKb(
        knowledgeBase.id,
        tenantScope,
      );

      const existingTarget = this.resolveExistingPutTarget(
        target,
        knowledgeNodes,
        principal,
      );
      if (!existingTarget.ok) {
        if (existingTarget.response) {
          return existingTarget.response;
        }
      } else {
        const preconditionResponse = this.evaluateWritePreconditions(
          request,
          true,
          this.resolveNodeEtags(
            tenantScope,
            knowledgeBase.id,
            existingTarget.node,
          ),
        );
        if (preconditionResponse) {
          return preconditionResponse;
        }
        return this.overwritePutFile({
          request,
          principal,
          tenantScope,
          resourcePath,
          knowledgeBaseId: knowledgeBase.id,
          node: existingTarget.node,
          body: bodyResult.body,
        });
      }

      const fileName = segments[segments.length - 1];
      const fileExtension = this.resolveWritableFileExtension(fileName);
      if (fileExtension === null) {
        return this.createUnsupportedMediaTypeResponse(
          'WebDAV 当前不支持该文件格式。',
        );
      }

      const parentTarget = this.parseTarget(segments.slice(0, -1).join('/'));
      if (!parentTarget || parentTarget.kind === 'root') {
        return this.createConflictResponse('父目录不存在。');
      }

      const parentResolution = this.resolveMkcolParent(
        parentTarget,
        knowledgeNodes,
        principal,
      );
      if (!parentResolution.ok) {
        return parentResolution.response;
      }

      const conflictNode = knowledgeNodes.find(
        (node) =>
          node.parentId === parentResolution.parentId && node.name === fileName,
      );
      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        Boolean(conflictNode),
        conflictNode
          ? this.resolveNodeEtags(tenantScope, knowledgeBase.id, conflictNode)
          : [],
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }
      if (conflictNode) {
        return this.createConflictResponse('同级目录已存在同名资源。');
      }

      const created = await this.knowledgeTreeService.createFile({
        kbId: knowledgeBase.id,
        parentId: parentResolution.parentId ?? undefined,
        name: fileName,
        path: segments.slice(1).join('/'),
        sortOrder: this.resolveNextSortOrder(
          knowledgeNodes,
          parentResolution.parentId,
        ),
        tenantId: tenantScope,
        fileExtension,
      });
      createdNodeId = created.id;
      shouldCleanupCreatedNode = true;
      if (!created.vikingUri) {
        throw new Error('WebDAV 文件节点缺少资源 URI。');
      }

      const uploadFile: LocalImportUploadFile = {
        ...this.createLocalImportFile(fileName, bodyResult.body),
      };
      const task = await this.importTaskService.createLocalUpload(
        {
          kbId: knowledgeBase.id,
          targetUri: created.vikingUri ?? undefined,
        },
        [uploadFile],
        tenantScope,
      );
      shouldCleanupCreatedNode = false;

      await this.auditService.log({
        tenantId: tenantScope,
        userId: principal.userId,
        username: principal.username,
        action: 'webdav_put_create',
        target: created.id,
        meta: {
          taskId: task.id,
          kbId: created.kbId,
          parentId: created.parentId,
          name: created.name,
          path: resourcePath ?? '',
          vikingUri: created.vikingUri,
          credentialType: principal.credentialType,
          clientType: principal.clientType,
          requestId: request.header('x-request-id'),
        },
        ip: request.ip,
      });

      return this.createCreatedResponse({
        'X-OpenViking-Import-Task-Id': task.id,
      });
    } catch (error) {
      if (createdNodeId && shouldCleanupCreatedNode) {
        await this.knowledgeTreeService.remove(createdNodeId, tenantScope);
      }
      if (error instanceof NotFoundException) {
        return this.createConflictResponse('父目录不存在。');
      }
      if (error instanceof HttpException) {
        return this.createConflictResponse(error.message);
      }
      return this.createInternalServerErrorResponse('WebDAV 文件创建失败。');
    }
  }

  private resolveExistingPutTarget(
    target: WebdavTargetKnowledgeNode,
    knowledgeNodes: WebdavKnowledgeNode[],
    principal: Principal,
  ):
    | { ok: true; node: WebdavKnowledgeNode }
    | { ok: false; response?: WebdavResponse } {
    const nodeResolution = this.resolveNodePath(
      target.nodeSegments,
      knowledgeNodes,
    );
    if (!nodeResolution.ok) {
      return { ok: false };
    }

    if (!this.canReadNode(nodeResolution.node, principal)) {
      return {
        ok: false,
        response: this.createNotFoundResponse('资源路径不存在。'),
      };
    }

    const hasChildren = knowledgeNodes.some(
      (child) => child.parentId === nodeResolution.node.id,
    );
    if (!this.isDocumentNode(nodeResolution.node) || hasChildren) {
      return {
        ok: false,
        response: this.createConflictResponse('目标路径不是可写文件。'),
      };
    }

    if (this.resolveWritableFileExtension(nodeResolution.node.name) === null) {
      return {
        ok: false,
        response: this.createUnsupportedMediaTypeResponse(
          'WebDAV 当前不支持该文件格式。',
        ),
      };
    }

    return { ok: true, node: nodeResolution.node };
  }

  private async overwritePutFile(input: {
    request: Request;
    principal: Principal;
    tenantScope: string;
    resourcePath: string | undefined;
    knowledgeBaseId: string;
    node: WebdavKnowledgeNode;
    body: Buffer;
  }): Promise<WebdavResponse> {
    const task = await this.importTaskService.createLocalUpload(
      {
        kbId: input.knowledgeBaseId,
        targetUri: input.node.vikingUri ?? undefined,
      },
      [this.createLocalImportFile(input.node.name, input.body)],
      input.tenantScope,
    );
    const touched = await this.knowledgeTreeService.touch(
      input.node.id,
      input.tenantScope,
    );

    await this.auditService.log({
      tenantId: input.tenantScope,
      userId: input.principal.userId,
      username: input.principal.username,
      action: 'webdav_put_update',
      target: input.node.id,
      meta: {
        taskId: task.id,
        kbId: input.knowledgeBaseId,
        parentId: input.node.parentId,
        name: input.node.name,
        path: input.resourcePath ?? '',
        vikingUri: input.node.vikingUri,
        updatedAt: touched.updatedAt.toISOString(),
        credentialType: input.principal.credentialType,
        clientType: input.principal.clientType,
        requestId: input.request.header('x-request-id'),
      },
      ip: input.request.ip,
    });

    return this.createNoContentResponse({
      'X-OpenViking-Import-Task-Id': task.id,
    });
  }

  private async buildDeleteResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const roleError = this.validateWriteRole(principal);
    if (roleError) {
      return this.createForbiddenResponse(roleError);
    }

    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const segments = this.normalizePathSegments(resourcePath);
    if (this.isWriteProbePath(segments)) {
      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        true,
        [],
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }
      return this.createNoContentResponse();
    }

    const target = this.parseTarget(resourcePath);
    if (
      !target ||
      (target.kind !== 'knowledge-node' && target.kind !== 'knowledge-base')
    ) {
      return this.createMethodNotAllowedResponse();
    }

    try {
      if (target.kind === 'knowledge-base') {
        return await this.buildDeleteKnowledgeBaseResponse(
          request,
          principal,
          tenantScope,
          resourcePath,
          target,
        );
      }

      const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
        target.knowledgeBaseId,
        tenantScope,
      );
      const knowledgeNodes = await this.knowledgeTreeService.findByKb(
        knowledgeBase.id,
        tenantScope,
      );
      const nodeResolution = this.resolveNodePath(
        target.nodeSegments,
        knowledgeNodes,
      );
      if (!nodeResolution.ok) {
        return this.createNotFoundResponse('资源路径不存在。');
      }
      if (!this.canReadNode(nodeResolution.node, principal)) {
        return this.createNotFoundResponse('资源路径不存在。');
      }

      const node = nodeResolution.node;
      const hasChildren = knowledgeNodes.some(
        (child) => child.parentId === node.id,
      );
      if (hasChildren) {
        return this.createConflictResponse('只能删除空目录或叶子文件。');
      }

      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        true,
        this.resolveNodeEtags(tenantScope, knowledgeBase.id, node),
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }

      try {
        await this.knowledgeTreeService.remove(node.id, tenantScope, {
          ovConfig: principal.ovConfig,
          user: this.resolveOpenVikingUser(principal),
        });
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        if (error instanceof HttpException) {
          return this.createBadGatewayResponse('WebDAV 下游资源删除失败。');
        }
        throw error;
      }
      await this.auditService.log({
        tenantId: tenantScope,
        userId: principal.userId,
        username: principal.username,
        action: 'webdav_delete',
        target: node.id,
        meta: {
          kbId: knowledgeBase.id,
          parentId: node.parentId,
          name: node.name,
          path: resourcePath ?? '',
          vikingUri: node.vikingUri,
          credentialType: principal.credentialType,
          clientType: principal.clientType,
          requestId: request.header('x-request-id'),
        },
        ip: request.ip,
      });

      return this.createNoContentResponse();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.createNotFoundResponse('资源路径不存在。');
      }
      return this.createInternalServerErrorResponse('WebDAV 资源删除失败。');
    }
  }

  private async buildDeleteKnowledgeBaseResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    resourcePath: string | undefined,
    target: WebdavTargetKnowledgeBase,
  ) {
    const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
      target.knowledgeBaseId,
      tenantScope,
    );

    const preconditionResponse = this.evaluateWritePreconditions(
      request,
      true,
      this.resolveKnowledgeBaseEtags(tenantScope, knowledgeBase),
    );
    if (preconditionResponse) {
      return preconditionResponse;
    }

    try {
      await this.knowledgeBaseService.remove(knowledgeBase.id, tenantScope, {
        ovConfig: principal.ovConfig,
        user: this.resolveOpenVikingUser(principal),
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof HttpException) {
        return this.createBadGatewayResponse('WebDAV 下游资源删除失败。');
      }
      throw error;
    }

    await this.auditService.log({
      tenantId: tenantScope,
      userId: principal.userId,
      username: principal.username,
      action: 'webdav_delete',
      target: knowledgeBase.id,
      meta: {
        resourceKind: 'knowledge-base',
        kbId: knowledgeBase.id,
        parentId: null,
        name: knowledgeBase.name,
        path: resourcePath ?? '',
        credentialType: principal.credentialType,
        clientType: principal.clientType,
        requestId: request.header('x-request-id'),
      },
      ip: request.ip,
    });

    return this.createNoContentResponse();
  }

  private async buildMoveResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    tenantId: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const roleError = this.validateWriteRole(principal);
    if (roleError) {
      return this.createForbiddenResponse(roleError);
    }

    const pathError = this.validateResourcePath(resourcePath);
    if (pathError) {
      return this.createBadRequestResponse(pathError);
    }

    const destination = this.resolveDestinationResourcePath(request, tenantId);
    if (!destination.ok) {
      return destination.response;
    }
    const destinationPathError = this.validateResourcePath(
      destination.resourcePath,
    );
    if (destinationPathError) {
      return this.createBadRequestResponse(destinationPathError);
    }

    const sourceTarget = this.parseTarget(resourcePath);
    const destinationTarget = this.parseTarget(destination.resourcePath);
    if (!sourceTarget || !destinationTarget) {
      return this.createMethodNotAllowedResponse();
    }
    if (
      sourceTarget.kind === 'knowledge-base' ||
      destinationTarget.kind === 'knowledge-base'
    ) {
      if (
        sourceTarget.kind !== 'knowledge-base' ||
        destinationTarget.kind !== 'knowledge-base'
      ) {
        return this.createMethodNotAllowedResponse();
      }

      return this.buildMoveKnowledgeBaseResponse(
        request,
        principal,
        tenantScope,
        resourcePath,
        destination.resourcePath,
        sourceTarget,
        destinationTarget,
      );
    }
    if (
      sourceTarget.kind !== 'knowledge-node' ||
      destinationTarget.kind !== 'knowledge-node'
    ) {
      return this.createMethodNotAllowedResponse();
    }
    if (sourceTarget.knowledgeBaseId !== destinationTarget.knowledgeBaseId) {
      return this.createConflictResponse('MOVE 仅支持同一知识库内移动资源。');
    }

    try {
      const knowledgeBase = await this.requireKnowledgeBaseForPathSegment(
        sourceTarget.knowledgeBaseId,
        tenantScope,
      );
      const knowledgeNodes = await this.knowledgeTreeService.findByKb(
        knowledgeBase.id,
        tenantScope,
      );
      const sourceResolution = this.resolveNodePath(
        sourceTarget.nodeSegments,
        knowledgeNodes,
      );
      if (!sourceResolution.ok) {
        return this.createNotFoundResponse('资源路径不存在。');
      }
      if (!this.canReadNode(sourceResolution.node, principal)) {
        return this.createNotFoundResponse('资源路径不存在。');
      }

      const destinationSegments = this.normalizePathSegments(
        destination.resourcePath,
      );
      const destinationName =
        destinationSegments[destinationSegments.length - 1];
      const parentTarget = this.parseTarget(
        destinationSegments.slice(0, -1).join('/'),
      );
      if (!destinationName || !parentTarget || parentTarget.kind === 'root') {
        return this.createConflictResponse('目标父目录不存在。');
      }

      const parentResolution = this.resolveMkcolParent(
        parentTarget,
        knowledgeNodes,
        principal,
      );
      if (!parentResolution.ok) {
        return parentResolution.response;
      }

      const source = sourceResolution.node;
      const preconditionResponse = this.evaluateWritePreconditions(
        request,
        true,
        this.resolveNodeEtags(tenantScope, knowledgeBase.id, source),
      );
      if (preconditionResponse) {
        return preconditionResponse;
      }

      const destinationParentId = parentResolution.parentId;
      const normalizedSourcePath =
        this.normalizePathSegments(resourcePath).join('/');
      if (normalizedSourcePath === destinationSegments.join('/')) {
        return this.createNoContentResponse();
      }
      if (
        destinationParentId === source.id ||
        this.isDescendantParent(source.id, destinationParentId, knowledgeNodes)
      ) {
        return this.createConflictResponse('不能将资源移动到自身或子节点下。');
      }

      const sourceIsCollection = this.isCollectionNode(source, knowledgeNodes);
      if (
        !sourceIsCollection &&
        this.resolveWritableFileExtension(destinationName) === null
      ) {
        return this.createUnsupportedMediaTypeResponse(
          'WebDAV 当前不支持该文件格式。',
        );
      }

      const destinationResolution = this.resolveNodePath(
        destinationTarget.nodeSegments,
        knowledgeNodes,
      );
      if (
        destinationResolution.ok &&
        destinationResolution.node.id !== source.id
      ) {
        return this.createConflictResponse('目标路径已存在资源。');
      }

      const hasNameConflict = knowledgeNodes.some(
        (node) =>
          node.id !== source.id &&
          node.parentId === destinationParentId &&
          node.name === destinationName,
      );
      if (hasNameConflict) {
        return this.createConflictResponse('同级目录已存在同名资源。');
      }

      const sortOrder =
        source.parentId === destinationParentId
          ? source.sortOrder
          : this.resolveNextSortOrder(knowledgeNodes, destinationParentId);
      const nextPath = sourceIsCollection
        ? null
        : destinationSegments.slice(1).join('/');

      const moved = await this.knowledgeTreeService.update(
        source.id,
        {
          name: destinationName,
          parentId: destinationParentId,
          sortOrder,
          path: nextPath,
        },
        tenantScope,
      );

      await this.auditService.log({
        tenantId: tenantScope,
        userId: principal.userId,
        username: principal.username,
        action: 'webdav_move',
        target: moved.id,
        meta: {
          kbId: knowledgeBase.id,
          previousParentId: source.parentId,
          parentId: moved.parentId,
          previousName: source.name,
          name: moved.name,
          sourcePath: resourcePath ?? '',
          destinationPath: destination.resourcePath,
          vikingUri: moved.vikingUri,
          credentialType: principal.credentialType,
          clientType: principal.clientType,
          requestId: request.header('x-request-id'),
        },
        ip: request.ip,
      });

      return this.createCreatedResponse();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return this.createNotFoundResponse('资源路径不存在。');
      }
      if (error instanceof HttpException) {
        return this.createConflictResponse(error.message);
      }
      return this.createInternalServerErrorResponse('WebDAV 资源移动失败。');
    }
  }

  private async buildMoveKnowledgeBaseResponse(
    request: Request,
    principal: Principal,
    tenantScope: string,
    resourcePath: string | undefined,
    destinationResourcePath: string,
    sourceTarget: WebdavTargetKnowledgeBase,
    destinationTarget: WebdavTargetKnowledgeBase,
  ) {
    const knowledgeBases = await this.knowledgeBaseService.findAll(tenantScope);
    const knowledgeBase = this.resolveKnowledgeBaseByPathSegment(
      sourceTarget.knowledgeBaseId,
      knowledgeBases,
    );
    if (!knowledgeBase) {
      throw new NotFoundException(
        `知识库 ${sourceTarget.knowledgeBaseId} 不存在或无权访问`,
      );
    }

    const preconditionResponse = this.evaluateWritePreconditions(
      request,
      true,
      this.resolveKnowledgeBaseEtags(tenantScope, knowledgeBase),
    );
    if (preconditionResponse) {
      return preconditionResponse;
    }

    const normalizedSourcePath = this.normalizePathSegments(resourcePath).join('/');
    const normalizedDestinationPath =
      this.normalizePathSegments(destinationResourcePath).join('/');
    const destinationKnowledgeBase = this.resolveKnowledgeBaseByPathSegment(
      destinationTarget.knowledgeBaseId,
      knowledgeBases,
    );

    if (
      normalizedSourcePath === normalizedDestinationPath ||
      destinationKnowledgeBase?.id === knowledgeBase.id
    ) {
      return this.createNoContentResponse();
    }
    if (destinationKnowledgeBase) {
      return this.createConflictResponse('目标路径已存在资源。');
    }

    const moved = await this.knowledgeBaseService.update(
      knowledgeBase.id,
      { name: destinationTarget.knowledgeBaseId },
      tenantScope,
    );

    await this.auditService.log({
      tenantId: tenantScope,
      userId: principal.userId,
      username: principal.username,
      action: 'webdav_move',
      target: moved.id,
      meta: {
        resourceKind: 'knowledge-base',
        kbId: moved.id,
        previousParentId: null,
        parentId: null,
        previousName: knowledgeBase.name,
        name: moved.name,
        sourcePath: resourcePath ?? '',
        destinationPath: destinationResourcePath,
        credentialType: principal.credentialType,
        clientType: principal.clientType,
        requestId: request.header('x-request-id'),
      },
      ip: request.ip,
    });

    return this.createCreatedResponse();
  }

  private createLocalImportFile(
    fileName: string,
    body: Buffer,
  ): LocalImportUploadFile {
    const fileExtension = extname(fileName).toLowerCase();
    return {
      originalname: fileName,
      mimetype:
        WEBDAV_TEXTLIKE_CONTENT_TYPES[fileExtension] ??
        'application/octet-stream',
      size: body.length,
      buffer: body,
    };
  }

  private resolveMkcolParent(
    parentTarget: Exclude<WebdavTarget, WebdavTargetRoot>,
    knowledgeNodes: WebdavKnowledgeNode[],
    principal: Principal,
  ):
    | { ok: true; parentId: string | null }
    | { ok: false; response: WebdavResponse } {
    if (parentTarget.kind === 'knowledge-base') {
      return { ok: true, parentId: null };
    }

    const nodeResolution = this.resolveNodePath(
      parentTarget.nodeSegments,
      knowledgeNodes,
    );
    if (!nodeResolution.ok) {
      return {
        ok: false,
        response: this.createConflictResponse('父目录不存在。'),
      };
    }

    if (!this.canReadNode(nodeResolution.node, principal)) {
      return {
        ok: false,
        response: this.createNotFoundResponse('资源路径不存在。'),
      };
    }

    const hasChildren = knowledgeNodes.some(
      (child) => child.parentId === nodeResolution.node.id,
    );
    if (!hasChildren && this.isDocumentNode(nodeResolution.node)) {
      return {
        ok: false,
        response: this.createConflictResponse('父路径不是目录。'),
      };
    }

    return { ok: true, parentId: nodeResolution.node.id };
  }

  private async createKnowledgeBaseFromRoot(
    request: Request,
    principal: Principal,
    tenantScope: string,
    knowledgeBaseName: string,
    resourcePath: string | undefined,
  ): Promise<WebdavResponse> {
    const knowledgeBases = await this.knowledgeBaseService.findAll(tenantScope);
    const conflictKnowledgeBase = this.resolveKnowledgeBaseByPathSegment(
      knowledgeBaseName,
      knowledgeBases,
    );
    const preconditionResponse = this.evaluateWritePreconditions(
      request,
      Boolean(conflictKnowledgeBase),
      conflictKnowledgeBase
        ? [
            this.toEtag(
              'knowledge-base',
              tenantScope,
              conflictKnowledgeBase.id,
              conflictKnowledgeBase.updatedAt.toISOString(),
            ),
          ]
        : [],
    );
    if (preconditionResponse) {
      return preconditionResponse;
    }
    if (conflictKnowledgeBase) {
      return this.createConflictResponse('租户根目录已存在同名知识库。');
    }

    const created = await this.knowledgeBaseService.create({
      name: knowledgeBaseName,
      description: '',
      tenantId: tenantScope,
    });

    await this.auditService.log({
      tenantId: tenantScope,
      userId: principal.userId,
      username: principal.username,
      action: 'webdav_mkcol',
      target: created.id,
      meta: {
        resourceKind: 'knowledge-base',
        kbId: created.id,
        parentId: null,
        name: created.name,
        path: resourcePath ?? '',
        credentialType: principal.credentialType,
        clientType: principal.clientType,
        requestId: request.header('x-request-id'),
      },
      ip: request.ip,
    });

    return this.createCreatedResponse();
  }

  private resolveKnowledgeBaseByPathSegment(
    segment: string,
    knowledgeBases: WebdavKnowledgeBaseLike[],
  ) {
    const byId = knowledgeBases.find((knowledgeBase) => knowledgeBase.id === segment);
    if (byId) {
      return byId;
    }

    return (
      knowledgeBases.find((knowledgeBase) => knowledgeBase.name === segment) ??
      null
    );
  }

  private resolveKnowledgeBasePathSegment(
    knowledgeBase: WebdavKnowledgeBaseLike,
    _knowledgeBases: WebdavKnowledgeBaseLike[],
  ) {
    return knowledgeBase.name;
  }

  private async requireKnowledgeBaseForPathSegment(
    targetSegment: string,
    tenantScope: string,
  ) {
    const knowledgeBases = await this.knowledgeBaseService.findAll(tenantScope);
    const knowledgeBase = this.resolveKnowledgeBaseByPathSegment(
      targetSegment,
      knowledgeBases,
    );
    if (!knowledgeBase) {
      throw new NotFoundException(`知识库 ${targetSegment} 不存在或无权访问`);
    }

    return knowledgeBase;
  }

  private resolveNodePathSegments(
    node: WebdavKnowledgeNode,
    knowledgeNodes: WebdavKnowledgeNode[],
  ) {
    const segments: string[] = [node.name];
    let parentId = node.parentId;

    while (parentId) {
      const parent = knowledgeNodes.find((candidate) => candidate.id === parentId);
      if (!parent) {
        break;
      }

      segments.unshift(parent.name);
      parentId = parent.parentId;
    }

    return segments;
  }

  private resolveDestinationResourcePath(
    request: Request,
    tenantId: string,
  ):
    | { ok: true; resourcePath: string }
    | { ok: false; response: WebdavResponse } {
    const destination = request.header('destination')?.trim();
    if (!destination) {
      return {
        ok: false,
        response: this.createBadRequestResponse('MOVE 缺少 Destination 头。'),
      };
    }

    let pathname: string;
    try {
      pathname = /^https?:\/\//i.test(destination)
        ? new URL(destination).pathname
        : destination.startsWith('/')
          ? destination
          : `/${destination}`;
    } catch {
      return {
        ok: false,
        response: this.createBadRequestResponse('Destination 不是有效路径。'),
      };
    }

    const webdavPrefix = `${WEBDAV_ROOT_PATH}/`;
    if (!pathname.startsWith(webdavPrefix)) {
      return {
        ok: false,
        response: this.createConflictResponse(
          'Destination 必须位于 WebDAV 租户路径内。',
        ),
      };
    }

    const rawSegments = pathname.slice(webdavPrefix.length).split('/');
    const decodedSegments: string[] = [];
    try {
      for (const segment of rawSegments) {
        if (segment) {
          decodedSegments.push(decodeURIComponent(segment));
        }
      }
    } catch {
      return {
        ok: false,
        response: this.createBadRequestResponse(
          'Destination 包含非法 URL 编码。',
        ),
      };
    }

    const destinationTenantId = decodedSegments.shift();
    if (destinationTenantId !== tenantId) {
      return {
        ok: false,
        response: this.createForbiddenResponse('不能跨租户移动 WebDAV 资源。'),
      };
    }

    return { ok: true, resourcePath: decodedSegments.join('/') };
  }

  private isCollectionNode(
    node: WebdavKnowledgeNode,
    knowledgeNodes: WebdavKnowledgeNode[],
  ) {
    if (node.kind === 'collection') {
      return true;
    }
    if (node.kind === 'document') {
      return false;
    }

    const hasChildren = knowledgeNodes.some(
      (child) => child.parentId === node.id,
    );
    return (
      hasChildren ||
      !node.vikingUri ||
      this.isDirectoryVikingUri(node.vikingUri)
    );
  }

  private isDocumentNode(node: WebdavKnowledgeNode) {
    if (node.kind === 'document') {
      return true;
    }
    if (node.kind === 'collection') {
      return false;
    }

    return Boolean(node.vikingUri && !this.isDirectoryVikingUri(node.vikingUri));
  }

  private isDescendantParent(
    sourceNodeId: string,
    parentId: string | null,
    knowledgeNodes: WebdavKnowledgeNode[],
  ) {
    let currentParentId = parentId;
    while (currentParentId) {
      if (currentParentId === sourceNodeId) {
        return true;
      }
      const parent = knowledgeNodes.find((node) => node.id === currentParentId);
      currentParentId = parent?.parentId ?? null;
    }

    return false;
  }

  private evaluateWritePreconditions(
    request: Request,
    resourceExists: boolean,
    currentEtags: string[],
  ) {
    const ifMatch = this.parseEtags(request.header('if-match'));
    if (
      ifMatch.length > 0 &&
      !this.etagListMatches(ifMatch, resourceExists, currentEtags)
    ) {
      return this.createPreconditionFailedResponse('If-Match 条件不满足。');
    }

    const ifNoneMatch = this.parseEtags(request.header('if-none-match'));
    if (
      ifNoneMatch.length > 0 &&
      this.etagListMatches(ifNoneMatch, resourceExists, currentEtags)
    ) {
      return this.createPreconditionFailedResponse(
        'If-None-Match 条件不满足。',
      );
    }

    return null;
  }

  private parseEtags(header: string | undefined) {
    return (header ?? '')
      .split(',')
      .map((etag) => etag.trim())
      .filter(Boolean);
  }

  private etagListMatches(
    expectedEtags: string[],
    resourceExists: boolean,
    currentEtags: string[],
  ) {
    if (expectedEtags.includes('*')) {
      return resourceExists;
    }

    return expectedEtags.some((etag) => currentEtags.includes(etag));
  }

  private resolveNodeEtags(
    tenantScope: string,
    kbId: string,
    node: WebdavKnowledgeNode,
  ) {
    return [
      this.toEtag(
        'knowledge-node',
        tenantScope,
        kbId,
        node.id,
        node.updatedAt.toISOString(),
      ),
      this.toEtag(
        'webdav-content',
        tenantScope,
        kbId,
        node.id,
        node.updatedAt.toISOString(),
      ),
    ];
  }

  private resolveKnowledgeBaseEtags(
    tenantScope: string,
    knowledgeBase: WebdavKnowledgeBaseLike,
  ) {
    return [
      this.toEtag(
        'knowledge-base',
        tenantScope,
        knowledgeBase.id,
        knowledgeBase.updatedAt.toISOString(),
      ),
    ];
  }

  private resolveNextSortOrder(
    knowledgeNodes: WebdavKnowledgeNode[],
    parentId: string | null,
  ) {
    const siblings = knowledgeNodes.filter(
      (node) => node.parentId === parentId,
    );
    if (siblings.length === 0) {
      return 0;
    }

    return (
      Math.max(...siblings.map((node) => node.sortOrder ?? 0)) +
      WEBDAV_SORT_ORDER_STEP
    );
  }

  private validateWriteRole(principal: Principal) {
    const role = (principal.role ?? SystemRoles.TENANT_VIEWER) as UserRole;
    if (WEBDAV_ROLE_WEIGHT[role] < WEBDAV_ROLE_WEIGHT[WEBDAV_MIN_WRITE_ROLE]) {
      return `WebDAV 写入至少需要 ${WEBDAV_MIN_WRITE_ROLE} 权限。`;
    }

    return null;
  }

  private resolveWritableFileExtension(fileName: string) {
    const extension = extname(fileName).toLowerCase();
    if (!extension) {
      return WEBDAV_ALLOW_EXTENSIONLESS_FILES ? '' : null;
    }

    return WEBDAV_ALLOWED_FILE_EXTENSIONS.has(extension) ? extension : null;
  }

  private isRootWriteProbePath(segments: string[]) {
    return (
      segments.length === 1 &&
      segments[0].startsWith(WEBDAV_ROOT_WRITE_PROBE_PREFIX)
    );
  }

  private isWriteProbePath(segments: string[]) {
    return segments.at(-1)?.startsWith(WEBDAV_ROOT_WRITE_PROBE_PREFIX) ?? false;
  }

  private async readRequestBody(
    request: Request,
  ): Promise<
    { ok: true; body: Buffer } | { ok: false; response: WebdavResponse }
  > {
    const contentLength = Number(request.header('content-length') ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES
    ) {
      return {
        ok: false,
        response:
          this.createPayloadTooLargeResponse('上传文件超过大小限制。'),
      };
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    try {
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buffer.length;
        if (totalSize > LOCAL_IMPORT_UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
          return {
            ok: false,
            response:
              this.createPayloadTooLargeResponse('上传文件超过大小限制。'),
          };
        }
        chunks.push(buffer);
      }
    } catch {
      return {
        ok: false,
        response: this.createBadRequestResponse('WebDAV 请求正文读取失败。'),
      };
    }

    if (totalSize === 0) {
      return {
        ok: false,
        response: this.createBadRequestResponse('上传文件不能为空。'),
      };
    }

    return { ok: true, body: Buffer.concat(chunks, totalSize) };
  }

  private async readOpenVikingContentStream(
    principal: Principal,
    downloadUri: string,
    resourceUri: string,
  ) {
    const connection = await this.resolveOpenVikingConnection(principal);
    try {
      return await this.ovClientService.requestStream(
        connection,
        `${WEBDAV_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(downloadUri)}`,
        'GET',
        undefined,
        undefined,
        {
          serviceLabel: 'OpenViking 内容下载',
        },
      );
    } catch (error) {
      if (error instanceof HttpException) {
        const fallbackUri = await this.resolveDownloadableLeafUri(
          connection,
          resourceUri,
        );
        if (!fallbackUri || fallbackUri === downloadUri) {
          return null;
        }

        try {
          return await this.ovClientService.requestStream(
            connection,
            `${WEBDAV_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(fallbackUri)}`,
            'GET',
            undefined,
            undefined,
            {
              serviceLabel: 'OpenViking 内容下载',
            },
          );
        } catch (fallbackError) {
          if (fallbackError instanceof HttpException) {
            return null;
          }
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  private async resolveDownloadableLeafUri(
    connection: WebdavOVConnection,
    vikingUri: string,
  ) {
    try {
      const response = await this.ovClientService.request(
        connection,
        `${WEBDAV_FS_TREE_PATH}?uri=${encodeURIComponent(vikingUri)}&depth=1`,
        'GET',
        undefined,
        connection.user ? { user: connection.user } : undefined,
        {
          serviceLabel: 'OpenViking 资源树',
        },
      );
      const entries = Array.isArray(response?.result) ? response.result : [];
      const leaf = entries.find(
        (entry): entry is { uri: string; isDir?: boolean } =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof (entry as { uri?: unknown }).uri === 'string' &&
              (entry as { isDir?: unknown }).isDir === false,
          ),
      );
      return leaf?.uri ?? null;
    } catch (error) {
      if (error instanceof HttpException) {
        return null;
      }
      throw error;
    }
  }

  private async resolveOpenVikingConnection(
    principal: Principal,
  ): Promise<WebdavOVConnection> {
    const resolved = principal.tenantId
      ? await this.ovConfigResolver.resolve(principal.tenantId)
      : principal.ovConfig;
    const user = resolved.user || principal.ovConfig.user || undefined;

    return {
      baseUrl: resolved.baseUrl || principal.ovConfig.baseUrl,
      apiKey: resolved.apiKey || principal.ovConfig.apiKey,
      account: resolved.account || principal.ovConfig.account || 'default',
      ...(user ? { user } : {}),
    };
  }

  private renderMultiStatusXml(resources: WebdavResource[]) {
    const responses = resources
      .map((resource) => {
        const properties = [
          `<D:displayname>${this.escapeXml(resource.displayName)}</D:displayname>`,
          `<D:resourcetype>${resource.isCollection ? '<D:collection />' : ''}</D:resourcetype>`,
          `<D:getcontentlength>${resource.contentLength}</D:getcontentlength>`,
          `<D:getcontenttype>${this.escapeXml(resource.contentType)}</D:getcontenttype>`,
          `<D:getetag>${this.escapeXml(resource.etag)}</D:getetag>`,
          `<D:getlastmodified>${resource.lastModified.toUTCString()}</D:getlastmodified>`,
          `<D:creationdate>${resource.createdAt.toISOString()}</D:creationdate>`,
        ].join('');

        return [
          '<D:response>',
          `<D:href>${this.escapeXml(resource.href)}</D:href>`,
          '<D:propstat>',
          `<D:prop>${properties}</D:prop>`,
          `<D:status>${WEBDAV_SUCCESS_STATUS}</D:status>`,
          '</D:propstat>',
          '</D:response>',
        ].join('');
      })
      .join('');

    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<D:multistatus xmlns:D="DAV:">',
      responses,
      '</D:multistatus>',
    ].join('');
  }

  private resolveLatestDate(dates: Date[]) {
    if (dates.length === 0) {
      return new Date(0);
    }

    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  private toHref(tenantId: string, segments: string[], isCollection: boolean) {
    const encodedSegments = [tenantId, ...segments]
      .filter((segment) => segment.length > 0)
      .map((segment) => encodeURIComponent(segment));

    const suffix = isCollection ? '/' : '';
    return `${WEBDAV_ROOT_PATH}/${encodedSegments.join('/')}${suffix}`;
  }

  private toEtag(...parts: Array<string | number>) {
    return `W/"${parts.join('-')}"`;
  }

  private isDirectoryVikingUri(vikingUri: string) {
    return vikingUri.endsWith(WEBDAV_DIRECTORY_URI_SUFFIX);
  }

  private resolveOpenVikingUser(principal: Principal) {
    return (
      principal.ovConfig.user ||
      principal.username ||
      principal.userId ||
      undefined
    );
  }

  private canReadNode(node: WebdavKnowledgeNode, principal: Principal) {
    const acl = node.acl;
    if (!acl || acl.isPublic) {
      return true;
    }

    const roles = acl.roles ?? [];
    const users = acl.users ?? [];
    return (
      Boolean(principal.role && roles.includes(principal.role)) ||
      users.includes(principal.userId)
    );
  }

  private escapeXml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }
}
