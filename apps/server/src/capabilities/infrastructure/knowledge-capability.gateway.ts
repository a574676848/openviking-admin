import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  OVConnection,
} from '../../common/ov-client.service';
import { OVKnowledgeGatewayService } from '../../common/ov-knowledge-gateway.service';
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

  private toConnection(principal: Principal): OVConnection {
    return {
      baseUrl: principal.ovConfig.baseUrl,
      apiKey: principal.ovConfig.apiKey,
      account: principal.ovConfig.account,
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
