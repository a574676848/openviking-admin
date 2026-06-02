import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  OpenVikingRequestException,
  OVClientService,
  type OVConnection,
} from '../common/ov-client.service';
import { DocumentSessionRegistry } from '../common/document-session-registry';
import type { AuditActorSnapshot } from '../common/audit-actor.types';
import { KnowledgeNodeModel } from '../knowledge-tree/domain/knowledge-node.model';
import { KnowledgeNodeAclService } from '../knowledge-tree/knowledge-node-acl.service';
import { KnowledgeTreeService } from '../knowledge-tree/knowledge-tree.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentBlock, DocumentContentCodec } from './document-content-codec';
import {
  ASSET_FILE_NAME_MAX_LENGTH,
  ASSET_FILE_NAME_UNSAFE_CHARS,
  DEFAULT_OPENVIKING_ACCOUNT,
  DOCUMENT_ASSETS_DIRECTORY,
  DOCUMENT_ASSET_DEDUP_HASH_ALGORITHM,
  DOCUMENT_ASSET_FILE_PREFIX,
  DOCUMENT_ASSET_UPLOAD_REASON,
  DOCUMENT_COLLAB_NAME_PREFIX,
  DOCUMENT_COLLAB_PATH,
  DOCUMENT_CONTENT_DOWNLOAD_LABEL,
  DOCUMENT_CONTENT_DOWNLOAD_PATH,
  DOCUMENT_CONTENT_WRITE_PATH,
  DOCUMENT_CONTENT_FILE_PREFIX,
  DOCUMENT_DEFAULT_CONTENT_FILE_NAME,
  DOCUMENT_DIRECTORY_URI_SUFFIX,
  DOCUMENT_FILE_TIMESTAMP_RADIX,
  DOCUMENT_FS_PATH,
  DOCUMENT_FS_TREE_PATH,
  DOCUMENT_GLOBAL_TENANT_SCOPE,
  DOCUMENT_INDEX_REASON,
  DOCUMENT_MARKDOWN_EXTENSION,
  DOCUMENT_MARKDOWN_MIME_TYPE,
  DOCUMENT_RESOURCE_DELETE_LABEL,
  DOCUMENT_RESOURCE_SERVICE_LABEL,
  DOCUMENT_RESOURCE_TREE_LABEL,
  DOCUMENT_RESOURCES_PATH,
  DOCUMENT_TEMP_UPLOAD_PATH,
  DOCUMENT_WRITE_ROLE_SET,
} from './constants';
import { DocumentDraftRepository } from './document-draft.repository';
import {
  DOCUMENT_ASSET_DEDUP_STORE,
  type DocumentAssetDedupEntry,
  type DocumentAssetDedupStore,
} from './document-asset-dedup.store';
import {
  type DocumentAssetStream,
  type DocumentAssetUploadFile,
  type DocumentAssetUploadResult,
  type DocumentContentSnapshot,
  type DocumentIndexResult,
  type DocumentLoadOptions,
  type DocumentMetadata,
  type DocumentSaveOptions,
  type DocumentSaveResult,
} from './document.service.types';
import {
  assertOpenVikingSuccess,
  extractOpenVikingTempFileId,
  findOpenVikingInjectedLeaf,
} from './document-openviking-response.util';

