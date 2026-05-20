import { ForbiddenException, Injectable } from '@nestjs/common';
import { OVConnection } from '../../common/ov-client.service';
import { OVKnowledgeGatewayService } from '../../common/ov-knowledge-gateway.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import {
  KnowledgeNodeAclService,
  type KnowledgeNodeAccessPrincipal,
} from '../../knowledge-tree/knowledge-node-acl.service';
import { KnowledgeTreeService } from '../../knowledge-tree/knowledge-tree.service';
import { ImportTaskService } from '../../import-task/import-task.service';
import { DocumentService } from '../../document/document.service';
import { SearchService } from '../../search/search.service';
import { createAuditActorSnapshot } from '../../common/audit-actor.types';
import { AuditService } from '../../audit/audit.service';
import type { KnowledgeBaseModel } from '../../knowledge-base/domain/knowledge-base.model';
import type { KnowledgeNodeModel } from '../../knowledge-tree/domain/knowledge-node.model';
import type { ImportTaskModel } from '../../import-task/domain/import-task.model';
import { Principal, TraceContext } from '../domain/capability.types';

interface GrepMatch {
  line: number;
  uri: string;
  content: string;
}

interface DocumentGrepMatch {
  line: number;
  content: string;
  before: string[];
  after: string[];
}

interface ResourceNode {
  uri: string;
  isDir: boolean;
  rel_path?: string;
}

@Injectable()
export class KnowledgeCapabilityGateway {
  constructor(
    private readonly ovKnowledgeGateway: OVKnowledgeGatewayService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly knowledgeTreeService: KnowledgeTreeService,
    private readonly knowledgeNodeAclService: KnowledgeNodeAclService,
    private readonly importTaskService: ImportTaskService,
    private readonly documentService: DocumentService,
    private readonly searchService: SearchService,
    private readonly auditService: AuditService,
  ) {}

  async search(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const scope = this.getTenantScope(principal);
    const requestedScope = input.uri
      ? this.resolveScopedUri(scope, input.uri)
      : undefined;
    const response = await this.searchService.find(
      {
        query: String(input.query ?? ''),
        topK: Number(input.limit ?? 5),
        scoreThreshold: Number(input.scoreThreshold ?? 0.5),
        uri: requestedScope,
        useRerank:
          input.useRerank === undefined ? undefined : Boolean(input.useRerank),
      },
      this.requireTenantId(principal),
      {
        id: principal.userId,
        role: principal.role ?? 'tenant_viewer',
      },
      this.toMeta(trace),
      {
        connection: this.toConnection(principal),
      },
    );

    const items = response.resources.map((resource) => ({
      uri: resource.uri,
      score: resource.score,
      abstract: resource.abstract ?? null,
      title: resource.title ?? null,
    }));

    return { items };
  }

  async grep(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      this.requireTenantId(principal),
      this.toNodeAccessPrincipal(principal),
    );
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
    this.assertScopeAccessible(targetUri, allowedUris);
    const response = await this.ovKnowledgeGateway.grepKnowledge(
      connection,
      {
        pattern: String(input.pattern ?? ''),
        uri: targetUri,
        caseInsensitive:
          input.caseInsensitive === undefined
            ? true
            : Boolean(input.caseInsensitive),
      },
      this.toMeta(trace),
    );

    const items = (
      (response.result as { matches?: GrepMatch[] } | undefined)?.matches ?? []
    )
      .filter((match) =>
        this.isMatchedResourceVisible(match.uri, allowedUris, targetUri),
      )
      .map((match) => ({
        line: match.line,
        uri: match.uri,
        content: match.content,
      }));

