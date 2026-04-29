import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  OVConnection,
} from '../../common/ov-client.service';
import { OVKnowledgeGatewayService } from '../../common/ov-knowledge-gateway.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { KnowledgeTreeService } from '../../knowledge-tree/knowledge-tree.service';
import { ImportTaskService } from '../../import-task/import-task.service';
import type { KnowledgeBaseModel } from '../../knowledge-base/domain/knowledge-base.model';
import type { KnowledgeNodeModel } from '../../knowledge-tree/domain/knowledge-node.model';
import type { ImportTaskModel } from '../../import-task/domain/import-task.model';
import { Principal, TraceContext } from '../domain/capability.types';

interface SearchResource {
  uri: string;
  score: number;
  abstract?: string;
  title?: string;
}

interface GrepMatch {
  line: number;
  uri: string;
  content: string;
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
    private readonly importTaskService: ImportTaskService,
  ) {}

  async search(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const response = await this.ovKnowledgeGateway.findKnowledge(
      connection,
      {
        query: String(input.query ?? ''),
        topK: Number(input.limit ?? 5),
        scoreThreshold: Number(input.scoreThreshold ?? 0.5),
        filterUris: [scope],
      },
      this.toMeta(trace),
    );

    const items =
      ((response.result as { resources?: SearchResource[] } | undefined)
        ?.resources ?? [])
        .map((resource) => ({
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
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
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

    const items =
      ((response.result as { matches?: GrepMatch[] } | undefined)?.matches ??
        []).map((match) => ({
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
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
    const response = await this.ovKnowledgeGateway.listResources(
      connection,
      targetUri,
      this.toMeta(trace),
    );

    const items = ((response.result as ResourceNode[] | undefined) ?? []).map(
      (node) => ({
        uri: node.uri,
        isDir: node.isDir,
        relPath: node.rel_path ?? null,
      }),
    );

    return { items };
  }

  async treeResources(
    principal: Principal,
    input: Record<string, unknown>,
    trace?: TraceContext,
  ) {
    const connection = this.toConnection(principal);
    const scope = this.getTenantScope(principal);
    const targetUri = this.resolveScopedUri(scope, input.uri);
    const depth = Number(input.depth ?? 2);
    const response = await this.ovKnowledgeGateway.treeResources(
      connection,
      { uri: targetUri, depth },
      this.toMeta(trace),
    );

    const items = ((response.result as ResourceNode[] | undefined) ?? []).map(
      (node) => ({
        uri: node.uri,
        isDir: node.isDir,
        relPath: node.rel_path ?? null,
      }),
    );

    const renderedTree = items
      .map((node) => {
        const level = (node.relPath ?? '').split('/').filter(Boolean).length - 1;
        const icon = node.isDir ? '[DIR]' : '[FILE]';
        const name = node.uri.split('/').pop() || node.uri;
        return `${'  '.repeat(Math.max(level, 0))}${icon} ${name}`;
      })
      .join('\n');

    return { items, renderedTree };
  }

  async listKnowledgeBases(principal: Principal) {
    const items = await this.knowledgeBaseService.findAll(
      this.requireTenantId(principal),
    );
    return { items: items.map((item) => this.toKnowledgeBaseItem(item)) };
  }

  async getKnowledgeBaseDetail(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const item = await this.knowledgeBaseService.findOne(
      String(input.id),
      this.requireTenantId(principal),
    );
    return { item: this.toKnowledgeBaseItem(item) };
  }

  async listKnowledgeTree(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    await this.knowledgeBaseService.findOne(
      String(input.kbId),
      this.requireTenantId(principal),
    );
    const items = await this.knowledgeTreeService.findByKb(
      String(input.kbId),
      this.requireTenantId(principal),
    );
    return { items: items.map((item) => this.toKnowledgeNodeItem(item)) };
  }

  async getKnowledgeTreeDetail(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const item = await this.knowledgeTreeService.findOne(
      String(input.id),
      this.requireTenantId(principal),
    );
    return { item: this.toKnowledgeNodeItem(item) };
  }

  async createDocumentImport(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const tenantId = this.requireTenantId(principal);
    const parentNodeId = input.parentNodeId ? String(input.parentNodeId) : null;
    const targetUri = parentNodeId
      ? (await this.knowledgeTreeService.findOne(parentNodeId, tenantId)).vikingUri
      : (await this.knowledgeBaseService.findOne(
          String(input.knowledgeBaseId),
          tenantId,
        )).vikingUri;
    const task = await this.importTaskService.create(
      {
        kbId: String(input.knowledgeBaseId),
        sourceType: String(input.sourceType),
        sourceUrl: input.sourceUrl ? String(input.sourceUrl) : undefined,
        sourceUrls: this.toStringArray(input.sourceUrls),
        targetUri: targetUri ?? undefined,
      },
      tenantId,
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
    const task = await this.importTaskService.findOne(
      String(input.taskId),
      this.requireTenantId(principal),
    );
    return this.toImportTaskStatus(task);
  }

  async listDocumentImports(principal: Principal) {
    const items = await this.importTaskService.findAll(this.requireTenantId(principal));
    return { items: items.map((item) => this.toImportTaskItem(item)) };
  }

  async cancelDocumentImport(
    principal: Principal,
    input: Record<string, unknown>,
  ) {
    const task = await this.importTaskService.cancel(
      String(input.taskId),
      this.requireTenantId(principal),
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
    const task = await this.importTaskService.retry(
      String(input.taskId),
      this.requireTenantId(principal),
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
    const task = await this.importTaskService.findOne(
      String(input.taskId),
      this.requireTenantId(principal),
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

  private toKnowledgeBaseItem(item: KnowledgeBaseModel) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      status: item.status,
      vikingUri: item.vikingUri,
      docCount: item.docCount,
      vectorCount: item.vectorCount,
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
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
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

  private toStringArray(value: unknown) {
    return Array.isArray(value)
      ? value.map((item) => String(item)).filter((item) => item.trim().length > 0)
      : undefined;
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