export interface DocumentAccessContext {
  userId: string;
  role?: string | null;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly ovClientService: OVClientService,
    private readonly settingsService: SettingsService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly knowledgeNodeAclService: KnowledgeNodeAclService,
    private readonly documentContentCodec: DocumentContentCodec,
    private readonly documentSessionRegistry: DocumentSessionRegistry,
    private readonly documentDraftRepository: DocumentDraftRepository,
    @Inject(DOCUMENT_ASSET_DEDUP_STORE)
    private readonly documentAssetDedupStore: DocumentAssetDedupStore,
    private readonly knowledgeBaseService?: KnowledgeBaseService,
  ) {}

  async getMetadata(
    nodeId: string,
    tenantId: string | null,
    userRole: string,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentMetadata> {
    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const canWrite = DOCUMENT_WRITE_ROLE_SET.has(userRole);
    const contentUri = this.resolveCurrentContentUri(node);
    let draft = await this.documentDraftRepository.findByNode(
      node.id,
      tenantId,
    );
    if (!draft && contentUri) {
      await this.warmDraft(node.id, tenantId, contentUri);
      draft = await this.documentDraftRepository.findByNode(
        node.id,
        tenantId,
      );
    }
    const draftReady = draft !== null || !contentUri;

    return {
      nodeId: node.id,
      kbId: node.kbId,
      name: node.name,
      contentUri,
      draftVersion: node.draftVersion,
      indexedVersion: node.indexedVersion,
      indexStatus: node.indexStatus,
      vectorCount: node.vectorCount,
      lastIndexedAt: node.lastIndexedAt,
      indexError: node.indexError,
      readOnly: !canWrite,
      canWrite,
      draftReady,
      collab: {
        path: DOCUMENT_COLLAB_PATH,
        documentName: contentUri
          ? this.createCollabDocumentName(tenantId, node.id)
          : '',
      },
      updatedAt: node.updatedAt,
    };
  }

  async loadContent(
    nodeId: string,
    tenantId: string | null,
    accessContext?: DocumentAccessContext,
    options?: DocumentLoadOptions,
  ): Promise<DocumentContentSnapshot> {
    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    let draft = await this.documentDraftRepository.findByNode(
      node.id,
      tenantId,
    );
    const contentUri = this.resolveCurrentContentUri(node);
    const markdown = await this.resolveDocumentMarkdown(
      node,
      tenantId,
      draft?.markdown,
      options,
    );
    if (
      !draft &&
      contentUri &&
      markdown.trim().length > 0
    ) {
      draft = await this.documentDraftRepository.saveMarkdown(
        node.id,
        tenantId,
        markdown,
      );
      await this.knowledgeTreeService.syncIndexState(node.id, tenantId, {
        draftVersion: draft.version,
      });
    }

    return {
      nodeId: node.id,
      kbId: node.kbId,
      name: node.name,
      contentUri,
      draftVersion: draft?.version ?? node.draftVersion,
      indexedVersion: node.indexedVersion,
      indexStatus: node.indexStatus,
      markdown,
      blocks: this.documentContentCodec.markdownToBlocks(markdown),
      updatedAt: node.updatedAt,
    };
  }

  async saveContent(
    nodeId: string,
    tenantId: string | null,
    blocks: DocumentBlock[],
    options: DocumentSaveOptions = {},
    actor?: AuditActorSnapshot | null,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentSaveResult> {
    if (options.assertNoActiveWriteSession) {
      this.documentSessionRegistry.assertNoActiveWriteSession(nodeId);
    }

    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const markdown = this.documentContentCodec.blocksToMarkdown(blocks);
    const draft = await this.documentDraftRepository.saveMarkdown(
      node.id,
      tenantId,
      markdown,
      actor,
    );
    const touched = await this.knowledgeTreeService.syncIndexState(
      node.id,
      tenantId,
      {
        draftVersion: draft.version,
        indexStatus: 'dirty',
        indexError: null,
      },
      actor,
    );

    return {
      nodeId: node.id,
      contentUri: this.resolveCurrentContentUri(touched),
      draftVersion: draft.version,
      indexStatus: touched.indexStatus,
      updatedAt: touched.updatedAt,
    };
  }

  async saveMarkdownContent(
    nodeId: string,
    tenantId: string | null,
    markdown: string,
    options: DocumentSaveOptions = {},
    actor?: AuditActorSnapshot | null,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentSaveResult> {
    if (options.assertNoActiveWriteSession) {
      this.documentSessionRegistry.assertNoActiveWriteSession(nodeId);
    }

    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const draft = await this.documentDraftRepository.saveMarkdown(
      node.id,
      tenantId,
      markdown,
      actor,
    );
    const touched = await this.knowledgeTreeService.syncIndexState(
      node.id,
      tenantId,
      {
        draftVersion: draft.version,
        indexStatus: 'dirty',
        indexError: null,
      },
      actor,
    );

    return {
      nodeId: node.id,
      contentUri: this.resolveCurrentContentUri(touched),
      draftVersion: draft.version,
      indexStatus: touched.indexStatus,
      updatedAt: touched.updatedAt,
    };
  }

  async indexContent(
    nodeId: string,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentIndexResult> {
    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const draft = await this.documentDraftRepository.findByNode(
      node.id,
      tenantId,
    );
    const markdown = await this.resolveDocumentMarkdown(
      node,
      tenantId,
      draft?.markdown,
    );
    const connection = await this.resolveOpenVikingConnection(tenantId);
    const contentUri = this.resolveIndexedContentUri(node);
    const draftVersion = draft?.version ?? node.draftVersion;

    await this.knowledgeTreeService.syncIndexState(
      node.id,
      tenantId,
      {
        indexStatus: 'indexing',
        draftVersion,
        indexError: null,
      },
      actor,
    );

    try {
      const indexedContentUri = await this.writeIndexedContent(
        connection,
        node,
        contentUri,
        markdown,
      );
      const vectorCount = await this.fetchVectorCount(
        connection,
        indexedContentUri,
      );
      const hasIndexedVectors = (vectorCount ?? 0) > 0;
      const indexedAt = new Date();
      const touched = await this.knowledgeTreeService.syncIndexState(
        node.id,
        tenantId,
        {
          contentUri: indexedContentUri,
          indexStatus: hasIndexedVectors ? 'clean' : 'indexing',
          draftVersion,
          indexedVersion: hasIndexedVectors ? draftVersion : node.indexedVersion,
          vectorCount,
          lastIndexedAt: hasIndexedVectors ? indexedAt : node.lastIndexedAt,
          indexError: null,
        },
        actor,
      );
      await this.refreshKnowledgeBaseStats(node, tenantId, actor);

      return {
        nodeId: node.id,
        contentUri: indexedContentUri,
        draftVersion,
        indexedVersion: touched.indexedVersion,
        indexStatus: touched.indexStatus,
        vectorCount: touched.vectorCount,
        lastIndexedAt: touched.lastIndexedAt,
      };
    } catch (error) {
      if (this.isOpenVikingBusy(error)) {
        const current = await this.knowledgeTreeService.syncIndexState(
          node.id,
          tenantId,
          {
            contentUri,
            indexStatus: 'indexing',
            draftVersion,
            indexError: null,
          },
          actor,
        );
        return {
          nodeId: node.id,
          contentUri,
          draftVersion,
          indexedVersion: current.indexedVersion,
          indexStatus: current.indexStatus,
          vectorCount: current.vectorCount,
          lastIndexedAt: current.lastIndexedAt,
        };
      }
      const message = error instanceof Error ? error.message : '未知错误';
      await this.knowledgeTreeService.syncIndexState(
        node.id,
        tenantId,
        {
          indexStatus: 'failed',
          indexError: message,
        },
        actor,
      );
      throw error;
    }
  }

  /**
   * 草稿预热：从 OV 下载文档内容并写入草稿，但不标记 indexStatus 为 dirty。
   * 用于导入完成后提前准备好草稿，让用户进入编辑时无需等待 OV 下载。
   */
  async warmDraft(
    nodeId: string,
    tenantId: string | null,
    contentUri: string,
  ): Promise<void> {
    try {
      const markdown = await this.downloadMarkdown(
        contentUri,
        tenantId,
      );
      if (!markdown || markdown.trim().length === 0) {
        return;
      }
      const draft = await this.documentDraftRepository.saveMarkdown(
        nodeId,
        tenantId,
        markdown,
      );
      // 只同步 draftVersion，不修改 indexStatus
      await this.knowledgeTreeService.syncIndexState(nodeId, tenantId, {
        draftVersion: draft.version,
      });
    } catch (error) {
      this.logger.warn(
        `草稿预热失败 [nodeId=${nodeId}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async refreshKnowledgeBaseStats(
    node: KnowledgeNodeModel,
    tenantId: string | null,
    actor?: AuditActorSnapshot | null,
  ): Promise<void> {
    if (!this.knowledgeBaseService) {
      return;
    }
    await this.knowledgeBaseService.refreshStatsFromNodes(
      node.kbId,
      tenantId,
      actor,
    );
  }

  async uploadAsset(
    nodeId: string,
    tenantId: string | null,
    file: DocumentAssetUploadFile,
    actor?: AuditActorSnapshot | null,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentAssetUploadResult> {
    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const connection = await this.resolveOpenVikingConnection(tenantId);
    const containerUri = this.resolveDocumentContainerUri(node);
    const assetsUri = this.joinResourceUri(
      containerUri,
      DOCUMENT_ASSETS_DIRECTORY,
    );
    const assetHash = this.createAssetHash(file.buffer);
    const cachedAssetPath = await this.documentAssetDedupStore.get(
      node.id,
      assetHash,
    );
    if (cachedAssetPath) {
      return {
        path: cachedAssetPath,
        uri: `${assetsUri}${this.resolveAssetPathFileName(cachedAssetPath)}`,
      };
    }

    const dedupAsset = await this.findDuplicateAssetByHash(
      connection,
      node.id,
      assetsUri,
      assetHash,
    );
    if (dedupAsset) {
      await this.documentAssetDedupStore.set(
        node.id,
        assetHash,
        dedupAsset.path,
      );
      return dedupAsset;
    }

    const fileName = this.createAssetFileName(file.originalname);
    const tempFileId = await this.uploadAssetTempFile(
      connection,
      fileName,
      file,
    );

    await this.injectResource(
      connection,
      assetsUri,
      tempFileId,
      DOCUMENT_ASSET_UPLOAD_REASON,
    );
    const confirmedAssetUri = await this.resolveInjectedAssetUri(
      connection,
      assetsUri,
      fileName,
    );
    const confirmedFileName =
      this.extractResourceLeafFileName(confirmedAssetUri);
    await this.knowledgeTreeService.touch(node.id, tenantId, actor);

    const uploadedAsset = {
      path: `${DOCUMENT_ASSETS_DIRECTORY}/${confirmedFileName}`,
      uri: confirmedAssetUri,
    };
    await this.documentAssetDedupStore.set(
      node.id,
      assetHash,
      uploadedAsset.path,
    );
    return uploadedAsset;
  }

  async loadAsset(
    nodeId: string,
    tenantId: string | null,
    filename: string,
    accessContext?: DocumentAccessContext,
  ): Promise<DocumentAssetStream> {
    const node = await this.requireDocumentNode(
      nodeId,
      tenantId,
      accessContext,
    );
    const connection = await this.resolveOpenVikingConnection(tenantId);
    const containerUri = this.resolveDocumentContainerUri(node);
    const assetFileName = this.normalizeAssetFileName(filename);
    const assetUri = `${this.joinResourceUri(
      containerUri,
      DOCUMENT_ASSETS_DIRECTORY,
    )}${assetFileName}`;

    return this.loadAssetStreamWithRetry(
      connection,
      `${DOCUMENT_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(assetUri)}`,
    );
  }

  private async loadAssetStreamWithRetry(
    connection: OVConnection,
    requestPath: string,
  ): Promise<DocumentAssetStream> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.ovClientService.requestStream(
          connection,
          requestPath,
          'GET',
          undefined,
          this.createRequestMeta(connection),
          {
            serviceLabel: DOCUMENT_CONTENT_DOWNLOAD_LABEL,
            retryCount: 2,
            retryDelayMs: 200,
          },
        );
      } catch (error) {
        if (
          error instanceof OpenVikingRequestException &&
          error.statusCode === 404 &&
          attempt < maxAttempts - 1
        ) {
          await this.sleep(200);
          continue;
        }
        throw error;
      }
    }

    throw new Error('资产读取重试次数耗尽。');
  }

  private async requireDocumentNode(
    nodeId: string,
    tenantId: string | null,
    accessContext?: DocumentAccessContext,
  ): Promise<KnowledgeNodeModel> {
    const node = await this.knowledgeTreeService.findOne(nodeId, tenantId);
    if (accessContext) {
      this.knowledgeNodeAclService.assertCanReadNode(
        node,
        accessContext,
        '当前用户无权访问该文档节点。',
      );
    }
    if (node.kind !== 'document') {
      throw new BadRequestException('目标节点不是文档节点。');
    }
    return node;
  }

  private async downloadMarkdown(
    contentUri: string,
    tenantId: string | null,
    options?: DocumentLoadOptions,
  ): Promise<string> {
    const connection = await this.resolveOpenVikingConnection(tenantId);
    return this.downloadMarkdownWithConnection(connection, contentUri, options);
  }

  private async downloadMarkdownWithConnection(
    connection: OVConnection,
    contentUri: string,
    options?: DocumentLoadOptions,
  ): Promise<string> {
    const response = await this.ovClientService.requestStream(
      connection,
      `${DOCUMENT_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(contentUri)}`,
      'GET',
      undefined,
      this.createRequestMeta(connection),
      {
        serviceLabel: DOCUMENT_CONTENT_DOWNLOAD_LABEL,
        timeoutMs: options?.ovFetchTimeoutMs,
      },
    );

    return this.readStreamAsUtf8(response.stream);
  }

  private async loadStoredMarkdown(
    node: KnowledgeNodeModel,
    tenantId: string | null,
    options?: DocumentLoadOptions,
  ): Promise<string> {
    const contentUri = this.resolveCurrentContentUri(node);
    if (contentUri) {
      return this.downloadMarkdown(contentUri, tenantId, options);
    }
    return this.loadImportedDirectoryMarkdown(node, tenantId, options);
  }

  private async resolveDocumentMarkdown(
    node: KnowledgeNodeModel,
    tenantId: string | null,
    draftMarkdown?: string | null,
    options?: DocumentLoadOptions,
  ): Promise<string> {
    const contentUri = this.resolveCurrentContentUri(node);
    if (draftMarkdown !== undefined && draftMarkdown !== null) {
      if (draftMarkdown.trim().length > 0 || contentUri) {
        return draftMarkdown;
      }
      const storedMarkdown = await this.loadStoredMarkdown(
        node,
        tenantId,
        options,
      );
      return storedMarkdown.trim().length > 0 ? storedMarkdown : draftMarkdown;
    }
    return this.loadStoredMarkdown(node, tenantId, options);
  }

  private async loadIndexedMarkdown(
    node: KnowledgeNodeModel,
    tenantId: string | null,
  ): Promise<string> {
    return this.loadStoredMarkdown(node, tenantId);
  }

  private async loadImportedDirectoryMarkdown(
    node: KnowledgeNodeModel,
    tenantId: string | null,
    options?: DocumentLoadOptions,
  ): Promise<string> {
    if (!node.vikingUri?.endsWith(DOCUMENT_DIRECTORY_URI_SUFFIX)) {
      return '';
    }

    const connection = await this.resolveOpenVikingConnection(tenantId);
    let response: unknown;
    try {
      response = await this.ovClientService.request(
        connection,
        `${DOCUMENT_FS_TREE_PATH}?uri=${encodeURIComponent(node.vikingUri)}&depth=3`,
        'GET',
        undefined,
        this.createRequestMeta(connection),
        {
          serviceLabel: DOCUMENT_RESOURCE_TREE_LABEL,
          timeoutMs: options?.ovFetchTimeoutMs,
        },
      );
    } catch (error) {
      if (this.isOpenVikingNotFound(error)) {
        return '';
      }
      throw error;
    }

    const leaves = this.resolveMarkdownLeaves(response, node.vikingUri);
    if (leaves.length === 0) {
      return '';
    }

    const parts: string[] = [];
    for (const leaf of leaves) {
      const content = await this.downloadMarkdownWithConnection(
        connection,
        leaf.uri,
        options,
      );
      if (content.trim()) {
        parts.push(content.trimEnd());
      }
    }
    return parts.join('\n\n');
  }

  private async writeIndexedContent(
    connection: OVConnection,
    node: KnowledgeNodeModel,
    contentUri: string,
    markdown: string,
  ): Promise<string> {
    try {
      await this.writeContent(connection, contentUri, markdown);
      return contentUri;
    } catch (error) {
      if (!this.isOpenVikingNotFound(error)) {
        throw error;
      }
      return this.injectIndexedContent(connection, node, markdown);
    }
  }

  private async injectIndexedContent(
    connection: OVConnection,
    node: KnowledgeNodeModel,
    markdown: string,
  ): Promise<string> {
    const containerUri = this.resolveDocumentContainerUri(node);
    const tempFileId = await this.uploadMarkdownTempFile(
      connection,
      DOCUMENT_DEFAULT_CONTENT_FILE_NAME,
      markdown,
    );

    await this.injectResource(
      connection,
      containerUri,
      tempFileId,
      DOCUMENT_INDEX_REASON,
    );
    return this.resolveFirstContentUri(
      connection,
      containerUri,
      DOCUMENT_DEFAULT_CONTENT_FILE_NAME,
    );
  }

  private async writeContent(
    connection: OVConnection,
    contentUri: string,
    markdown: string,
  ): Promise<void> {
    const response = await this.ovClientService.request(
      connection,
      DOCUMENT_CONTENT_WRITE_PATH,
      'POST',
      {
        uri: contentUri,
        content: markdown,
        mode: 'replace',
        wait: false,
      },
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_SERVICE_LABEL },
    );

    assertOpenVikingSuccess(response, 'OpenViking 正文写入失败');
  }

  private async fetchVectorCount(
    connection: OVConnection,
    contentUri: string,
  ): Promise<number | null> {
    try {
      const response = await this.ovClientService.request(
        connection,
        `/api/v1/debug/vector/count?uri=${encodeURIComponent(contentUri)}`,
        'GET',
        undefined,
        this.createRequestMeta(connection),
        { serviceLabel: DOCUMENT_RESOURCE_SERVICE_LABEL },
      );
      const result = response?.result as { count?: unknown } | undefined;
      const count = Number(result?.count ?? response?.count);
      return Number.isFinite(count) && count >= 0 ? count : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`读取文档向量数量失败: ${message}`);
      return null;
    }
  }

  private async uploadMarkdownTempFile(
    connection: OVConnection,
    fileName: string,
    markdown: string,
  ): Promise<string> {
    const response = await this.ovClientService.uploadTempFile(
      connection,
      DOCUMENT_TEMP_UPLOAD_PATH,
      {
        fileName,
        buffer: Buffer.from(markdown, 'utf8'),
        mimeType: DOCUMENT_MARKDOWN_MIME_TYPE,
      },
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_SERVICE_LABEL },
    );

    return extractOpenVikingTempFileId(response);
  }

  private async uploadAssetTempFile(
    connection: OVConnection,
    fileName: string,
    file: DocumentAssetUploadFile,
  ): Promise<string> {
    const response = await this.ovClientService.uploadTempFile(
      connection,
      DOCUMENT_TEMP_UPLOAD_PATH,
      {
        fileName,
        buffer: file.buffer,
        mimeType: file.mimetype ?? 'application/octet-stream',
      },
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_SERVICE_LABEL },
    );

    return extractOpenVikingTempFileId(response);
  }

  private async injectResource(
    connection: OVConnection,
    targetUri: string,
    tempFileId: string,
    reason: string,
  ): Promise<void> {
    const response = await this.ovClientService.request(
      connection,
      DOCUMENT_RESOURCES_PATH,
      'POST',
      {
        temp_file_id: tempFileId,
        to: targetUri,
        reason,
        wait: true,
      },
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_SERVICE_LABEL },
    );

    assertOpenVikingSuccess(response, 'OpenViking 资源注入失败');
  }

  private async resolveFirstContentUri(
    connection: OVConnection,
    containerUri: string,
    fileName: string,
  ): Promise<string> {
    const response = await this.ovClientService.request(
      connection,
      `${DOCUMENT_FS_TREE_PATH}?uri=${encodeURIComponent(containerUri)}&depth=1`,
      'GET',
      undefined,
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_TREE_LABEL },
    );
    const leaf = findOpenVikingInjectedLeaf(response, containerUri, fileName);
    if (!leaf) {
      throw new ConflictException('无法确认 OpenViking 正文资源 URI。');
    }

    return leaf;
  }

  private async resolveInjectedAssetUri(
    connection: OVConnection,
    assetsUri: string,
    fileName: string,
  ): Promise<string> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await this.ovClientService.request(
        connection,
        `${DOCUMENT_FS_TREE_PATH}?uri=${encodeURIComponent(assetsUri)}&depth=1`,
        'GET',
        undefined,
        this.createRequestMeta(connection),
        { serviceLabel: DOCUMENT_RESOURCE_TREE_LABEL },
      );
      const leaf = findOpenVikingInjectedLeaf(response, assetsUri, fileName);
      if (leaf) {
        return leaf;
      }
      if (attempt < maxAttempts - 1) {
        await this.sleep(200);
      }
    }

    throw new ConflictException('无法确认 OpenViking 资产资源 URI。');
  }

  private async findDuplicateAssetByHash(
    connection: OVConnection,
    nodeId: string,
    assetsUri: string,
    assetHash: string,
  ): Promise<DocumentAssetUploadResult | null> {
    const cachedEntries = await this.documentAssetDedupStore.getAll(nodeId);
    if (cachedEntries.length > 0) {
      const cachedMatch = cachedEntries.find(
        (entry) => entry.hash === assetHash,
      );
      if (cachedMatch) {
        return {
          path: cachedMatch.assetPath,
          uri: `${assetsUri}${this.resolveAssetPathFileName(cachedMatch.assetPath)}`,
        };
      }
    }

    const entries = await this.buildAssetDedupEntries(connection, assetsUri);
    await this.documentAssetDedupStore.replaceAll(nodeId, entries);
    const match = entries.find((entry) => entry.hash === assetHash);
    if (!match) {
      return null;
    }

    return {
      path: match.assetPath,
      uri: `${assetsUri}${this.resolveAssetPathFileName(match.assetPath)}`,
    };
  }

  private async buildAssetDedupEntries(
    connection: OVConnection,
    assetsUri: string,
  ): Promise<DocumentAssetDedupEntry[]> {
    const response = await this.ovClientService.request(
      connection,
      `${DOCUMENT_FS_TREE_PATH}?uri=${encodeURIComponent(assetsUri)}&depth=1`,
      'GET',
      undefined,
      this.createRequestMeta(connection),
      { serviceLabel: DOCUMENT_RESOURCE_TREE_LABEL },
    );
    const leaves = Array.isArray(response?.result)
      ? response.result.filter(
          (item: { uri?: string; isDir?: boolean }) =>
            typeof item?.uri === 'string' && item.isDir === false,
        )
      : [];

    const entries: DocumentAssetDedupEntry[] = [];
    for (const leaf of leaves) {
      const stream = await this.loadAssetStreamWithRetry(
        connection,
        `${DOCUMENT_CONTENT_DOWNLOAD_PATH}?uri=${encodeURIComponent(leaf.uri)}`,
      );
      const content = await this.readStreamAsBuffer(stream.stream);
      const fileName = this.extractResourceLeafFileName(leaf.uri);
      entries.push({
        hash: this.createAssetHash(content),
        assetPath: `${DOCUMENT_ASSETS_DIRECTORY}/${fileName}`,
      });
    }
    return entries;
  }

  private async deleteOldContentLeaf(
    connection: OVConnection,
    oldContentUri: string | null,
    newContentUri: string,
  ): Promise<void> {
    if (!oldContentUri || oldContentUri === newContentUri) {
      return;
    }

    try {
      await this.ovClientService.request(
        connection,
        `${DOCUMENT_FS_PATH}?uri=${encodeURIComponent(oldContentUri)}&recursive=false`,
        'DELETE',
        undefined,
        this.createRequestMeta(connection),
        { serviceLabel: DOCUMENT_RESOURCE_DELETE_LABEL },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`协作保存清理旧正文叶子失败: ${message}`);
    }
  }

  private resolveDocumentContainerUri(node: KnowledgeNodeModel): string {
    if (node.vikingUri?.endsWith(DOCUMENT_DIRECTORY_URI_SUFFIX)) {
      return node.vikingUri;
    }

    const leafUri = this.resolveCurrentContentUri(node);
    const containerUri = leafUri
      ? this.resolveParentResourceUri(leafUri)
      : null;
    if (!containerUri) {
      throw new ConflictException('目标文档缺少资源容器 URI。');
    }

    return containerUri;
  }

  private resolveIndexedContentUri(node: KnowledgeNodeModel): string {
    const current = this.resolveCurrentContentUri(node);
    if (current) {
      return current;
    }

    return `${this.resolveDocumentContainerUri(node)}${DOCUMENT_DEFAULT_CONTENT_FILE_NAME}`;
  }

  private resolveCurrentContentUri(node: KnowledgeNodeModel): string | null {
    if (node.contentUri) {
      if (this.isValidDocumentContentUri(node.contentUri)) {
        return node.contentUri;
      }
      this.logger.warn(
        `文档节点 ${node.id} 的 contentUri 指向非正文资源，已按空正文处理: ${node.contentUri}`,
      );
      return null;
    }
    if (
      node.vikingUri &&
      !node.vikingUri.endsWith(DOCUMENT_DIRECTORY_URI_SUFFIX) &&
      this.isValidDocumentContentUri(node.vikingUri)
    ) {
      return node.vikingUri;
    }
    return null;
  }

  private isValidDocumentContentUri(contentUri: string): boolean {
    const normalized = contentUri.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized.includes(`/${DOCUMENT_ASSETS_DIRECTORY.toLowerCase()}/`)) {
      return false;
    }
    return normalized.endsWith(DOCUMENT_MARKDOWN_EXTENSION);
  }

  private resolveMarkdownLeaves(
    response: unknown,
    containerUri: string,
  ): Array<{ uri: string; relPath: string }> {
    const resources =
      response && typeof response === 'object'
        ? (response as { result?: unknown }).result
        : null;
    if (!Array.isArray(resources)) {
      return [];
    }

    return resources
      .filter(
        (item): item is { uri: string; isDir?: boolean; rel_path?: string } =>
          Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as { uri?: unknown }).uri === 'string' &&
            (item as { isDir?: unknown }).isDir === false,
          ),
      )
      .map((item) => ({
        uri: item.uri,
        relPath: item.rel_path ?? item.uri.slice(containerUri.length),
      }))
      .filter(
        (item) =>
          item.uri.toLowerCase().endsWith(DOCUMENT_MARKDOWN_EXTENSION) &&
          !item.relPath
            .toLowerCase()
            .startsWith(`${DOCUMENT_ASSETS_DIRECTORY.toLowerCase()}/`),
      )
      .sort((left, right) => left.relPath.localeCompare(right.relPath));
  }

  private isOpenVikingBusy(error: unknown): boolean {
    return (
      error instanceof OpenVikingRequestException &&
      error.statusCode === HttpStatus.BAD_REQUEST &&
      error.message.includes('resource is busy')
    );
  }

  private isOpenVikingNotFound(error: unknown): boolean {
    return (
      error instanceof OpenVikingRequestException &&
      error.statusCode === HttpStatus.NOT_FOUND
    );
  }

  private resolveParentResourceUri(uri: string): string | null {
    const lastSeparatorIndex = uri.lastIndexOf(DOCUMENT_DIRECTORY_URI_SUFFIX);
    if (lastSeparatorIndex < 0) {
      return null;
    }
    return uri.slice(0, lastSeparatorIndex + 1);
  }

  private async resolveOpenVikingConnection(
    tenantId: string | null,
  ): Promise<OVConnection> {
    const rawConfig = await this.settingsService.resolveOVConfig(tenantId);

    return {
      baseUrl: rawConfig.baseUrl || '',
      apiKey: rawConfig.apiKey || '',
      account: rawConfig.account || DEFAULT_OPENVIKING_ACCOUNT,
      user: rawConfig.user || undefined,
    };
  }

  private createContentLeafFileName(): string {
    const timestamp = Date.now().toString(DOCUMENT_FILE_TIMESTAMP_RADIX);
    return `${DOCUMENT_CONTENT_FILE_PREFIX}-${timestamp}-${randomUUID()}${DOCUMENT_MARKDOWN_EXTENSION}`;
  }

  private createAssetFileName(originalName: string): string {
    const safeName = this.normalizeAssetFileName(originalName);
    const timestamp = Date.now().toString(DOCUMENT_FILE_TIMESTAMP_RADIX);
    return `${DOCUMENT_ASSET_FILE_PREFIX}-${timestamp}-${randomUUID()}-${safeName}`;
  }

  private createAssetHash(buffer: Buffer): string {
    return createHash(DOCUMENT_ASSET_DEDUP_HASH_ALGORITHM)
      .update(buffer)
      .digest('hex');
  }

  private createCollabDocumentName(
    tenantId: string | null,
    nodeId: string,
  ): string {
    const scope = tenantId ?? DOCUMENT_GLOBAL_TENANT_SCOPE;
    return `${DOCUMENT_COLLAB_NAME_PREFIX}:${scope}:${nodeId}`;
  }

  private normalizeAssetFileName(value: string): string {
    const normalized = value.replace(/\\/g, '/').split('/').at(-1) ?? '';
    const sanitized = normalized
      .replace(ASSET_FILE_NAME_UNSAFE_CHARS, '_')
      .trim()
      .slice(0, ASSET_FILE_NAME_MAX_LENGTH);
    if (sanitized.length === 0 || sanitized === '.' || sanitized === '..') {
      throw new BadRequestException('资产文件名无效。');
    }

    return sanitized;
  }

  private joinResourceUri(containerUri: string, segment: string): string {
    return `${containerUri}${segment}${DOCUMENT_DIRECTORY_URI_SUFFIX}`;
  }

  private extractResourceLeafFileName(uri: string): string {
    const normalized = uri.replace(/\\/g, '/').split('/').at(-1) ?? '';
    if (!normalized) {
      throw new ConflictException('资源叶子文件名无效。');
    }
    return normalized;
  }

  private resolveAssetPathFileName(assetPath: string): string {
    const normalized = assetPath.replace(/\\/g, '/');
    const fileName = normalized.split('/').at(-1) ?? '';
    if (!fileName) {
      throw new ConflictException('资产路径文件名无效。');
    }
    return fileName;
  }

  private async readStreamAsBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private createRequestMeta(
    connection: OVConnection,
  ): { user: string } | undefined {
    return connection.user ? { user: connection.user } : undefined;
  }

  private async readStreamAsUtf8(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
