"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  DatabaseZap,
  SearchCheck,
  Siren,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"blind" | "queries">("blind");
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await apiClient.get<AnalysisData>("/search/analysis");
        if (active) {
          setData(response);
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

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="无答案洞察" subtitle="Blind Spot Radar / Zero-Hit Recovery Console" />

      {loading ? (
        <ConsolePanel className="p-16 text-center font-mono text-sm font-black uppercase tracking-[0.24em] text-[var(--text-secondary)]">
          正在分析缺口样本...
        </ConsolePanel>
      ) : !data ? (
        <ConsolePanel>
          <ConsoleEmptyState
            icon={AlertTriangle}
            title="洞察数据暂不可用"
            description="search analysis endpoint unavailable"
          />
        </ConsolePanel>
      ) : (
        <>
          <ConsoleStatsGrid className="lg:grid-cols-4">
            <ConsoleMetricCard label="Total Queries" value={data.total.toLocaleString()} tone="brand" />
            <ConsoleMetricCard label="Zero Hits" value={data.zeroResults.toLocaleString()} tone="danger" />
            <ConsoleMetricCard label="Void Rate" value={`${data.zeroRate}%`} tone="warning" />
            <ConsoleMetricCard label="Recovered" value={(data.total - data.zeroResults).toLocaleString()} tone="success" />
          </ConsoleStatsGrid>

          <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <ConsolePanel className="p-6">
              <ConsolePanelHeader
                eyebrow="Knowledge Void Alert"
                title="优先补齐高频缺口"
                actions={
                  <div className="flex h-12 w-12 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--danger)] text-white shadow-[3px_3px_0px_#000]">
                    <DatabaseZap size={20} strokeWidth={2.5} />
                  </div>
                }
              />

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Latest Blind Spot
                  </p>
                  <div className="mt-4 border-l-[6px] border-[var(--danger)] pl-4">
                    <p className="font-sans text-xl font-black text-[var(--text-primary)]">
                      {blindSpotHeadline?.query ?? "暂无缺口样本"}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          Scope
                        </p>
                        <p className="mt-1 font-mono text-xs font-bold text-[var(--text-secondary)]">
                          {blindSpotHeadline?.scope || "viking://*"}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          Latency
                        </p>
                        <p className="mt-1 font-mono text-xs font-bold text-[var(--text-secondary)]">
                          {blindSpotHeadline ? `${blindSpotHeadline.latencyMs}ms` : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ConsoleButton type="button" tone="dark" onClick={() => router.push("/console/documents/import")} className="mt-6">
                    打开补录通道
                    <ArrowRight size={14} strokeWidth={2.6} />
                  </ConsoleButton>
                </div>

                <div className="border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    Seven Day Radar
                  </p>
                  <div className="mt-6 grid h-[220px] grid-cols-7 items-end gap-3 border-b-[3px] border-l-[3px] border-[var(--border)] px-3 pb-3 pt-4">
                    {trend.length === 0 ? (
                      <div className="col-span-7 flex h-full items-center justify-center font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        no daily data
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
                </div>
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
                    <ConsoleEmptyState icon={Siren} title="暂无零命中日志" description="no blind spot logs" />
                  ) : (
                    data.noAnswerLogs.map((log) => (
                      <div key={log.id} className="grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_140px_160px_140px]">
                        <div className="bg-[var(--bg-card)] px-5 py-5">
                          <p className="font-sans text-lg font-black text-[var(--danger)]">{log.query}</p>
                          <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            {log.scope || "viking://*"}
                          </p>
                        </div>
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
                    <ConsoleEmptyState icon={SearchCheck} title="暂无热点问题" description="no high-frequency queries" />
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
                            {item.avgResults > 0 ? "covered" : "void"}
                          </ConsoleBadge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </ConsolePanel>
          </section>
        </>
      )}
    </div>
  );
}
