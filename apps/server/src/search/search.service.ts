import { Injectable, Inject, Logger } from '@nestjs/common';
import { SEARCH_LOG_REPOSITORY } from './domain/repositories/search-log.repository.interface';
import type { ISearchLogRepository } from './domain/repositories/search-log.repository.interface';
import { IKnowledgeNodeRepository } from '../knowledge-tree/domain/repositories/knowledge-node.repository.interface';
import { SettingsService } from '../settings/settings.service';
import {
  OVRequestMeta,
  OVConnection,
} from '../common/ov-client.service';
import { OVKnowledgeGatewayService } from '../common/ov-knowledge-gateway.service';

export interface FindParams {
  query: string;
  uri?: string;
  topK?: number;
  scoreThreshold?: number;
  useRerank?: boolean;
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
    private readonly ovKnowledgeGateway: OVKnowledgeGatewayService,
  ) {}

  // 管理侧检索调试入口，负责控制台搜索、日志与反馈闭环。
  // capability 四入口的统一对外契约仍由 capability registry + execution service 负责。
  async find(
    params: FindParams,
    tenantId: string,
    user: { id: string; role: string },
    meta?: OVRequestMeta,
  ) {
    const config = await this.settings.resolveOVConfig(tenantId);
    const start = Date.now();

    const allowedUris = await this.nodeRepo.findAllowedUris(tenantId, user);

    const shouldUseRerank = params.useRerank !== false && !!config.rerankEndpoint;
    const stage1TopK = shouldUseRerank ? 20 : params.topK || 5;

    const connection = this.toConnection({
      baseUrl: config.baseUrl || '',
      apiKey: config.apiKey || '',
      account: config.account || 'default',
    });
    const data = (await this.ovKnowledgeGateway.findKnowledge(
      connection,
      {
        query: params.query,
        topK: stage1TopK,
        scoreThreshold: params.scoreThreshold || 0.3,
        filterUris: allowedUris,
        uri: params.uri,
      },
      meta,
    )) as OVSearchResponse;
    let resources = data?.result?.resources ?? [];

    if (shouldUseRerank && resources.length > 0) {
      try {
        const rerankData = (await this.ovKnowledgeGateway.rerank(
          {
            endpoint: config.rerankEndpoint!,
            query: params.query,
            documents: resources.map((resource) => resource.content || resource.title || ''),
            model: config.rerankModel || undefined,
          },
          meta,
        )) as RerankResponse;
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
      } catch (err) {
        const message = err instanceof Error ? err.message : '未知错误';
        this.logger.warn(
          `Rerank failed, falling back to Stage 1 results: ${message}`,
        );
      }
    }

    const latency = Date.now() - start;

    const log = await this.logRepo.save({
      tenantId,
      query: params.query,
      scope: params.uri,
      resultCount: resources.length,
      scoreMax: resources[0]?.score ?? 0,
      latencyMs: latency,
      meta: { rerank_applied: shouldUseRerank },
    });

    return {
      resources,
      latencyMs: latency,
      logId: log.id,
      rerankApplied: shouldUseRerank,
    };
  }

  async grep(
    pattern: string,
    uri: string,
    tenantId: string,
    meta?: OVRequestMeta,
  ) {
    const config = await this.settings.resolveOVConfig(tenantId);
    return this.ovKnowledgeGateway.grepKnowledge(
      this.toConnection({
        baseUrl: config.baseUrl || '',
        apiKey: config.apiKey || '',
        account: config.account || 'default',
      }),
      { pattern, uri, caseInsensitive: true },
      meta,
    );
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

  private toConnection(connection: OVConnection): OVConnection {
    return connection;
  }
}
