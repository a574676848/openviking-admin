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
  image?: string | string[];
  images?: string[];
  image_url?: string;
  image_urls?: string[];
  screenshot?: string | string[];
  screenshots?: string[];
  video?: string | string[];
  videos?: string[];
  video_url?: string;
  video_urls?: string[];
  [key: string]: unknown;
}

interface OVSearchResponse {
  result?: {
    resources: OVSearchResource[];
  };
}

interface RerankResult {
  index: number;
  relevance_score?: number;
  score?: number;
}

interface RerankResponse {
  results?: RerankResult[];
}

interface RerankMultimodalDocument {
  text?: string | string[];
  image?: string | string[];
  video?: string | string[];
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
            apiKey: config.rerankApiKey || undefined,
            query: params.query,
            documents: resources.map((resource) =>
              this.buildRerankDocument(resource),
            ),
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
              score: this.resolveRerankScore(rerankMatch, r.score),
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
    const { helpfulCount, unhelpfulCount } =
      await this.logRepo.getFeedbackStats(tenantId);
    const zeroCount = total - hitCount;
    const feedbackTotal = helpfulCount + unhelpfulCount;
    return {
      overview: {
        total,
        hitCount,
        zeroCount,
        hitRate: total > 0 ? Number(((hitCount / total) * 100).toFixed(1)) : 0,
        avgLatency: Math.round(avgLatency),
        helpfulCount,
        unhelpfulCount,
        feedbackTotal,
      },
      topUris: await this.logRepo.getTopUris(tenantId),
      daily: await this.logRepo.getDailyStats(tenantId),
      topQueries: await this.logRepo.getTopQueries(tenantId),
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

  private resolveRerankScore(
    rerankMatch: RerankResult | undefined,
    fallbackScore: number,
  ) {
    if (!rerankMatch) {
      return fallbackScore;
    }

    if (typeof rerankMatch.relevance_score === 'number') {
      return rerankMatch.relevance_score;
    }

    if (typeof rerankMatch.score === 'number') {
      return rerankMatch.score;
    }

    return fallbackScore;
  }

  private buildRerankDocument(resource: OVSearchResource) {
    const images = this.collectMediaUrls(
      resource.image,
      resource.images,
      resource.image_url,
      resource.image_urls,
      resource.screenshot,
      resource.screenshots,
    );
    const videos = this.collectMediaUrls(
      resource.video,
      resource.videos,
      resource.video_url,
      resource.video_urls,
    );
    const text = this.buildRerankText(resource);

    if (images.length === 0 && videos.length === 0) {
      return text;
    }

    const document: RerankMultimodalDocument = {};
    if (text) {
      document.text = text;
    }
    if (images.length === 1) {
      document.image = images[0];
    } else if (images.length > 1) {
      document.image = images;
    }
    if (videos.length === 1) {
      document.video = videos[0];
    } else if (videos.length > 1) {
      document.video = videos;
    }

    return document;
  }

  private buildRerankText(resource: OVSearchResource) {
    const sections = [resource.title, resource.abstract, resource.content]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .map((value) => value.trim());

    if (sections.length === 0) {
      return resource.uri;
    }

    return sections.join('\n\n');
  }

  private collectMediaUrls(...values: unknown[]) {
    return values.flatMap((value) => this.toStringList(value));
  }

  private toStringList(value: unknown): string[] {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.toStringList(item));
    }

    return [];
  }
}
