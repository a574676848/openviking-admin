"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useRef } from "react";
import {
  PlatformFooterBar,
  PlatformButton,
  PlatformMetric,
  PlatformPanel,
  PlatformPageHeader,
  PlatformStatusPanel,
} from "@/components/ui/platform-primitives";
import { Search, AlertTriangle, Clock, ArrowUpRight, Database, RefreshCw } from "lucide-react";

interface DashboardData {
  kbCount: number;
  platformKbCount?: number;
  taskCount: number;
  searchCount: number;
  zeroCount: number;
  failedTasks: number;
  runningTasks: number;
  tenantCount?: number;
  tenantSearchTop?: TenantLeaderboardItem[];
  tenantKnowledgeBaseTop?: TenantLeaderboardItem[];
  recentTasks: Record<string, unknown>[];
  health: { ok: boolean; message?: string };
  queue: {
    Embedding?: number;
    Semantic?: number;
    "Semantic-Nodes"?: number;
  } | null;
}

interface TenantLeaderboardItem {
  tenantId: string;
  tenantName: string;
  value: number;
}

interface LogItem {
  action: string;
  target: string;
  time: string;
  status: string;
  tone: "brand" | "success" | "warning" | "danger";
}

function getTopRankVisual(index: number) {
  if (index === 0) {
    return {
      panelClassName:
        "border-[#f59e0b] bg-[linear-gradient(135deg,rgba(245,158,11,0.22),rgba(245,158,11,0.08))]",
      badgeClassName:
        "border-[#f59e0b]/50 bg-[#f59e0b] text-[#1f1300]",
      textClassName: "text-[#8a5200]",
    };
  }
  if (index === 1) {
    return {
      panelClassName:
        "border-[#94a3b8] bg-[linear-gradient(135deg,rgba(148,163,184,0.24),rgba(148,163,184,0.08))]",
      badgeClassName:
        "border-[#94a3b8]/50 bg-[#cbd5e1] text-[#1e293b]",
      textClassName: "text-[#475569]",
    };
  }
  if (index === 2) {
    return {
      panelClassName:
        "border-[#fb7185] bg-[linear-gradient(135deg,rgba(251,113,133,0.22),rgba(251,113,133,0.08))]",
      badgeClassName:
        "border-[#fb7185]/50 bg-[#fb7185] text-[#3b0a18]",
      textClassName: "text-[#be123c]",
    };
  }
  return {
    panelClassName: "border-transparent bg-[var(--bg-card)]",
    badgeClassName:
      "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
    textClassName: "text-[var(--text-muted)]",
  };
}

