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
        const [response, kbList] = await Promise.all([
          apiClient.get<AnalysisData>("/search/analysis"),
          apiClient.get<KnowledgeBase[]>("/knowledge-bases"),
        ]);
        if (active) {
          setData(response);
          setKbs(Array.isArray(kbList) ? kbList : []);
          setSelectedLogId(response.noAnswerLogs?.[0]?.id ?? "");
        }
      } catch (error: unknown) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "无答案洞察加载失败");
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

  const blindSpotHeadline = data?.noAnswerLogs?.[0];
  const selectedLog = data?.noAnswerLogs.find((log) => log.id === selectedLogId) ?? blindSpotHeadline ?? null;
  const suggestedKnowledgeBases = useMemo(() => {
    if (!selectedLog) {
      return [];
    }

    const keyword = `${selectedLog.query} ${selectedLog.scope}`.toLowerCase();
    const matches = kbs.filter((kb) => keyword.includes(kb.name.toLowerCase()));
    return matches.length > 0 ? matches.slice(0, 3) : kbs.slice(0, 3);
  }, [kbs, selectedLog]);

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="无答案洞察" subtitle="定位零命中问题，并直接进入补录闭环" />

      {loading ? (
        <ConsolePanel className="p-16 text-center font-mono text-sm font-black uppercase tracking-[0.24em] text-[var(--text-secondary)]">
          正在分析缺口样本...
        </ConsolePanel>
      ) : loadError ? (
        <ConsolePanel>
          <ConsoleEmptyState
            icon={AlertTriangle}
            title="无答案洞察加载失败"
            description={loadError}
            action={
              <ConsoleButton type="button" onClick={() => window.location.reload()}>
                重新加载
              </ConsoleButton>
            }
          />
        </ConsolePanel>
      ) : !data ? (
        <ConsolePanel>
          <ConsoleEmptyState
            icon={AlertTriangle}
            title="洞察数据暂不可用"
            description="当前无法读取检索分析数据，请检查后端分析接口或稍后重试。"
          />
        </ConsolePanel>
      ) : (
        <>
          <ConsoleStatsGrid className="lg:grid-cols-4">
            <ConsoleMetricCard label="总检索量" value={data.total.toLocaleString()} tone="brand" />
            <ConsoleMetricCard label="零命中" value={data.zeroResults.toLocaleString()} tone="danger" />
            <ConsoleMetricCard label="空窗占比" value={`${data.zeroRate}%`} tone="warning" />
            <ConsoleMetricCard label="已覆盖" value={(data.total - data.zeroResults).toLocaleString()} tone="success" />
          </ConsoleStatsGrid>

          <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <ConsolePanel className="p-6">
              <ConsolePanelHeader
                eyebrow="知识缺口预警"
                title="优先补齐高频缺口"
                actions={
                  <ConsoleIconTile tone="danger" className="h-12 w-12 shadow-[3px_3px_0px_#000]">
                    <DatabaseZap size={20} strokeWidth={2.5} />
                  </ConsoleIconTile>
                }
              />

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <ConsoleSurfaceCard tone="elevated">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    最新缺口样本
                  </p>
                  <div className="mt-4 border-l-[6px] border-[var(--danger)] pl-4">
                    <p className="font-sans text-xl font-black text-[var(--text-primary)]">
                      {blindSpotHeadline?.query ?? "暂无缺口样本"}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          检索范围
                        </p>
                        <p className="mt-1 font-mono text-xs font-bold text-[var(--text-secondary)]">
                          {blindSpotHeadline?.scope || "viking://*"}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          耗时
                        </p>
                        <p className="mt-1 font-mono text-xs font-bold text-[var(--text-secondary)]">
                          {blindSpotHeadline ? `${blindSpotHeadline.latencyMs}ms` : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ConsoleButton
                    type="button"
                    tone="dark"
                    onClick={() => router.push("/console/documents/import")}
                    className="mt-6"
                  >
                    打开补录通道
                    <ArrowRight size={14} strokeWidth={2.6} />
                  </ConsoleButton>
                </ConsoleSurfaceCard>

                <ConsoleSurfaceCard>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    七日趋势
                  </p>
                  <div className="mt-6 grid h-[220px] grid-cols-7 items-end gap-3 border-b-[3px] border-l-[3px] border-[var(--border)] px-3 pb-3 pt-4">
                    {trend.length === 0 ? (
                      <div className="col-span-7 flex h-full items-center justify-center font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        暂无近七日趋势数据
                      </div>
                    ) : (
                      trend.map((item) => (
                        <div key={item.day} className="flex h-full flex-col justify-end gap-2">
                          <div className="flex items-end gap-1">
                            <div
                              className="w-1/2 border-[2px] border-[var(--border)] bg-black"
                              style={{ height: `${item.totalHeight}%` }}
                            />
                            <div
                              className="w-1/2 border-[2px] border-[var(--border)] bg-[var(--danger)]"
                              style={{ height: `${item.voidHeight}%` }}
                            />
                          </div>
                          <div className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            {item.day.slice(5)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex gap-4 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    <span>黑柱=总检索</span>
                    <span>红柱=零命中</span>
                  </div>
                </ConsoleSurfaceCard>
              </div>
            </ConsolePanel>

            <ConsolePanel className="overflow-hidden">
              <div className="grid grid-cols-2 border-b-[3px] border-[var(--border)]">
                {[
                  ["blind", `零命中日志 [${data.noAnswerLogs.length}]`],
                  ["queries", `高频问题 [${data.topQueries.length}]`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key as "blind" | "queries")}
                    className={`px-5 py-4 text-left font-mono text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                      activeTab === key ? "bg-black text-white" : "bg-[var(--bg-card)] text-[var(--text-primary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "blind" ? (
                <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
                  {data.noAnswerLogs.length === 0 ? (
                    <ConsoleEmptyState icon={Siren} title="暂无零命中日志" description="当前没有需要补录的检索缺口样本。" />
                  ) : (
                    data.noAnswerLogs.map((log) => (
                      <div key={log.id} className="grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_140px_160px_140px]">
                        <button
                          type="button"
                          onClick={() => setSelectedLogId(log.id)}
                          className={`bg-[var(--bg-card)] px-5 py-5 text-left transition-colors ${
                            selectedLogId === log.id ? "bg-[var(--brand-muted)]" : ""
                          }`}
                        >
                          <p className="font-sans text-lg font-black text-[var(--danger)]">{log.query}</p>
                          <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            {log.scope || "viking://*"}
                          </p>
                        </button>
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-primary)]">
                          {log.latencyMs}ms
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          {new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5">
                          <ConsoleButton
                            type="button"
                            tone="warning"
                            onClick={() => router.push(`/console/documents/import?q=${encodeURIComponent(log.query)}`)}
                            className="w-full px-3 py-2"
                          >
                            补齐知识
                          </ConsoleButton>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
                  {data.topQueries.length === 0 ? (
                    <ConsoleEmptyState icon={SearchCheck} title="暂无热点问题" description="当前没有形成需要重点跟进的高频问题。" />
                  ) : (
                    data.topQueries.map((item, index) => (
                      <div
                        key={`${item.query}-${index}`}
                        className="grid gap-px bg-[var(--border)] lg:grid-cols-[90px_minmax(0,1fr)_120px_140px_120px]"
                      >
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-sm font-black text-[var(--text-muted)]">
                          #{String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-sans text-lg font-black text-[var(--text-primary)]">
                          {item.query}
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-sm font-black text-[var(--brand)]">
                          {item.count}
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-sm font-black text-[var(--text-primary)]">
                          {item.avgResults.toFixed(1)}
                        </div>
                        <div className="bg-[var(--bg-card)] px-5 py-5">
                          <ConsoleBadge tone={item.avgResults > 0 ? "success" : "danger"}>
                            {item.avgResults > 0 ? "已覆盖" : "待补齐"}
                          </ConsoleBadge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </ConsolePanel>
          </section>

          {selectedLog ? (
            <ConsolePanel className="p-6">
              <ConsolePanelHeader eyebrow="补齐闭环" title="缺口处理工作台" />

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <ConsoleSurfaceCard tone="elevated">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    当前缺口
                  </p>
                  <p className="mt-3 font-sans text-2xl font-black text-[var(--text-primary)]">{selectedLog.query}</p>
                  <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    作用范围：{selectedLog.scope || "viking://*"}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ConsoleButton
                      type="button"
                      onClick={() => router.push(`/console/documents/import?q=${encodeURIComponent(selectedLog.query)}`)}
                    >
                      <FilePlus2 size={14} strokeWidth={2.6} />
                      跳转导入
                    </ConsoleButton>
                    <ConsoleButton
                      type="button"
                      tone="warning"
                      onClick={() =>
                        router.push(
                          `/console/search?query=${encodeURIComponent(selectedLog.query)}&uri=${encodeURIComponent(selectedLog.scope || "")}`,
                        )
                      }
                    >
                      <SearchCheck size={14} strokeWidth={2.6} />
                      补充资源后验证
                    </ConsoleButton>
                  </div>
                </ConsoleSurfaceCard>

                <ConsoleSurfaceCard>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    关联知识库
                  </p>
                  {suggestedKnowledgeBases.length === 0 ? (
                    <div className="mt-4 border-[3px] border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-6 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      当前还没有可关联的知识库，请先创建知识库或完成导入。
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {suggestedKnowledgeBases.map((kb) => (
                        <ConsoleSurfaceCard key={kb.id} tone="elevated" className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-sans text-lg font-black text-[var(--text-primary)]">{kb.name}</p>
                            <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                              {kb.id}
                            </p>
                          </div>
                          <ConsoleButton
                            type="button"
                            tone="dark"
                            onClick={() => router.push(`/console/knowledge-tree?kbId=${kb.id}`)}
                            className="px-4 py-3"
                          >
                            <FolderTree size={14} strokeWidth={2.6} />
                            打开知识树
                          </ConsoleButton>
                        </ConsoleSurfaceCard>
                      ))}
                    </div>
                  )}
                </ConsoleSurfaceCard>
              </div>
            </ConsolePanel>
          ) : null}
        </>
      )}
    </div>
  );
}
