"use client";

import { useEffect, useState } from "react";
import {
  Wrench,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Activity,
  Radar,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { PlatformButton } from "@/components/ui/platform-primitives";
import {
  ConsoleButton,
  ConsolePanel,
  ConsolePanelHeader,
  ConsolePageHeader,
  ConsoleStatusPanel,
  ConsoleBadge,
  ConsoleEmptyState,
} from "@/components/console/primitives";

interface DashboardData {
  kbCount: number;
  taskCount: number;
  searchCount: number;
  zeroCount: number;
  failedTasks: number;
  runningTasks: number;
  recentTasks: Record<string, unknown>[];
  health: { ok: boolean; message?: string };
}

interface SearchStatsDeepData {
  topQueries?: SearchQueryRankItem[];
  daily?: SearchDailyPoint[];
}

interface SearchQueryRankItem {
  query: string;
  count: number;
  hits: number;
  hitRate: number;
}

interface SearchDailyPoint {
  day: string;
  total: number;
  hits: number;
  hitRate: number;
  avgLatency: number;
}

type LogItem = {
  label: string;
  target: string;
  status: string;
  time: string;
  tone: string;
};

type TrendPoint = SearchDailyPoint & {
  x: number;
  y: number;
};

const HERO_CARD_CLASS =
  "flex min-h-[200px] flex-col justify-between rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-8 py-8";
const SECONDARY_CARD_CLASS =
  "flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5 transition-colors";
const TOP_QUERY_LIMIT = 5;
const TREND_WINDOW_DAYS = 7;
const TREND_SVG_HEIGHT = 188;
const TREND_SVG_WIDTH = 560;
const TREND_PADDING_X = 22;
const TREND_PADDING_Y = 22;

function normalizeTopQueries(items: unknown): SearchQueryRankItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const record = item as Partial<SearchQueryRankItem>;
      return {
        query: typeof record.query === "string" ? record.query : "",
        count: typeof record.count === "number" ? record.count : 0,
        hits: typeof record.hits === "number" ? record.hits : 0,
        hitRate: typeof record.hitRate === "number" ? record.hitRate : 0,
      };
    })
    .filter((item) => item.query.trim().length > 0)
    .slice(0, TOP_QUERY_LIMIT);
}

function normalizeDaily(items: unknown): SearchDailyPoint[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const record = item as Partial<SearchDailyPoint>;
      return {
        day: typeof record.day === "string" ? record.day : "",
        total: typeof record.total === "number" ? record.total : 0,
        hits: typeof record.hits === "number" ? record.hits : 0,
        hitRate: typeof record.hitRate === "number" ? record.hitRate : 0,
        avgLatency: typeof record.avgLatency === "number" ? record.avgLatency : 0,
      };
    })
    .filter((item) => item.day.trim().length > 0);
}

function buildTrendPoints(daily: SearchDailyPoint[]): TrendPoint[] {
  const points = daily.slice(-TREND_WINDOW_DAYS);
  if (points.length === 0) return [];
  const maxTotal = Math.max(...points.map((item) => item.total), 1);
  const usableWidth = TREND_SVG_WIDTH - TREND_PADDING_X * 2;
  const usableHeight = TREND_SVG_HEIGHT - TREND_PADDING_Y * 2;
  const stepX = points.length > 1 ? usableWidth / (points.length - 1) : 0;

  return points.map((item, index) => ({
    ...item,
    x: TREND_PADDING_X + stepX * index,
    y:
      TREND_SVG_HEIGHT -
      TREND_PADDING_Y -
      (item.total / maxTotal) * usableHeight,
  }));
}

function buildLinePath(points: TrendPoint[]) {
  if (points.length === 0) return "";
  return points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
}