function ScrambleNumber({
  value,
  suffix = "",
}: {
  value: string | number;
  suffix?: React.ReactNode;
}) {
  const [display, setDisplay] = useState<string>(String(value));
  const prevValue = useRef(value);

  useEffect(() => {
    if (value === prevValue.current) return;
    prevValue.current = value;

    if (
      value === undefined ||
      value === null ||
      value === "---" ||
      value === "--" ||
      value === "--.-"
    ) {
      setTimeout(() => setDisplay(String(value)), 0);
      return;
    }
    const target = String(value);
    const chars = "0101010101ABCDEF!@#$";
    let iteration = 0;

    const interval = setInterval(() => {
      setDisplay(
        target
          .split("")
          .map((char, index) => {
            if (index < iteration) return char;
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join(""),
      );

      if (iteration >= target.length) {
        clearInterval(interval);
      }
      iteration += 1 / 3;
    }, 30);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <>
      {display}
      {suffix}
    </>
  );
}

function TenantLeaderboardPanel({
  title,
  description,
  items,
  loading,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: TenantLeaderboardItem[];
  loading: boolean;
  emptyMessage: string;
}) {
  return (
    <PlatformPanel className="overflow-hidden border-[var(--border)] shadow-none">
      <PlatformFooterBar
        leading={title}
        className="border-t-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 tracking-[0.2em] text-[var(--text-primary)]"
      />
      <div className="border-b border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--text-muted)]">
        {description}
      </div>
      {loading ? (
        <div className="px-5 py-8 text-sm text-[var(--text-muted)]">加载中...</div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[var(--text-muted)]">{emptyMessage}</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map((item, index) => {
            const visual = getTopRankVisual(index);
            return (
              <div
                key={item.tenantId}
                className={`mx-2.5 my-1.5 flex items-center gap-3 rounded-[var(--radius-base)] border px-3.5 py-3 ${visual.panelClassName}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${visual.badgeClassName}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-sans text-sm font-bold text-[var(--text-primary)]">
                    {item.tenantName}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {item.tenantId}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-sans text-xl font-bold tabular-nums text-[var(--text-primary)]">
                    {item.value.toLocaleString()}
                  </div>
                  <div className={`mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${visual.textClassName}`}>
                    Top {index + 1}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PlatformPanel>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [dashData] = await Promise.all([
        apiClient.get<DashboardData>("/system/dashboard"),
        apiClient.get("/search/analysis").catch(() => null),
      ]);

      setData(dashData);

      const recentStream: LogItem[] = [];
      if (dashData?.recentTasks) {
        dashData.recentTasks
          .slice(0, 10)
          .forEach((t: Record<string, unknown>) => {
            recentStream.push({
              action: "导入任务",
              target: (t.targetUri || t.sourceType || "URL/文档") as string,
              time: new Date(t.createdAt as string).toLocaleTimeString(),
              status:
                t.status === "done"
                  ? "成功"
                  : t.status === "failed"
                    ? "失败"
                    : "运行",
              tone:
                t.status === "failed"
                  ? "danger"
                  : t.status === "running"
                    ? "warning"
                    : "success",
            });
          });
      }

      setLogs([
        {
          action: "系统守望者",
          target: "core_engine_v1",
          time: new Date().toLocaleTimeString(),
          status: "在线",
          tone: "brand",
        },
        ...recentStream,
      ]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "平台总览加载失败");
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const zeroRate =
    data && data.searchCount > 0
      ? ((data.zeroCount / data.searchCount) * 100).toFixed(1)
      : "0.0";
  const hitRate =
    data && data.searchCount > 0
      ? (100 - parseFloat(zeroRate)).toFixed(1)
      : "100.0";

  return (
    <div className="w-full min-h-full flex flex-col gap-8 pb-10">
      <PlatformPageHeader
        className="mb-0"
        title={
          <div>
            <div className="text-[var(--text-primary)]">
              <h1 className="mb-2 text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-6xl">平台总览</h1>
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] text-[10px]">// 全局系统观察与平台运行控制</div>
          </div>
        }
        actions={
          <PlatformButton type="button" onClick={() => void fetchData()} disabled={loading}>
            <RefreshCw size={14} strokeWidth={2.2} className={loading ? "animate-spin" : undefined} />
            刷新
          </PlatformButton>
        }
      />

      {loadError ? (
        <PlatformStatusPanel
          title="平台总览加载失败"
          description={loadError}
          className="mb-0 border-[var(--danger)]"
        />
      ) : null}

      {/* Bento Grid: Hero Metrics */}
      <div className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] rounded-[var(--radius-base)] overflow-hidden md:grid-cols-4">
        <PlatformMetric
          label="导入任务总数"
          value={
            <ScrambleNumber
              value={loading ? "---" : data?.taskCount?.toLocaleString() || "0"}
            />
          }
          className="min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8 border-none rounded-[var(--radius-base)]"
          valueClassName="text-5xl md:text-6xl lg:text-7xl"
          labelClassName="tracking-[0.22em]"
          hint="// 平台范围内已触发的所有知识加工任务总计"
        />

        <PlatformMetric
          label="活跃租户"
          value={
            <ScrambleNumber
              value={loading ? "--" : (data?.tenantCount ?? 0).toString()}
            />
          }
          className="flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8 border-none rounded-[var(--radius-base)]"
          valueClassName="text-5xl md:text-6xl"
          labelClassName="tracking-[0.22em]"
          hint="// 当前系统中注册且有效的租户实体数量"
        />

        <PlatformMetric
          label="全局命中率"
          value={<ScrambleNumber value={loading ? "--.-" : `${hitRate}%`} />}
          accent="var(--success)"
          className="flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8 border-none rounded-[var(--radius-base)]"
          valueClassName="text-5xl md:text-6xl"
          labelClassName="tracking-[0.22em]"
          hint="// 所有租户检索请求中有答案输出的比例"
        />

        <PlatformMetric
          label="平台健康状态"
          value={loading ? "检测中" : data?.health?.ok ? "核心在线" : "运行受限"}
          accent={data?.health?.ok ? "var(--success)" : "var(--danger)"}
          className="flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8 border-none rounded-[var(--radius-base)]"
          valueClassName={data?.health?.ok ? "text-4xl md:text-5xl text-[var(--success)]" : "text-4xl md:text-5xl text-[var(--danger)]"}
          labelClassName="tracking-[0.22em]"
          hint={`// ${loading ? "平台核心与引擎连通性检测中" : data?.health?.ok ? "当前平台核心引擎状态正常" : "当前平台核心运行受限，需进一步排查"}`}
        />
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5 transition-colors hover:border-[var(--brand)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <Search size={18} strokeWidth={1.8} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">全局检索请求</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {loading ? "--" : (data?.searchCount ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5 transition-colors hover:border-[var(--brand)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <Database size={18} strokeWidth={1.8} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">平台知识库总数</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {loading ? "--" : (data?.platformKbCount ?? data?.kbCount ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5 transition-colors hover:border-[var(--danger)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <AlertTriangle size={18} strokeWidth={1.8} className="text-[var(--danger)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">全量失败任务</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--danger)]">
              {loading ? "--" : (data?.failedTasks ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TenantLeaderboardPanel
          title="租户检索排行 Top 5"
          description="// 按租户累计检索请求量排序，便于快速识别平台最活跃的知识消费方"
          items={data?.tenantSearchTop ?? []}
          loading={loading}
          emptyMessage="暂无租户检索数据"
        />
        <TenantLeaderboardPanel
          title="租户知识库排行 Top 5"
          description="// 按租户当前知识库数量排序，平台可直接看到知识资产分布"
          items={data?.tenantKnowledgeBaseTop ?? []}
          loading={loading}
          emptyMessage="暂无租户知识库数据"
        />
      </div>

      {/* Activity Logs Panel */}
      <PlatformPanel className="overflow-hidden border-[var(--border)] shadow-none">
        <PlatformFooterBar
          leading="实时系统采样流"
          className="border-t-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4 tracking-[0.2em] text-[var(--text-primary)]"
        />
        <div className="divide-y divide-[var(--border)] overflow-y-auto" style={{ maxHeight: "450px" }}>
          {logs.map((log, index) => (
            <div key={`${log.action}-${index}`} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--bg-elevated)]/50">
              <div className="w-20 shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {log.time}
              </div>
              <div 
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]" 
                style={{ borderColor: `var(--${log.tone})` }}
              >
                <Clock size={12} strokeWidth={2.5} style={{ color: `var(--${log.tone})` }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {log.action}
                </div>
                <div className="mt-0.5 truncate font-sans text-sm font-bold">{log.target}</div>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--${log.tone})` }}>
                {log.status}
              </div>
              <ArrowUpRight size={14} strokeWidth={2} className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </PlatformPanel>
    </div>
  );
}
