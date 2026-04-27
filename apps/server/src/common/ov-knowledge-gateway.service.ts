import { Injectable } from '@nestjs/common';
import {
  OVClientService,
  OVConnection,
  OpenVikingRequestException,
  OVRequestMeta,
} from './ov-client.service';

interface FindKnowledgeInput {
  query: string;
  topK: number;
  scoreThreshold: number;
  filterUris: string[];
  uri?: string;
}

interface GrepKnowledgeInput {
  pattern: string;
  uri: string;
  caseInsensitive?: boolean;
}

interface TreeResourcesInput {
  uri: string;
  depth: number;
}

interface RerankInput {
  endpoint: string;
  apiKey?: string | null;
  model?: string;
  query: string | RerankMultimodalDocument;
  documents: Array<string | RerankMultimodalDocument>;
}

interface RerankMultimodalDocument {
  text?: string | string[];
  image?: string | string[];
  video?: string | string[];
}

interface GatewayRequestOptions {
  timeoutMs?: number;
  serviceLabel?: string;
}

const KNOWLEDGE_FIND_PATH = '/api/v1/search/find';
const KNOWLEDGE_GREP_PATH = '/api/v1/search/grep';
const RESOURCES_LIST_PATH = '/api/v1/fs/ls';
const RESOURCES_TREE_PATH = '/api/v1/fs/tree';
const DEFAULT_OV_TIMEOUT_MS = 2500;
const DEFAULT_OV_RETRY_COUNT = 1;
const DEFAULT_RERANK_TIMEOUT_MS = 1500;
const DEFAULT_RERANK_RETRY_COUNT = 1;
const RERANK_SERVICE_LABEL = 'Rerank';

@Injectable()
export class OVKnowledgeGatewayService {
  constructor(private readonly ovClient: OVClientService) {}

  findKnowledge(
    connection: OVConnection,
    input: FindKnowledgeInput,
    meta?: OVRequestMeta,
  ) {
    const body: Record<string, unknown> = {
      query: input.query,
      top_k: input.topK,
      score_threshold: input.scoreThreshold,
      filter_uris:
        input.filterUris.length > 0 ? input.filterUris : ['NONE_ACCESSIBLE'],
    };

    if (input.uri) {
      body.uri = input.uri;
    }

    return this.ovClient.request(
      connection,
      KNOWLEDGE_FIND_PATH,
      'POST',
      body,
      meta,
      {
        timeoutMs: DEFAULT_OV_TIMEOUT_MS,
        retryCount: DEFAULT_OV_RETRY_COUNT,
        serviceLabel: 'OpenViking Search',
      },
    );
  }

  grepKnowledge(
    connection: OVConnection,
    input: GrepKnowledgeInput,
    meta?: OVRequestMeta,
  ) {
    return this.ovClient.request(
      connection,
      KNOWLEDGE_GREP_PATH,
      'POST',
      {
        pattern: input.pattern,
        uri: input.uri,
        case_insensitive:
          input.caseInsensitive === undefined ? true : input.caseInsensitive,
      },
      meta,
      {
        timeoutMs: DEFAULT_OV_TIMEOUT_MS,
        retryCount: DEFAULT_OV_RETRY_COUNT,
        serviceLabel: 'OpenViking Grep',
      },
    );
  }

  listResources(
    connection: OVConnection,
    uri: string,
    meta?: OVRequestMeta,
  ) {
    return this.ovClient.request(
      connection,
      `${RESOURCES_LIST_PATH}?uri=${encodeURIComponent(uri)}`,
      'GET',
      undefined,
      meta,
      {
        timeoutMs: DEFAULT_OV_TIMEOUT_MS,
        retryCount: DEFAULT_OV_RETRY_COUNT,
        serviceLabel: 'OpenViking Resources',
      },
    );
  }

  treeResources(
    connection: OVConnection,
    input: TreeResourcesInput,
    meta?: OVRequestMeta,
  ) {
    return this.ovClient.request(
      connection,
      `${RESOURCES_TREE_PATH}?uri=${encodeURIComponent(input.uri)}&depth=${input.depth}`,
      'GET',
      undefined,
      meta,
      {
        timeoutMs: DEFAULT_OV_TIMEOUT_MS,
        retryCount: DEFAULT_OV_RETRY_COUNT,
        serviceLabel: 'OpenViking Resource Tree',
      },
    );
  }

  rerank(
    input: RerankInput,
    meta?: OVRequestMeta,
    options?: GatewayRequestOptions,
  ) {
    return this.requestRerank(input, meta, options);
  }

  private normalizeRerankResponse(response: unknown) {
    const payload = this.asRecord(response);
    const data = this.asRecord(payload.data);
    if (Array.isArray(data.results) && !Array.isArray(payload.results)) {
      return {
        ...payload,
        results: data.results,
      };
    }

    return payload;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private async requestRerank(
    input: RerankInput,
    meta?: OVRequestMeta,
    options?: GatewayRequestOptions,
  ) {
    const body = {
      query: input.query,
      documents: input.documents,
      model: input.model,
    } as Record<string, unknown>;
    const headers = input.apiKey?.trim()
      ? { Authorization: `Bearer ${input.apiKey.trim()}` }
      : undefined;
    const targets = this.buildRerankTargets(input.endpoint);

    let lastError: unknown;
    for (const target of targets) {
      try {
        const response = await this.ovClient.requestExternal(
          target,
          'POST',
          body,
          meta,
          {
            headers,
            timeoutMs: options?.timeoutMs ?? DEFAULT_RERANK_TIMEOUT_MS,
            retryCount: DEFAULT_RERANK_RETRY_COUNT,
            serviceLabel: options?.serviceLabel ?? RERANK_SERVICE_LABEL,
          },
        );
        return this.normalizeRerankResponse(response);
      } catch (error: unknown) {
        lastError = error;
        if (!this.shouldTryNextRerankTarget(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private buildRerankTargets(endpoint: string) {
    const trimmed = endpoint.trim().replace(/\/+$/, '');
    if (trimmed.endsWith('/rerank') || trimmed.endsWith('/reranks')) {
      return [trimmed];
    }

    if (trimmed.endsWith('/v1')) {
      return [`${trimmed}/rerank`, `${trimmed}/reranks`];
    }

    return [
      `${trimmed}/v1/rerank`,
      `${trimmed}/v1/reranks`,
      `${trimmed}/rerank`,
      `${trimmed}/reranks`,
    ];
  }

  private shouldTryNextRerankTarget(error: unknown) {
    if (!(error instanceof OpenVikingRequestException)) {
      return false;
    }

    if (error.statusCode === 404) {
      return true;
    }

    const payload = error.getResponse();
    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string' &&
      payload.message.includes('非 JSON 响应')
    ) {
      return true;
    }

    return false;
  }
}
