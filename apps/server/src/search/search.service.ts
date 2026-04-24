import { Injectable, Inject } from '@nestjs/common';
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

@Injectable()
export class SearchService {
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

  /**
   * Phase 2.2: Rerank 二阶段强化检索
   */
  async find(
    params: FindParams,
    tenantId: string,
    user: { id: string; role: string },
  ) {
    const config = await this.settings.resolveOVConfig(tenantId);
    const start = Date.now();

    // 1. ACL 权限前置过滤 (Repository 层)
    const allowedUris = await this.nodeRepo.findAllowedUris(tenantId, user);

    // 2. Stage 1: 向量召回
    const stage1TopK = config.rerankEndpoint ? 20 : params.topK || 5;

    const body: any = {
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

    const data = await res.json();
    let resources = data?.result?.resources ?? [];

    // 3. Stage 2: Rerank 重排序
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
            documents: resources.map((r: any) => r.content || r.title || ''),
            model: config.rerankModel,
          }),
        });
        clearTimeout(timeoutId);

        if (rerankRes.ok) {
          const rerankData = await rerankRes.json();
          const results = rerankData.results || [];

          resources = resources
            .map((r: any, i: number) => {
              const rerankMatch = results.find((item: any) => item.index === i);
              return {
                ...r,
                stage1Score: r.score,
                score: rerankMatch ? rerankMatch.relevance_score : r.score,
                reranked: true,
              };
            })
            .sort((a: any, b: any) => b.score - a.score);

          resources = resources.slice(0, params.topK || 5);
        }
      } catch (err) {
        console.error(
          'Rerank failed, falling back to Stage 1 results:',
          err.message,
        );
      }
    }

    const latency = Date.now() - start;

    // 记录分析日志
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
    return res.json();
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
