import { Injectable } from '@nestjs/common';
import {
  OVClientService,
  OVConnection,
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
  model?: string;
  query: string;
  documents: string[];
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
    return this.ovClient.requestExternal(
      input.endpoint,
      'POST',
      {
        query: input.query,
        documents: input.documents,
        model: input.model,
      },
      meta,
      {
        timeoutMs: options?.timeoutMs ?? DEFAULT_RERANK_TIMEOUT_MS,
        serviceLabel: options?.serviceLabel ?? 'Rerank',
        retryCount: DEFAULT_RERANK_RETRY_COUNT,
      },
    );
  }
}