function buildAreaPath(points: TrendPoint[]) {
  if (points.length === 0) return "";
  const linePath = buildLinePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const baseline = TREND_SVG_HEIGHT - TREND_PADDING_Y;
  return `${linePath} L ${lastPoint.x.toFixed(1)} ${baseline.toFixed(1)} L ${firstPoint.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
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
    panelClassName: "border-[var(--border)] bg-[var(--bg-card)]",
    badgeClassName:
      "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
    textClassName: "text-[var(--text-muted)]",
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [topQueries, setTopQueries] = useState<SearchQueryRankItem[]>([]);
  const [dailyTrend, setDailyTrend] = useState<SearchDailyPoint[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [dash, deepStats] = await Promise.all([
        apiClient.get<DashboardData>("/system/dashboard"),
        apiClient.get<SearchStatsDeepData>("/search/stats-deep").catch(() => null),
      ]);
      setData(dash);
      setTopQueries(normalizeTopQueries(deepStats?.topQueries));
      setDailyTrend(normalizeDaily(deepStats?.daily));

      const recentLogs = (dash.recentTasks ?? []).slice(0, 8).map((task) => {
        const status = String(task.status ?? "unknown");
        return {
          label: "导入任务",
          target: String(task.targetUri ?? task.sourceType ?? "URL/文档"),
          status,
          time: new Date(
            String(task.createdAt ?? Date.now()),
          ).toLocaleTimeString(),
          tone:
            status === "failed"
              ? "var(--danger)"
              : status === "running"
                ? "var(--warning)"
                : "var(--success)",
        };
      });

      setLogs([
        {
          label: "系统守望者",
          target: "core_engine_v1",
          status: dash.health?.ok ? "online" : "degraded",
          time: new Date().toLocaleTimeString(),
          tone: dash.health?.ok ? "var(--brand)" : "var(--danger)",
        },
        ...recentLogs,
      ]);
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error ? error.message : "租户工作台加载失败",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hitRate =
    data && data.searchCount > 0
      ? (100 - (data.zeroCount / data.searchCount) * 100).toFixed(1)
      : "0.0";
  const zeroRate =
    data && data.searchCount > 0
      ? ((data.zeroCount / data.searchCount) * 100).toFixed(1)
      : "0.0";
  const trendPoints = buildTrendPoints(dailyTrend);
  const trendLinePath = buildLinePath(trendPoints);
  const trendAreaPath = buildAreaPath(trendPoints);

  return (
    <div className="flex min-h-full flex-col gap-8 pb-10">
      <ConsolePageHeader
        title="租户工作台"
        subtitle="集中查看知识库、任务、热点检索与租户内检索趋势"
        actions={
          <PlatformButton type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} strokeWidth={2.4} className={loading ? "animate-spin" : undefined} />
            刷新
          </PlatformButton>
        }
      />
      {loadError ? (
        <ConsoleStatusPanel
          icon={Wrench}
          title="租户工作台加载失败"
          description={loadError}
          action={
            <ConsoleButton type="button" onClick={() => window.location.reload()}>
              重新加载
            </ConsoleButton>
          }
        />
      ) : null}

      <div className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] rounded-[var(--radius-base)] md:grid-cols-4">
        <div className={HERO_CARD_CLASS}>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            知识库数量
          </p>
          <p className="mt-2 font-sans text-5xl font-bold tabular-nums text-[var(--text-primary)] md:text-6xl lg:text-7xl">
            {loading ? "---" : String(data?.kbCount ?? 0)}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">
            // 当前租户下已创建的知识库总数
          </p>
        </div>
        <div className={HERO_CARD_CLASS}>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            检索命中率
          </p>
          <p className="mt-2 font-sans text-5xl font-bold tabular-nums text-[var(--warning)] md:text-6xl">
            {loading ? "--.-" : `${hitRate}%`}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">
            // 检索请求中有答案的比例
          </p>
        </div>
        <div className={HERO_CARD_CLASS}>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            运行中任务
          </p>
          <p className="mt-2 font-sans text-5xl font-bold tabular-nums text-[var(--success)] md:text-6xl">
            {loading ? "--" : String(data?.runningTasks ?? 0)}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">
            // 当前正在处理的任务数
          </p>
        </div>
        <div className={HERO_CARD_CLASS}>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
            核心健康度
          </p>
          <p
            className={`mt-2 font-sans text-4xl font-bold ${
              data?.health?.ok
                ? "text-[var(--success)]"
                : "text-[var(--danger)]"
            } md:text-5xl`}
          >
            {loading ? "检测中" : data?.health?.ok ? "在线" : "降级"}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">
            {loading
              ? "// 正在检查核心引擎状态"
              : `// ${data?.health?.message ?? "核心引擎状态正常"}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`${SECONDARY_CARD_CLASS} hover:border-[var(--brand)]`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <Search
              size={18}
              strokeWidth={1.8}
              className="text-[var(--brand)]"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              检索请求量
            </p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {loading ? "--" : (data?.searchCount ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className={`${SECONDARY_CARD_CLASS} hover:border-[var(--danger)]`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <AlertTriangle
              size={18}
              strokeWidth={1.8}
              className="text-[var(--danger)]"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              失败任务
            </p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--danger)]">
              {loading ? "--" : (data?.failedTasks ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className={`${SECONDARY_CARD_CLASS} hover:border-[var(--warning)]`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <CheckCircle2
              size={18}
              strokeWidth={1.8}
              className="text-[var(--warning)]"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              零命中率
            </p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--warning)]">
              {loading ? "--.-" : `${zeroRate}%`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ConsolePanel className="h-full overflow-hidden p-5">
          <ConsolePanelHeader
            eyebrow="Daily Search Pulse"
            title="日检索曲线"
            actions={
              <ConsoleBadge tone="brand">
                <Activity size={12} strokeWidth={2.6} />
                近 {Math.min(dailyTrend.length || TREND_WINDOW_DAYS, TREND_WINDOW_DAYS)} 日
              </ConsoleBadge>
            }
          />
          <div className="mt-4">
            {trendPoints.length === 0 ? (
              <ConsoleEmptyState
                icon={Radar}
                title="暂无趋势样本"
                description="当前租户还没有足够的日检索数据。"
                className="px-0 py-14"
              />
            ) : (
              <div className="rounded-[var(--radius-base)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(230,74,25,0.09),rgba(230,74,25,0.01))] p-4">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Search Volume / 检索热度波形
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-[var(--text-secondary)]">
                      折线显示每日检索总量，辅助识别租户知识消费高峰。
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-base)] border border-[rgba(230,74,25,0.18)] bg-[rgba(255,255,255,0.72)] px-3.5 py-2.5 text-right">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      最近一天
                    </p>
                    <p className="mt-1 font-sans text-xl font-bold text-[var(--brand)]">
                      {trendPoints[trendPoints.length - 1]?.total ?? 0}
                    </p>
                  </div>
                </div>
                <svg
                  viewBox={`0 0 ${TREND_SVG_WIDTH} ${TREND_SVG_HEIGHT}`}
                  className="h-[190px] w-full"
                  role="img"
                  aria-label="日检索曲线图"
                >
                  <defs>
                    <linearGradient
                      id="consoleDashboardTrendFill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="rgba(230,74,25,0.38)" />
                      <stop offset="100%" stopColor="rgba(230,74,25,0.03)" />
                    </linearGradient>
                  </defs>
                  {trendPoints.map((point) => (
                    <line
                      key={`grid-${point.day}`}
                      x1={point.x}
                      x2={point.x}
                      y1={TREND_PADDING_Y}
                      y2={TREND_SVG_HEIGHT - TREND_PADDING_Y}
                      stroke="rgba(15,23,42,0.08)"
                      strokeDasharray="4 8"
                    />
                  ))}
                  <line
                    x1={TREND_PADDING_X}
                    x2={TREND_SVG_WIDTH - TREND_PADDING_X}
                    y1={TREND_SVG_HEIGHT - TREND_PADDING_Y}
                    y2={TREND_SVG_HEIGHT - TREND_PADDING_Y}
                    stroke="rgba(15,23,42,0.16)"
                  />
                  <path
                    d={trendAreaPath}
                    fill="url(#consoleDashboardTrendFill)"
                  />
                  <path
                    d={trendLinePath}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {trendPoints.map((point) => (
                    <g key={point.day}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        fill="white"
                        stroke="var(--brand)"
                        strokeWidth="3"
                      />
                      <text
                        x={point.x}
                        y={TREND_SVG_HEIGHT - 4}
                        textAnchor="middle"
                        className="fill-[var(--text-muted)] text-[10px] font-bold"
                      >
                        {point.day.split("-").slice(1).join("/")}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
          </div>
        </ConsolePanel>

        <ConsolePanel className="h-full overflow-hidden p-3.5">
          <ConsolePanelHeader
            eyebrow="Hot Queries"
            title="热门检索词 Top 5"
          />
          <div className="mt-3 flex flex-col gap-1.5">
            {topQueries.length === 0 ? (
              <ConsoleEmptyState
                icon={Search}
                title="暂无检索排行"
                description="当前租户还没有足够的检索样本。"
                className="px-0 py-10"
              />
            ) : (
              topQueries.map((item, index) => {
                const visual = getTopRankVisual(index);
                return (
                  <div
                    key={`${item.query}-${index}`}
                    className={`rounded-[var(--radius-base)] border px-3 py-2 transition-transform hover:-translate-y-0.5 ${visual.panelClassName}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-base)] border font-sans text-[11px] font-black ${visual.badgeClassName}`}
                      >
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-4">
                          <p className="truncate font-sans text-sm font-black text-[var(--text-primary)]">
                            {item.query}
                          </p>
                          <span
                            className={`shrink-0 font-sans text-[11px] font-black uppercase tracking-[0.14em] ${visual.textClassName}`}
                          >
                            {item.count} 次
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 font-sans text-[10px] font-bold text-[var(--text-muted)]">
                          <span>
                            命中率{" "}
                            <span className="text-[var(--text-primary)]">
                              {item.hitRate.toFixed(1)}%
                            </span>
                          </span>
                          <span>
                            命中{" "}
                            <span className="text-[var(--text-primary)]">
                              {item.hits.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ConsolePanel>
      </div>

      <ConsolePanel className="overflow-hidden">
        <ConsolePanelHeader
          eyebrow="实时任务流"
          className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4"
        />
        <div className="divide-y divide-[var(--border)]">
          {logs.map((log, index) => (
            <div
              key={`${log.label}-${index}`}
              className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--bg-elevated)]/50"
            >
              <div className="w-20 shrink-0 font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {log.time}
              </div>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]"
                style={{ borderColor: log.tone }}
              >
                <Clock size={12} strokeWidth={2.5} style={{ color: log.tone }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {log.label}
                </div>
                <div className="mt-0.5 truncate font-sans text-sm font-bold">
                  {log.target}
                </div>
              </div>
              <div
                className="shrink-0 text-right font-sans text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: log.tone }}
              >
                {log.status === "online"
                  ? "在线"
                  : log.status === "degraded"
                    ? "降级"
                    : log.status === "running"
                      ? "处理中"
                      : log.status === "failed"
                        ? "失败"
                        : log.status === "done"
                          ? "完成"
                          : log.status}
              </div>
              <ArrowUpRight
                size={14}
                strokeWidth={2}
                className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
          ))}
        </div>
      </ConsolePanel>
    </div>
  );
}
