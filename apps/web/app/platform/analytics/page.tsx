"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivitySquare, ArrowUpRight, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/apiClient";

interface Overview {
  total: number;
  hitCount: number;
  zeroCount: number;
  hitRate: number;
  avgLatency: number;
  helpfulCount: number;
  unhelpfulCount: number;
  feedbackTotal: number;
}

interface UriStat {
  uri: string;
  count: number;
  hits: number;
  hitRate: number;
}

interface DailyStat {
  day: string;
  total: number;
  hits: number;
  hitRate: number;
  avgLatency: number;
}

interface QueryStat {
  query: string;
  count: number;
  hits: number;
  hitRate: number;
}

interface StatsData {
  overview: Overview;
  topUris: UriStat[];
  daily: DailyStat[];
  topQueries: QueryStat[];
}

function MetricCell({
  label,
  value,
  hint,
  accent = "var(--brand)",
}: {
  label: string;
  value: string;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col justify-between bg-[var(--bg-card)] px-6 py-5">
      <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</div>
      <div className="font-mono text-5xl font-black tracking-tighter tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{hint}</div>
    </div>
  );
}

function Histogram({
  data,
  keyName,
  color,
}: {
  data: DailyStat[];
  keyName: "total" | "hitRate" | "avgLatency";
  color: string;
}) {
  const maxValue = Math.max(...data.map((item) => item[keyName] || 0), 1);

  return (
    <div className="grid h-44 grid-cols-10 items-end gap-x-2 border-t border-[var(--border)] pt-4">
      {data.slice(-10).map((item) => {
        const value = item[keyName];
        const height = Math.max(8, Math.round((value / maxValue) * 160));
        return (
          <div key={`${keyName}-${item.day}`} className="flex flex-col items-center gap-2">
            <div className="w-full bg-[var(--bg-elevated)]" style={{ height }}>
              <div className="h-full w-full" style={{ background: color }} />
            </div>
            <span className="font-mono text-[9px] font-black tracking-[0.14em] text-[var(--text-muted)]">
              {new Date(item.day).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DataRow({
  rank,
  primary,
  secondary,
  value,
  status,
}: {
  rank: number;
  primary: string;
  secondary: string;
  value: string;
  status: string;
}) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)_120px_110px] gap-px bg-[var(--border)]">
      <div className="bg-[var(--bg-card)] px-3 py-4 font-mono text-[10px] font-black tracking-[0.2em] text-[var(--text-muted)]">
        {String(rank).padStart(2, "0")}
      </div>
      <div className="min-w-0 bg-[var(--bg-card)] px-4 py-4">
        <div className="truncate font-mono text-[11px] font-black tracking-[0.12em] text-[var(--text-primary)]">{primary}</div>
        <div className="mt-1 truncate font-mono text-[9px] font-bold tracking-[0.1em] text-[var(--text-muted)]">{secondary}</div>
      </div>
      <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-mono text-[11px] font-black tracking-[0.12em] text-[var(--brand)]">
        {value}
      </div>
      <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-mono text-[10px] font-black tracking-[0.12em] text-[var(--text-secondary)]">
        {status}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"uris" | "queries">("uris");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiClient.get<StatsData>("/search/stats-deep");
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const overview = data?.overview;
  const derived = useMemo(() => {
    if (!overview) return null;
    return {
      usefulRate: overview.feedbackTotal > 0 ? Math.round((overview.helpfulCount / overview.feedbackTotal) * 100) : 0,
      zeroRate: overview.total > 0 ? Math.round((overview.zeroCount / overview.total) * 100) : 0,
    };
  }, [overview]);

  return (
    <div className="theme-swiss flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[var(--brand)]">Platform Analytics</p>
          <h1 className="mt-2 font-sans text-5xl font-black tracking-tight">检索运营分析</h1>
          <p className="mt-3 max-w-3xl font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            命中率、延迟、URI 覆盖和反馈表现统一收口到一个细线分析面板。
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex h-11 items-center justify-center gap-2 border border-[var(--border)] px-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
        >
          <RefreshCw size={14} strokeWidth={1.8} className={loading ? "animate-spin" : ""} />
          刷新数据
        </button>
      </div>

      {!overview ? (
        <div className="border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center border border-[var(--border)] bg-[var(--bg-elevated)]">
            <ActivitySquare size={24} strokeWidth={1.8} className="text-[var(--brand)]" />
          </div>
          <p className="mt-5 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {loading ? "FETCHING PLATFORM METRICS" : "NO ANALYTICS DATA"}
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)] md:grid-cols-2 xl:grid-cols-4">
            <MetricCell
              label="Total Queries"
              value={overview.total.toLocaleString()}
              hint={`Hit ${overview.hitCount} / Zero ${overview.zeroCount}`}
            />
            <MetricCell
              label="Hit Rate"
              value={`${overview.hitRate}%`}
              hint={`Zero Rate ${derived?.zeroRate ?? 0}%`}
              accent={overview.hitRate >= 70 ? "var(--success)" : overview.hitRate >= 50 ? "var(--warning)" : "var(--danger)"}
            />
            <MetricCell
              label="Avg Latency"
              value={`${overview.avgLatency}ms`}
              hint={overview.avgLatency < 500 ? "Latency Healthy" : "Latency Elevated"}
              accent={overview.avgLatency < 500 ? "var(--success)" : "var(--warning)"}
            />
            <MetricCell
              label="Feedback Quality"
              value={`${derived?.usefulRate ?? 0}%`}
              hint={`Helpful ${overview.helpfulCount} / Total ${overview.feedbackTotal}`}
              accent="var(--info)"
            />
          </section>

          <section className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)] xl:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-[var(--bg-card)] px-6 py-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-sans text-2xl font-black tracking-tight">近十日趋势</h2>
                  <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    只保留直角柱体与等宽标签
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
                <div>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Query Volume</p>
                  <Histogram data={data.daily} keyName="total" color="var(--brand)" />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Hit Rate</p>
                  <Histogram data={data.daily} keyName="hitRate" color="var(--success)" />
                </div>
                <div>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">Latency</p>
                  <Histogram data={data.daily} keyName="avgLatency" color="var(--warning)" />
                </div>
              </div>
            </div>

            <div className="bg-[var(--bg-card)] px-6 py-6">
              <div className="mb-5 border-b border-[var(--border)] pb-4">
                <h2 className="font-sans text-2xl font-black tracking-tight">反馈剖面</h2>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  以细线和数字权重表达满意度
                </p>
              </div>
              <div className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)]">
                <MetricCell
                  label="Helpful"
                  value={String(overview.helpfulCount)}
                  hint="用户确认有效答案"
                  accent="var(--success)"
                />
                <MetricCell
                  label="Unhelpful"
                  value={String(overview.unhelpfulCount)}
                  hint="答案未解决问题"
                  accent="var(--danger)"
                />
              </div>
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-sans text-2xl font-black tracking-tight">
                  {activeTab === "uris" ? "Top URI Coverage" : "Top Query Hotspots"}
                </h2>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  以清单视图展示覆盖率和高频请求
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px border border-[var(--border)] bg-[var(--border)]">
                {(["uris", "queries"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] ${
                      activeTab === tab ? "bg-[var(--text-primary)] text-[var(--bg-card)]" : "bg-[var(--bg-card)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {tab === "uris" ? "URI" : "Query"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {activeTab === "uris"
                ? data.topUris.map((item, index) => (
                    <DataRow
                      key={item.uri}
                      rank={index + 1}
                      primary={item.uri}
                      secondary={`Hits ${item.hits} / Queries ${item.count}`}
                      value={`${item.hitRate}%`}
                      status={item.hitRate >= 70 ? "GOOD" : item.hitRate >= 45 ? "WATCH" : "RISK"}
                    />
                  ))
                : data.topQueries.map((item, index) => (
                    <DataRow
                      key={item.query}
                      rank={index + 1}
                      primary={item.query}
                      secondary={`Hits ${item.hits} / Queries ${item.count}`}
                      value={`${item.hitRate}%`}
                      status={item.hitRate >= 70 ? "GOOD" : item.hitRate >= 45 ? "WATCH" : "RISK"}
                    />
                  ))}
            </div>

            <div className="border-t border-[var(--border)] px-6 py-4">
              <div className="flex items-center justify-between font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <span>Analytics Feed</span>
                <span className="inline-flex items-center gap-2 text-[var(--brand)]">
                  <ArrowUpRight size={12} strokeWidth={1.8} />
                  Search Deep Stats
                </span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