    return { items };
  }

  async listResources(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      this.requireTenantId(principal),
      this.toNodeAccessPrincipal(principal),
    );
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
    this.assertScopeAccessible(targetUri, allowedUris);
    const response = await this.ovKnowledgeGateway.listResources(
      connection,
      targetUri,
      this.toMeta(trace),
    );

    const items = ((response.result as ResourceNode[] | undefined) ?? [])
      .filter((node) => this.isListedResourceVisible(node.uri, allowedUris))
      .map((node) => ({
        uri: node.uri,
        isDir: node.isDir,
        relPath: node.rel_path ?? null,
      }));

    return { items };
  }

  async treeResources(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      this.requireTenantId(principal),
      this.toNodeAccessPrincipal(principal),
    );
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
    this.assertScopeAccessible(targetUri, allowedUris);
    const depth = Number(input.depth ?? 2);
    const response = await this.ovKnowledgeGateway.treeResources(
      connection,
      { uri: targetUri, depth },
      this.toMeta(trace),
    );

    const items = ((response.result as ResourceNode[] | undefined) ?? [])
      .filter((node) => this.isListedResourceVisible(node.uri, allowedUris))
      .map((node) => ({
        uri: node.uri,
        isDir: node.isDir,
        relPath: node.rel_path ?? null,
      }));

    const renderedTree = items
      .map((node) => {
        const level =
          (node.relPath ?? '').split('/').filter(Boolean).length - 1;
        const icon = node.isDir ? '[DIR]' : '[FILE]';
        const name = node.uri.split('/').pop() || node.uri;
        return `${'  '.repeat(Math.max(level, 0))}${icon} ${name}`;
      })
      .join('\n');

    return { items, renderedTree };
  }

  async listKnowledgeBases(principal: Principal) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const items = await this.knowledgeBaseService.findAll(tenantId);
    const visibleItems = await Promise.all(
      items.map(async (item) => ({
        item,
        visible: await this.canAccessKnowledgeBase(
          item.id,
          tenantId,
          accessPrincipal,
        ),
      })),
    );
    return {
      items: visibleItems
        .filter((entry) => entry.visible)
        .map((entry) => this.toKnowledgeBaseItem(entry.item)),
    };
  }

  async getKnowledgeBaseDetail(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const item = await this.knowledgeBaseService.findOne(
      String(input.id),
      tenantId,
    );
    await this.assertKnowledgeBaseVisible(
      item.id,
      tenantId,
      this.toNodeAccessPrincipal(principal),
    );
    return { item: this.toKnowledgeBaseItem(item) };
  }

  async deleteKnowledgeBase(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const item = await this.knowledgeBaseService.findOne(
      String(input.id),
      tenantId,
    );
    await this.assertKnowledgeBaseVisible(item.id, tenantId, accessPrincipal);
    await this.knowledgeBaseService.remove(item.id, tenantId, {
      user: principal.username ?? principal.userId,
    });
    await this.auditService.log({
      tenantId,
      userId: principal.userId,
      username: principal.username,
      action: 'delete_knowledge_base',
      target: item.id,
      meta: {
        requestId: trace?.requestId,
        traceId: trace?.traceId,
        channel: trace?.channel,
      },
    });
    return { item: this.toKnowledgeBaseItem(item) };
  }

  async listKnowledgeTree(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    await this.knowledgeBaseService.findOne(String(input.kbId), tenantId);
    await this.assertKnowledgeBaseVisible(
      String(input.kbId),
      tenantId,
      accessPrincipal,
    );
    const items = await this.knowledgeTreeService.findByKb(
      String(input.kbId),
      tenantId,
    );
    return {
      items: this.knowledgeNodeAclService
        .filterReadableNodes(items, accessPrincipal)
        .map((item) => this.toKnowledgeNodeItem(item)),
    };
  }

  async getKnowledgeTreeDetail(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const item = await this.knowledgeTreeService.findOne(
      String(input.id),
      this.requireTenantId(principal),
    );
    this.knowledgeNodeAclService.assertCanReadNode(
      item,
      this.toNodeAccessPrincipal(principal),
    );
    return { item: this.toKnowledgeNodeItem(item) };
  }

  async deleteKnowledgeTree(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const item = await this.knowledgeTreeService.findOne(
      String(input.id),
      tenantId,
    );
    this.knowledgeNodeAclService.assertCanReadNode(item, accessPrincipal);
    await this.knowledgeTreeService.remove(item.id, tenantId, {
      user: principal.username ?? principal.userId,
    });
    await this.auditService.log({
      tenantId,
      userId: principal.userId,
      username: principal.username,
      action: 'delete_knowledge_node',
      target: item.id,
      meta: {
        kbId: item.kbId,
        requestId: trace?.requestId,
        traceId: trace?.traceId,
        channel: trace?.channel,
      },
    });
    return { item: this.toKnowledgeNodeItem(item) };
  }

  async createDocumentImport(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const parentNodeId = input.parentNodeId ? String(input.parentNodeId) : null;
    let targetUri: string | null = null;
    if (parentNodeId) {
      const parentNode = await this.knowledgeTreeService.findOne(
        parentNodeId,
        tenantId,
      );
      this.knowledgeNodeAclService.assertCanReadNode(
        parentNode,
        accessPrincipal,
      );
      targetUri = parentNode.vikingUri;
    } else {
      await this.knowledgeBaseService.findOne(
        String(input.knowledgeBaseId),
        tenantId,
      );
      await this.assertKnowledgeBaseVisible(
        String(input.knowledgeBaseId),
        tenantId,
        accessPrincipal,
      );
    }
    const task = await this.importTaskService.create(
      {
        kbId: String(input.knowledgeBaseId),
        sourceType: String(input.sourceType),
        sourceUrl: input.sourceUrl ? String(input.sourceUrl) : undefined,
        sourceName: input.sourceName ? String(input.sourceName) : undefined,
        sourceUrls: this.toStringArray(input.sourceUrls),
        sourceNames: this.toStringArray(input.sourceNames),
        targetUri: targetUri ?? undefined,
      },
      tenantId,
      createAuditActorSnapshot(principal),
      accessPrincipal,
    );

    return {
      taskId: task.id,
      status: task.status,
      item: this.toImportTaskItem(task),
    };
  }

  async getDocumentImportStatus(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      tenantId,
      accessPrincipal,
    );
    const task = await this.importTaskService.findOne(
      String(input.taskId),
      tenantId,
      accessPrincipal,
    );
    await this.assertImportTaskVisible(
      task,
      tenantId,
      accessPrincipal,
      allowedUris,
    );
    return this.toImportTaskStatus(task);
  }

  async listDocumentImports(principal: Principal) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const items = await this.importTaskService.findAll(
      tenantId,
      accessPrincipal,
    );
    return {
      items: items.map((item) => this.toImportTaskItem(item)),
    };
  }

  async cancelDocumentImport(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      tenantId,
      accessPrincipal,
    );
    const taskBeforeCancel = await this.importTaskService.findOne(
      String(input.taskId),
      tenantId,
      accessPrincipal,
    );
    await this.assertImportTaskVisible(
      taskBeforeCancel,
      tenantId,
      accessPrincipal,
      allowedUris,
    );
    const task = await this.importTaskService.cancel(
      String(input.taskId),
      tenantId,
      createAuditActorSnapshot(principal),
      accessPrincipal,
    );
    return {
      taskId: task?.id ?? String(input.taskId),
      status: task?.status ?? 'cancelled',
      item: task ? this.toImportTaskItem(task) : null,
    };
  }

  async retryDocumentImport(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      tenantId,
      accessPrincipal,
    );
    const taskBeforeRetry = await this.importTaskService.findOne(
      String(input.taskId),
      tenantId,
      accessPrincipal,
    );
    await this.assertImportTaskVisible(
      taskBeforeRetry,
      tenantId,
      accessPrincipal,
      allowedUris,
    );
    const task = await this.importTaskService.retry(
      String(input.taskId),
      tenantId,
      createAuditActorSnapshot(principal),
      accessPrincipal,
    );
    return {
      taskId: task?.id ?? String(input.taskId),
      status: task?.status ?? 'pending',
      item: task ? this.toImportTaskItem(task) : null,
    };
  }

  async watchDocumentImportEvents(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const accessPrincipal = this.toNodeAccessPrincipal(principal);
    const allowedUris = await this.knowledgeNodeAclService.getAllowedUris(
      tenantId,
      accessPrincipal,
    );
    const task = await this.importTaskService.findOne(
      String(input.taskId),
      tenantId,
      accessPrincipal,
    );
    await this.assertImportTaskVisible(
      task,
      tenantId,
      accessPrincipal,
      allowedUris,
    );
    return {
      events: [
        {
          taskId: task.id,
          status: task.status,
          progress: this.toProgress(task),
          message: task.errorMsg ?? this.toStatusMessage(task.status),
          updatedAt: task.updatedAt,
        },
      ],
    };
  }

  async getDocumentIndexStatus(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const node = await this.knowledgeTreeService.findOne(
      String(input.nodeId),
      this.requireTenantId(principal),
    );
    this.knowledgeNodeAclService.assertCanReadNode(
      node,
      this.toNodeAccessPrincipal(principal),
    );
    return { item: this.toDocumentIndexItem(node) };
  }

  async rebuildDocumentIndex(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const item = await this.documentService.indexContent(
      String(input.nodeId),
      this.requireTenantId(principal),
      createAuditActorSnapshot(principal),
      this.toNodeAccessPrincipal(principal),
    );
    return { item };
  }

  async grepDocumentDraft(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const snapshot = await this.documentService.loadContent(
      String(input.nodeId),
      this.requireTenantId(principal),
      this.toNodeAccessPrincipal(principal),
    );
    const pattern = String(input.pattern ?? '');
    const caseInsensitive =
      input.caseInsensitive === undefined
        ? true
        : Boolean(input.caseInsensitive);
    const matches = this.grepMarkdown(
      snapshot.markdown,
      pattern,
      caseInsensitive,
    );

    return {
      items: matches.map((match) => ({
        nodeId: snapshot.nodeId,
        uri: snapshot.contentUri,
        source: 'draft',
        draftVersion: snapshot.draftVersion,
        indexedVersion: snapshot.indexedVersion,
        indexStatus: snapshot.indexStatus,
        ...match,
      })),
    };
  }

  private toKnowledgeBaseItem(item: KnowledgeBaseModel) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      vikingUri: item.vikingUri,
      docCount: item.docCount,
      vectorCount: item.vectorCount,
      createdBy: this.toActor(item.createdById, item.createdByName),
      updatedBy: this.toActor(item.updatedById, item.updatedByName),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toKnowledgeNodeItem(item: KnowledgeNodeModel) {
    return {
      id: item.id,
      kbId: item.kbId,
      parentId: item.parentId,
      name: item.name,
      path: item.path,
      sortOrder: item.sortOrder,
      acl: item.acl,
      vikingUri: item.vikingUri,
      createdBy: this.toActor(item.createdById, item.createdByName),
      updatedBy: this.toActor(item.updatedById, item.updatedByName),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toImportTaskStatus(task: ImportTaskModel) {
    return {
      taskId: task.id,
      status: task.status,
      progress: this.toProgress(task),
      item: this.toImportTaskItem(task),
    };
  }

  private toImportTaskItem(task: ImportTaskModel) {
    return {
      id: task.id,
      kbId: task.kbId,
      sourceType: task.sourceType,
      sourceUrl: task.sourceUrl,
      targetUri: task.targetUri,
      status: task.status,
      errorMsg: task.errorMsg,
      nodeCount: task.nodeCount,
      vectorCount: task.vectorCount,
      createdBy: this.toActor(task.createdById, task.createdByName),
      updatedBy: this.toActor(task.updatedById, task.updatedByName),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private toDocumentIndexItem(item: KnowledgeNodeModel) {
    return {
      nodeId: item.id,
      kbId: item.kbId,
      name: item.name,
      contentUri: item.contentUri,
      indexStatus: item.indexStatus,
      draftVersion: item.draftVersion,
      indexedVersion: item.indexedVersion,
      vectorCount: item.vectorCount,
      lastIndexedAt: item.lastIndexedAt,
      indexError: item.indexError,
      updatedAt: item.updatedAt,
    };
  }

  private grepMarkdown(
    markdown: string,
    pattern: string,
    caseInsensitive: boolean,
  ): DocumentGrepMatch[] {
    if (!pattern.trim()) {
      return [];
    }
    const needle = caseInsensitive ? pattern.toLowerCase() : pattern;
    const lines = markdown.split(/\r?\n/);
    return lines.flatMap((line, index) => {
      const haystack = caseInsensitive ? line.toLowerCase() : line;
      if (!haystack.includes(needle)) {
        return [];
      }
      return [
        {
          line: index + 1,
          content: line,
          before: lines.slice(Math.max(index - 2, 0), index),
          after: lines.slice(index + 1, index + 3),
        },
      ];
    });
  }

  private toActor(id?: string | null, username?: string | null) {
    if (!id && !username) {
      return null;
    }

    return { id: id ?? null, username: username ?? null };
  }

  private toProgress(task: ImportTaskModel) {
    const status = String(task.status).toLowerCase();
    if (status === 'completed') return 100;
    if (status === 'failed' || status === 'cancelled') return 0;
    if (status === 'running') return 50;
    return 10;
  }

  private toStatusMessage(status: string) {
    const normalized = status.toLowerCase();
    if (normalized === 'completed') return '导入完成';
    if (normalized === 'running') return '正在导入';
    if (normalized === 'failed') return '导入失败';
    if (normalized === 'cancelled') return '导入已取消';
    return '等待导入';
  }

  private requireTenantId(principal: Principal) {
    if (!principal.tenantId) {
      throw new ForbiddenException('当前 capability 需要租户上下文');
    }
    return principal.tenantId;
  }

  private toNodeAccessPrincipal(
    principal: Principal,
  ): KnowledgeNodeAccessPrincipal {
    return {
      userId: principal.userId,
      role: principal.role ?? null,
    };
  }

  private toStringArray(value: unknown) {
    return Array.isArray(value)
      ? value
          .map((item) => String(item))
          .filter((item) => item.trim().length > 0)
      : undefined;
  }

  private async canAccessKnowledgeBase(
    kbId: string,
    tenantId: string,
    principal: KnowledgeNodeAccessPrincipal,
  ) {
    const nodes =
      (await this.knowledgeTreeService.findByKb(kbId, tenantId)) ?? [];
    if (nodes.length === 0) {
      return true;
    }

    return (
      this.knowledgeNodeAclService.filterReadableNodes(nodes, principal)
        .length > 0
    );
  }

  private async assertKnowledgeBaseVisible(
    kbId: string,
    tenantId: string,
    principal: KnowledgeNodeAccessPrincipal,
  ) {
    if (!(await this.canAccessKnowledgeBase(kbId, tenantId, principal))) {
      throw new ForbiddenException('当前用户无权访问该知识库');
    }
  }

  private async canAccessImportTask(
    task: ImportTaskModel,
    tenantId: string,
    principal: KnowledgeNodeAccessPrincipal,
    allowedUris: string[],
  ) {
    if (!(await this.canAccessKnowledgeBase(task.kbId, tenantId, principal))) {
      return false;
    }

    if (task.autoCreatedNodeId) {
      try {
        const node = await this.knowledgeTreeService.findOne(
          task.autoCreatedNodeId,
          tenantId,
        );
        return this.knowledgeNodeAclService.canReadNode(node, principal);
      } catch {
        return false;
      }
    }

    if (allowedUris.length === 0 || !task.targetUri) {
      return true;
    }

    return allowedUris.some(
      (allowedUri) =>
        this.isUriWithinScope(allowedUri, task.targetUri) ||
        this.isUriWithinScope(task.targetUri, allowedUri),
    );
  }

  private async assertImportTaskVisible(
    task: ImportTaskModel,
    tenantId: string,
    principal: KnowledgeNodeAccessPrincipal,
    allowedUris: string[],
  ) {
    if (
      !(await this.canAccessImportTask(task, tenantId, principal, allowedUris))
    ) {
      throw new ForbiddenException('当前用户无权访问该导入任务');
    }
  }

  private assertScopeAccessible(targetUri: string, allowedUris: string[]) {
    const accessible = allowedUris.some(
      (allowedUri) =>
        this.isUriWithinScope(allowedUri, targetUri) ||
        this.isUriWithinScope(targetUri, allowedUri),
    );
    if (!accessible) {
      throw new ForbiddenException('当前用户无权访问该资源范围');
    }
  }

  private isMatchedResourceVisible(
    candidateUri: string,
    allowedUris: string[],
    requestedScope?: string,
  ) {
    const allowed = allowedUris.some((allowedUri) =>
      this.isUriWithinScope(candidateUri, allowedUri),
    );
    if (!allowed) {
      return false;
    }

    if (!requestedScope) {
      return true;
    }

    return this.isUriWithinScope(candidateUri, requestedScope);
  }

  private isListedResourceVisible(candidateUri: string, allowedUris: string[]) {
    return allowedUris.some(
      (allowedUri) =>
        this.isUriWithinScope(candidateUri, allowedUri) ||
        this.isUriWithinScope(allowedUri, candidateUri),
    );
  }

  private isUriWithinScope(candidateUri: string, scopeUri: string) {
    const normalizedCandidate = this.normalizeUri(candidateUri);
    const normalizedScope = this.normalizeUri(scopeUri);
    if (!normalizedCandidate || !normalizedScope) {
      return false;
    }

    return (
      normalizedCandidate === normalizedScope ||
      normalizedCandidate.startsWith(`${normalizedScope}/`)
    );
  }

  private normalizeUri(uri?: string | null) {
    if (!uri) {
      return null;
    }

    const normalized = uri.trim().replace(/\/+$/, '');
    return normalized.length > 0 ? normalized : null;
  }

  private toConnection(principal: Principal): OVConnection {
    return {
      baseUrl: principal.ovConfig.baseUrl,
      apiKey: principal.ovConfig.apiKey,
      account: principal.ovConfig.account,
      user: principal.ovConfig.user || undefined,
    };
  }

  private getTenantScope(principal: Principal) {
    return `viking://resources/tenants/${principal.tenantId}/`;
  }

  private resolveScopedUri(scope: string, rawUri: unknown) {
    const requestedUri = rawUri ? String(rawUri) : scope;
    if (!requestedUri.startsWith(scope)) {
      throw new ForbiddenException('禁止访问当前租户范围之外的资源');
    }

    return requestedUri;
  }

  private toMeta(trace?: TraceContext) {
    if (!trace) {
      return undefined;
    }

    return {
      traceId: trace.traceId,
      requestId: trace.requestId,
    };
  }
}
