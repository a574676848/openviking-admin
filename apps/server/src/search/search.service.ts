import { Injectable, Inject, Logger } from '@nestjs/common';
import { SEARCH_LOG_REPOSITORY } from './domain/repositories/search-log.repository.interface';
import type { ISearchLogRepository } from './domain/repositories/search-log.repository.interface';
import { IKnowledgeNodeRepository } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';
import { SettingsService } from '../settings/settings.service';

export interface FindParams {
  query: string;
  uri?: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface OVSearchResource {
  uri: string;
  score: number;
  content?: string;
  title?: string;
  abstract?: string;
  [key: string]: unknown;
}

interface OVSearchResponse {
  result?: {
    resources: OVSearchResource[];
  };
}

interface RerankResult {
  index: number;
  relevance_score: number;
}

interface RerankResponse {
  results?: RerankResult[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_LOG_REPOSITORY)
    private readonly logRepo: ISearchLogRepository,
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepository,
    private readonly settings: SettingsService,
  ) {}

  private async getHeaders(tenantId: string) {
    const { apiKey, account } = await this.settings.resolveOVConfig(tenantId);
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
      'X-OpenViking-Account': account || 'default',
      'X-OpenViking-User': 'platform-user',
    };
  }

  async find(
    params: FindParams,
    tenantId: string,
    user: { id: string; role: string },
  ) {
    const config = await this.settings.resolveOVConfig(tenantId);
    const start = Date.now();

    const allowedUris = await this.nodeRepo.findAllowedUris(tenantId, user);

    const stage1TopK = config.rerankEndpoint ? 20 : params.topK || 5;

    const body: Record<string, unknown> = {
      query: params.query,
      top_k: stage1TopK,
      score_threshold: params.scoreThreshold || 0.3,
      filter_uris: allowedUris.length > 0 ? allowedUris : ['NONE_ACCESSIBLE'],
    };
    if (params.uri) body.uri = params.uri;

    const res = await fetch(`${config.baseUrl}/api/v1/search/find`, {
      method: 'POST',
      headers: await this.getHeaders(tenantId),
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as OVSearchResponse;
    let resources = data?.result?.resources ?? [];

    if (config.rerankEndpoint && resources.length > 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const rerankRes = await fetch(config.rerankEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: params.query,
            documents: resources.map((r) => r.content || r.title || ''),
            model: config.rerankModel,
          }),
        });
        clearTimeout(timeoutId);

        if (rerankRes.ok) {
          const rerankData = (await rerankRes.json()) as RerankResponse;
          const results = rerankData.results || [];

          resources = resources
            .map((r, i) => {
              const rerankMatch = results.find((item) => item.index === i);
              return {
                ...r,
                stage1Score: r.score,
                score: rerankMatch ? rerankMatch.relevance_score : r.score,
                reranked: true,
              };
            })
            .sort((a, b) => b.score - a.score);

          resources = resources.slice(0, params.topK || 5);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '未知错误';
        this.logger.warn(
          `Rerank failed, falling back to Stage 1 results: ${message}`,
        );
      }
    }

    const latency = Date.now() - start;

    await this.logRepo.save({
      tenantId,
      query: params.query,
      scope: params.uri,
      resultCount: resources.length,
      scoreMax: resources[0]?.score ?? 0,
      latencyMs: latency,
      meta: { rerank_applied: !!config.rerankEndpoint },
    });

    return { resources, latencyMs: latency };
  }

  async grep(pattern: string, uri: string, tenantId: string) {
    const config = await this.settings.resolveOVConfig(tenantId);
    const res = await fetch(`${config.baseUrl}/api/v1/search/grep`, {
      method: 'POST',
      headers: await this.getHeaders(tenantId),
      body: JSON.stringify({ pattern, uri, case_insensitive: true }),
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  async getAnalysis(tenantId: string | null) {
    const where = tenantId ? { tenantId } : {};
    return {
      total: await this.logRepo.count({ where }),
      noAnswerLogs: await this.logRepo.find({
        where: { ...where, resultCount: 0 },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    };
  }

  async getStatsDeep(tenantId: string | null) {
    const { total, hitCount, avgLatency } =
      await this.logRepo.getStats(tenantId);
    return {
      overview: {
        total,
        hitCount,
        zeroCount: total - hitCount,
        hitRate: total > 0 ? Number(((hitCount / total) * 100).toFixed(1)) : 0,
        avgLatency: Math.round(avgLatency),
        helpfulCount: 0,
        unhelpfulCount: 0,
        feedbackTotal: 0,
      },
      topUris: [],
      daily: [],
      topQueries: [],
    };
  }

  async getRecentLogs(limit: number, tenantId: string | null) {
    const where = tenantId ? { tenantId } : {};
    return this.logRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async setFeedback(id: string, feedback: string, note?: string) {
    const logs = await this.logRepo.find({ where: { id } });
    if (logs && logs.length > 0) {
      const log = logs[0];
      log.feedback = feedback;
      log.feedbackNote = note || '';
      return this.logRepo.save(log);
    }
  }
}
