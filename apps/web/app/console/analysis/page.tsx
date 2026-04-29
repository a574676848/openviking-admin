"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  FolderTree,
  DatabaseZap,
  FilePlus2,
  SearchCheck,
  Siren,
  TrendingUp,
  BarChart3,
  Activity,
  Target,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleIconTile,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleSurfaceCard,
  ConsoleStatsGrid,
} from "@/components/console/primitives";

interface AnalysisLog {
  id: string;
  query: string;
  scope: string;
  tenantId: string;
  latencyMs: number;
  createdAt: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
}

interface TopQuery {
  query: string;
  count: number;
  avgResults: number;
}

interface DailyPoint {
  day: string;
  total: number;
  noAnswer: number;
}

interface AnalysisData {
  total: number;
  zeroResults: number;
  zeroRate: string;
  noAnswerLogs: AnalysisLog[];
  topQueries: TopQuery[];
  daily: DailyPoint[];
}

interface AnalysisSummaryResponse {
  total?: number;
  noAnswerLogs?: AnalysisLog[];
}

interface AnalysisDeepStatsResponse {
  overview?: {
    total?: number;
    zeroCount?: number;
  };
  topQueries?: TopQuery[];
  daily?: DailyPoint[];
}

const EMPTY_ANALYSIS_DATA: AnalysisData = {
  total: 0,
  zeroResults: 0,
  zeroRate: "0.0",
  noAnswerLogs: [],
  topQueries: [],
  daily: [],
};

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeAnalysisData(
  summary: AnalysisSummaryResponse | null,
  deepStats: AnalysisDeepStatsResponse | null,
): AnalysisData {
  const noAnswerLogs = Array.isArray(summary?.noAnswerLogs) ? summary.noAnswerLogs : [];
  const total = toNumber(deepStats?.overview?.total, toNumber(summary?.total));
  const zeroResults = toNumber(deepStats?.overview?.zeroCount, noAnswerLogs.length);
  const normalizedZeroResults = Math.min(zeroResults, total);
  const zeroRate = total > 0 ? ((normalizedZeroResults / total) * 100).toFixed(1) : "0.0";

  return {
    total,
    zeroResults: normalizedZeroResults,
    zeroRate,
    noAnswerLogs,
    topQueries: (Array.isArray(deepStats?.topQueries) ? deepStats.topQueries : []).map(q => ({
      ...q,
      count: toNumber(q.count),
      avgResults: toNumber(q.avgResults)
    })),
    daily: (Array.isArray(deepStats?.daily) ? deepStats.daily : []).map(d => ({
      ...d,
      total: toNumber(d.total),
      noAnswer: toNumber(d.noAnswer)
    })),
  };
}

