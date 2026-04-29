"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  PlatformButton,
  PlatformDataRow,
  PlatformFooterBar,
  PlatformMetric,
  PlatformMiniChart,
  PlatformPanel,
  PlatformPageHeader,
  PlatformSegmentedControl,
  PlatformSectionTitle,
  PlatformStatusPanel,
} from "@/components/ui/platform-primitives";

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

function Histogram({
  data,
  keyName,
  color,
}: {
  data: DailyStat[];
  keyName: "total" | "hitRate" | "avgLatency";
  color: string;
}) {
  const displayData = data.slice(-10);
  const rawValues = displayData.map((item) => item[keyName] || 0);
  const maxVal = Math.max(...rawValues, 1);

  // 仅用于生成网格线
  const scales = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];

  return (
    <div className="mt-4 flex w-full flex-col gap-2">
      <div className="relative flex h-80 w-full">
        {/* 图表主区域 */}
        <div className="relative flex-1">
          {/* 背景网格线 */}
          <div className="absolute inset-0 flex flex-col justify-between pb-6">
            {scales.map((_, i) => (
              <div
                key={i}
                className="h-px w-full border-b border-dashed border-[var(--border)] opacity-30"
              />
            ))}
          </div>

          {/* 柱状图容器 */}
          <div className="absolute inset-0 flex items-end justify-between px-2 pb-6 pt-10">
            {displayData.map((item) => {
              const value = item[keyName];
              const percentage = (value / maxVal) * 100;
              const label = keyName === "hitRate" ? `${value}%` : String(Math.round(value));

              return (
                <div
                  key={item.day}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                >
                  <span className="mb-1 font-sans text-[9px] font-black text-[var(--text-primary)] opacity-80 group-hover:opacity-100">
                    {label}
                  </span>

                  <div
                    className="w-4 bg-[var(--bg-elevated)] transition-all sm:w-6"
                    style={{ height: `${percentage}%` }}
                  >
                    <div
                      className="h-full w-full opacity-80 transition-opacity group-hover:opacity-100"
                      style={{ background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X轴标签与底线 */}
      <div className="flex justify-between border-t border-[var(--border)] px-2 pt-2">
        {displayData.map((item) => (
          <span
            key={item.day}
            className="flex-1 text-center font-sans text-[9px] font-black tracking-tighter text-[var(--text-muted)]"
          >
            {new Date(item.day).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<"uris" | "queries">("uris");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const payload = await apiClient.get<StatsData>("/search/stats-deep");
      setData(payload);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "平台检索分析加载失败");
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
    <div className="flex flex-col gap-8">
      <PlatformPageHeader
        title={
          <>
            <h1 className="mt-2 font-sans text-5xl font-black tracking-tight">检索运营分析</h1>
          </>
        }
        subtitle="命中率、延迟、URI 覆盖和反馈表现统一收口到一个细线分析面板。"
        subtitleClassName="mt-3 max-w-3xl text-[11px] tracking-[0.12em] normal-case"
        actions={
          <PlatformButton
            type="button"
            onClick={load}
            className="h-11 px-4"
          >
            <RefreshCw size={14} strokeWidth={1.8} className={loading ? "animate-spin" : ""} />
            刷新数据
          </PlatformButton>
        }
      />

      {loadError ? (
        <PlatformStatusPanel
          title="分析数据加载失败"
          description={loadError}
          action={
            <PlatformButton type="button" tone="danger" onClick={load} className="px-4 py-2 text-[10px]">
              重试加载
            </PlatformButton>
          }
          className="border-[var(--danger)]"
        />
      ) : !overview ? (
        <PlatformStatusPanel
          title={loading ? "正在同步平台指标" : "暂无分析数据"}
          description={loading ? "平台检索指标正在同步。" : "当前还没有可展示的运营分析样本。"}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)] md:grid-cols-2 xl:grid-cols-4">
            <PlatformMetric
              label="检索总量"
              value={overview.total.toLocaleString()}
              hint={`命中 ${overview.hitCount} / 无结果 ${overview.zeroCount}`}
              className="border-0 shadow-none"
            />
            <PlatformMetric
              label="命中率"
              value={`${overview.hitRate}%`}
              hint={`无结果占比 ${derived?.zeroRate ?? 0}%`}
              accent={overview.hitRate >= 70 ? "var(--success)" : overview.hitRate >= 50 ? "var(--warning)" : "var(--danger)"}
              className="border-0 shadow-none"
            />
            <PlatformMetric
              label="平均延迟"
              value={`${overview.avgLatency}ms`}
              hint={overview.avgLatency < 500 ? "延迟健康" : "延迟偏高"}
              accent={overview.avgLatency < 500 ? "var(--success)" : "var(--warning)"}
              className="border-0 shadow-none"
            />
            <PlatformMetric
              label="反馈质量"
              value={`${derived?.usefulRate ?? 0}%`}
              hint={`有效 ${overview.helpfulCount} / 总反馈 ${overview.feedbackTotal}`}
              accent="var(--info)"
              className="border-0 shadow-none"
            />
          </section>

          <section className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)] xl:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-[var(--bg-card)] px-6 py-6 flex flex-col h-full">
              <PlatformSectionTitle
                title="近十日趋势"
                className="mb-5"
              />
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 flex-1">
                <PlatformMiniChart label="检索量">
                  <Histogram data={data.daily} keyName="total" color="var(--brand)" />
                </PlatformMiniChart>
                <PlatformMiniChart label="命中率">
                  <Histogram data={data.daily} keyName="hitRate" color="var(--success)" />
                </PlatformMiniChart>
                <PlatformMiniChart label="延迟">
                  <Histogram data={data.daily} keyName="avgLatency" color="var(--warning)" />
                </PlatformMiniChart>
              </div>
            </div>

            <div className="bg-[var(--bg-card)] px-6 py-6">
              <PlatformSectionTitle
                title="反馈剖面"
                subtitle="以细线和数字权重表达满意度"
                className="mb-5 border-b border-[var(--border)] pb-4"
              />
              <div className="grid grid-cols-1 gap-px border border-[var(--border)] bg-[var(--border)]">
                <PlatformMetric
                  label="有效反馈"
                  value={String(overview.helpfulCount)}
                  hint="用户确认有效答案"
                  accent="var(--success)"
                  className="border-0 shadow-none"
                />
                <PlatformMetric
                  label="无效反馈"
                  value={String(overview.unhelpfulCount)}
                  hint="答案未解决问题"
                  accent="var(--danger)"
                  className="border-0 shadow-none"
                />
              </div>
            </div>
          </section>

          <PlatformPanel className="overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <PlatformSectionTitle
                  title={activeTab === "uris" ? "高频 URI 覆盖" : "高频 Query 热点"}
                  subtitle="以清单视图展示覆盖率和高频请求"
                  className="mb-0"
                />
              </div>
              <PlatformSegmentedControl
                value={activeTab}
                onChange={setActiveTab}
                items={[
                  { value: "uris", label: "URI" },
                  { value: "queries", label: "Query 热点" },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {activeTab === "uris"
                ? data.topUris.map((item, index) => (
                    <PlatformDataRow
                      key={item.uri}
                      rank={index + 1}
                      primary={item.uri}
                      secondary={`命中 ${item.hits} / 请求 ${item.count}`}
                      value={`${item.hitRate}%`}
                      status={item.hitRate >= 70 ? "稳定" : item.hitRate >= 45 ? "关注" : "风险"}
                    />
                  ))
                : data.topQueries.map((item, index) => (
                    <PlatformDataRow
                      key={item.query}
                      rank={index + 1}
                      primary={item.query}
                      secondary={`命中 ${item.hits} / 请求 ${item.count}`}
                      value={`${item.hitRate}%`}
                      status={item.hitRate >= 70 ? "稳定" : item.hitRate >= 45 ? "关注" : "风险"}
                    />
                  ))}
            </div>

            <PlatformFooterBar
              leading={
                <span className="inline-flex items-center gap-2">
                  数据来源：检索日志
                  <ArrowUpRight size={12} strokeWidth={1.8} className="text-[var(--brand)]" />
                </span>
              }
              className="justify-center"
            />
          </PlatformPanel>
        </>
      )}
    </div>
  );
}