export default function AnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<"blind" | "queries">("blind");
  const [selectedLogId, setSelectedLogId] = useState("");
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadError("");
      try {
        const [summary, deepStats, kbList] = await Promise.all([
          apiClient.get<AnalysisSummaryResponse>("/search/analysis"),
          apiClient.get<AnalysisDeepStatsResponse>("/search/stats-deep").catch(() => null),
          apiClient.get<KnowledgeBase[]>("/knowledge-bases"),
        ]);
        if (active) {
          const normalized = normalizeAnalysisData(summary, deepStats);
          setData(normalized);
          setKbs(Array.isArray(kbList) ? kbList : []);
          setSelectedLogId(normalized.noAnswerLogs[0]?.id ?? "");
        }
      } catch (error: unknown) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "无答案洞察加载失败");
          setData(EMPTY_ANALYSIS_DATA);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const trend = useMemo(() => {
    if (!data?.daily?.length) {
      return [];
    }

    const maxTotal = Math.max(...data.daily.map((item) => item.total), 1);
    return data.daily.slice(-7).map((item) => ({
      ...item,
      totalHeight: Math.max((item.total / maxTotal) * 100, item.total > 0 ? 8 : 0),
      voidHeight: Math.max((item.noAnswer / maxTotal) * 100, item.noAnswer > 0 ? 6 : 0),
    }));
  }, [data]);

  const selectedLog = useMemo(() => {
    return data?.noAnswerLogs.find((log) => log.id === selectedLogId) || data?.noAnswerLogs[0] || null;
  }, [data, selectedLogId]);

  const suggestedKnowledgeBases = useMemo(() => {
    if (!selectedLog) return [];
    const keyword = `${selectedLog.query} ${selectedLog.scope}`.toLowerCase();
    const matches = kbs.filter((kb) => keyword.includes(kb.name.toLowerCase()));
    return matches.length > 0 ? matches.slice(0, 3) : kbs.slice(0, 3);
  }, [kbs, selectedLog]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
          <p className="font-sans text-xs font-black uppercase tracking-[0.24em] text-[var(--brand)]">
            分析引擎解析中...
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <ConsolePanel className="p-12">
        <ConsoleEmptyState
          icon={AlertTriangle}
          title={loadError ? "加载失败" : "暂无数据"}
          description={loadError || "无法检索到分析样本，请稍后再试。"}
          action={
            <ConsoleButton type="button" onClick={() => window.location.reload()}>
              重新加载
            </ConsoleButton>
          }
        />
      </ConsolePanel>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-8 pb-10">
      <ConsolePageHeader
        title="无答案洞察"
        subtitle="精准捕获检索缺口，数据化驱动知识库进化闭环"
        icon={Activity}
      />

      {/* 核心指标统计 */}
      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard 
          label="检索请求总量" 
          value={data.total.toLocaleString()} 
          tone="brand" 
          icon={Activity}
        />
        <ConsoleMetricCard 
          label="零命中请求" 
          value={data.zeroResults.toLocaleString()} 
          tone="danger" 
          icon={Siren}
        />
        <ConsoleMetricCard 
          label="零命中率" 
          value={`${data.zeroRate}%`} 
          tone="warning" 
          icon={Target}
        />
        <ConsoleMetricCard 
          label="检索覆盖率" 
          value={`${(100 - parseFloat(data.zeroRate)).toFixed(1)}%`} 
          tone="success" 
          icon={SearchCheck}
        />
      </ConsoleStatsGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* 左侧：趋势分析与高危监控 */}
        <div className="flex flex-col gap-6">
          <ConsolePanel className="relative overflow-hidden p-6">
            <ConsolePanelHeader
              eyebrow="Intelligence Insight"
              title="核心缺口洞察"
              actions={
                <ConsoleBadge tone="brand" className="animate-pulse">
                  <Activity size={12} strokeWidth={3} />
                  实时监测中
                </ConsoleBadge>
              }
            />

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
              <ConsoleSurfaceCard tone="elevated" className="flex flex-col justify-between border-dashed">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      LATEST GAP / 最新缺口样本
                    </span>
                    <TrendingUp size={14} className="text-[var(--danger)] opacity-80" />
                  </div>
                  <div className="mt-6 border-l-4 border-[var(--danger)]/50 pl-4">
                    <h3 className="line-clamp-2 font-sans text-xl font-black text-[var(--text-primary)]">
                      {data.noAnswerLogs[0]?.query ?? "全域已对齐"}
                    </h3>                    <p className="mt-2 font-sans text-[10px] font-bold text-[var(--text-muted)]">
                      {data.noAnswerLogs[0]?.scope || "viking://global"}
                    </p>
                  </div>
                </div>
                <ConsoleButton
                  type="button"
                  tone="brand"
                  onClick={() => router.push("/console/documents/import")}
                  className="mt-8 w-full group h-9 text-[11px]"
                >
                  <ArrowRight size={14} strokeWidth={2.6} className="mr-2 transition-transform group-hover:-translate-x-1" />
                  <span>立即补录知识资源</span>
                </ConsoleButton>
              </ConsoleSurfaceCard>

              <ConsoleSurfaceCard className="bg-transparent border-dashed">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    TREND / 近七日趋势
                  </span>
                  <BarChart3 size={14} className="text-[var(--text-muted)]" />
                </div>
                
                <div className="mt-6 flex h-[180px] items-end gap-2 border-b border-l border-[var(--border)] px-2 pb-1 pt-4 bg-[var(--bg-elevated)]/5">
                  {trend.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)] opacity-30">
                      <Activity size={20} className="animate-pulse" />
                    </div>
                  ) : (
                    trend.map((item) => (
                      <div key={item.day} className="group relative flex h-full flex-1 flex-col justify-end gap-1">
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 scale-75 rounded bg-[var(--text-primary)] px-2 py-1 font-sans text-[9px] font-black text-[var(--bg-card)] opacity-0 shadow-xl transition-all group-hover:scale-100 group-hover:opacity-100">
                          {item.total}
                        </div>
                        <div
                          className="w-full rounded-t-sm bg-[var(--brand)]/20 ring-1 ring-inset ring-[var(--brand)]/10 transition-all group-hover:bg-[var(--brand)]/40 group-hover:ring-[var(--brand)]/30"
                          style={{ height: `${item.totalHeight}%` }}
                        >
                          <div
                            className="w-full bg-[var(--danger)] shadow-[0_-2px_8px_var(--danger)]/30 transition-all"
                            style={{ height: `${(item.noAnswer / (item.total || 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-center font-sans text-[9px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                          {item.day.split('-').slice(1).join('/')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </ConsoleSurfaceCard>
            </div>
          </ConsolePanel>

          {/* 处理工作台 */}
          {selectedLog && (
            <ConsolePanel className="relative overflow-hidden p-6">
              <ConsolePanelHeader eyebrow="Closing the Loop" title="知识补齐工作台" />

              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ConsoleSurfaceCard tone="elevated" className="flex flex-col justify-between">
                  <div>
                    <span className="font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      ACTIVE QUERY / 当前待处理
                    </span>
                    <h2 className="mt-4 font-sans text-3xl font-black text-[var(--text-primary)]">
                      {selectedLog.query}
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-4 font-sans text-[10px] font-bold text-[var(--text-muted)]">
                      <div className="flex items-center gap-1.5">
                        <span className="opacity-60">耗时:</span>
                        <span className="text-[var(--brand)]">{selectedLog.latencyMs}ms</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="opacity-60">来源:</span>
                        <span>{selectedLog.scope || "viking://global"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-10 flex gap-3">
                    <ConsoleButton
                      tone="brand"
                      className="flex-1 h-9 text-[11px]"
                      onClick={() => router.push(`/console/documents/import?q=${encodeURIComponent(selectedLog.query)}`)}
                    >
                      <FilePlus2 size={15} className="mr-2" />
                      跳转导入
                    </ConsoleButton>
                    <ConsoleButton
                      tone="neutral"
                      className="flex-1 h-9 text-[11px] border"
                      style={{ 
                        backgroundColor: "var(--bg-base)", 
                        color: "var(--text-secondary)",
                        borderColor: "var(--border)"
                      }}
                      onClick={() => router.push(`/console/search?query=${encodeURIComponent(selectedLog.query)}`)}
                    >
                      <SearchCheck size={15} className="mr-2" />
                      <span>深度排查</span>
                    </ConsoleButton>
                  </div>
                </ConsoleSurfaceCard>

                <ConsoleSurfaceCard className="bg-transparent border-dashed">
                  <span className="font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    RECOMMENDED KB / 推荐知识库
                  </span>
                  <div className="mt-4 space-y-2">
                    {suggestedKnowledgeBases.length > 0 ? (
                      suggestedKnowledgeBases.map((kb) => (
                        <div key={kb.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[var(--brand)]">
                          <div className="min-w-0">
                            <p className="truncate font-sans text-sm font-bold">{kb.name}</p>
                            <p className="truncate font-sans text-[9px] text-[var(--text-muted)]">ID: {kb.id}</p>
                          </div>
                          <ConsoleButton
                            tone="dark"
                            className="px-3 h-7 text-[10px]"
                            onClick={() => router.push(`/console/knowledge-tree?kbId=${kb.id}`)}
                          >
                            <FolderTree size={12} className="mr-1.5" />
                            <span>管理</span>
                          </ConsoleButton>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center font-sans text-[10px] text-[var(--text-muted)]">
                        暂无推荐库，请先创建。
                      </p>
                    )}
                  </div>
                </ConsoleSurfaceCard>
              </div>
            </ConsolePanel>
          )}
        </div>

        {/* 右侧：列表切换 (缺口样本 vs 热点排行) */}
        <ConsolePanel className="flex flex-col overflow-hidden">
          <div className="flex border-b border-[var(--border)]">
            {[
              { id: "blind", label: "缺口样本流水", count: data.noAnswerLogs.length },
              { id: "queries", label: "热点查询排行", count: data.topQueries.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-1 flex-col items-center gap-1 py-4 transition-all relative ${
                  activeTab === tab.id 
                    ? "bg-[var(--bg-elevated)] text-[var(--brand)]" 
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <span className="font-sans text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                <span className="font-sans text-xs font-bold">[{tab.count}]</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 h-1 w-full bg-[var(--brand)] shadow-[0_0_8px_var(--brand)]" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto bg-[var(--bg-card)]">
            {activeTab === "blind" ? (
              <div className="divide-y divide-[var(--border)]">
                {data.noAnswerLogs.length === 0 ? (
                  <div className="py-24">
                    <ConsoleEmptyState icon={SearchCheck} title="全域已覆盖" description="当前没有检测到待处理的检索缺口。" />
                  </div>
                ) : (
                  data.noAnswerLogs.map((log, index) => {
                    const isTop3 = index < 3;
                    const rankColor = index === 0 ? "text-[#F59E0B]" : index === 1 ? "text-[#94A3B8]" : index === 2 ? "text-[#B45309]" : "text-[var(--text-primary)]";
                    const fontClass = isTop3 ? "font-black" : "font-medium";
                    const badgeTone = index === 0 ? "warning" : index === 1 ? "dark" : index === 2 ? "dark" : "default";
                    
                    return (
                      <div 
                        key={log.id}
                        onClick={() => setSelectedLogId(log.id)}
                        className={`group flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--brand-muted)]/5 ${
                          selectedLogId === log.id ? "bg-[var(--brand-muted)]/10" : ""
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`truncate font-sans opacity-90 ${fontClass} ${rankColor}`}>{log.query}</p>
                            <ConsoleBadge tone={badgeTone}>
                              {isTop3 ? `TOP ${index + 1}` : "样本"}
                            </ConsoleBadge>
                          </div>
                          <p className="mt-1 truncate font-sans text-[10px] text-[var(--text-muted)]">
                            {new Date(log.createdAt).toLocaleString()} · {log.latencyMs}ms
                          </p>
                        </div>
                        <ArrowRight size={14} className={`text-[var(--brand)] transition-transform ${selectedLogId === log.id ? "translate-x-0" : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"}`} />
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {data.topQueries.length === 0 ? (
                  <div className="py-24">
                    <ConsoleEmptyState icon={BarChart3} title="暂无排行" description="当前流量尚不足以生成热点排行。" />
                  </div>
                ) : (
                  data.topQueries.map((item, index) => {
                    const isTop3 = index < 3;
                    const rankColor = index === 0 ? "text-[#F59E0B]" : index === 1 ? "text-[#94A3B8]" : index === 2 ? "text-[#B45309]" : "text-[var(--text-muted)]";
                    const fontClass = isTop3 ? "font-black" : "font-medium";
                    const queryColor = isTop3 ? (index === 0 ? "text-[#F59E0B]" : index === 1 ? "text-[#94A3B8]" : "text-[#B45309]") : "text-[var(--text-primary)]";
                    
                    return (
                      <div key={index} className="flex items-center gap-4 px-6 py-4">
                        <span className={`font-sans text-xs ${isTop3 ? "font-black" : "font-bold"} ${rankColor}`}>
                          #{String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`truncate font-sans ${fontClass} ${queryColor}`}>{item.query}</p>
                          <div className="mt-1 flex gap-4 font-sans text-[10px] font-bold text-[var(--text-muted)]">
                            <span>频次: <span className="text-[var(--brand)]">{item.count}</span></span>
                            <span>平均召回: <span className={(item.avgResults ?? 0) > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>{(item.avgResults ?? 0).toFixed(1)}</span></span>
                          </div>
                        </div>
                        <ConsoleBadge tone={(item.avgResults ?? 0) > 0 ? "success" : "danger"}>
                          {(item.avgResults ?? 0) > 0 ? "已覆盖" : "缺口"}
                        </ConsoleBadge>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </ConsolePanel>
      </div>
    </div>
  );
}
