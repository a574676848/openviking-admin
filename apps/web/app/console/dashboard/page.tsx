"use client";

import { useEffect, useState } from "react";
import { Wrench, Search, AlertTriangle, CheckCircle2, Clock, ArrowUpRight } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsolePanel,
  ConsolePanelHeader,
  ConsolePageHeader,
  ConsoleStatusPanel,
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

type LogItem = {
  label: string;
  target: string;
  status: string;
  time: string;
  tone: string;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadError("");
      try {
        const dash = await apiClient.get<DashboardData>("/system/dashboard");
        if (!active) return;
        setData(dash);

        const recentLogs = (dash.recentTasks ?? []).slice(0, 8).map((task) => {
          const status = String(task.status ?? "unknown");
          return {
            label: "导入任务",
            target: String(task.targetUri ?? task.sourceType ?? "URL/文档"),
            status,
            time: new Date(String(task.createdAt ?? Date.now())).toLocaleTimeString(),
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
        if (active) {
          setLoadError(error instanceof Error ? error.message : "租户工作台加载失败");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const hitRate =
    data && data.searchCount > 0 ? (100 - (data.zeroCount / data.searchCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex min-h-full flex-col gap-8 pb-10">
      <ConsolePageHeader title="租户工作台" subtitle="集中查看知识库、任务与核心运行状态" />
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

      {/* Bento Grid: Hero Metrics */}
      <div className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] rounded-[var(--radius-base)] overflow-hidden md:grid-cols-4">
        <div className="col-span-1 flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8 md:col-span-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">知识库数量</p>
          <p className="mt-2 font-sans text-6xl font-bold tabular-nums text-[var(--text-primary)] md:text-7xl lg:text-8xl">
            {loading ? "---" : String(data?.kbCount ?? 0).padStart(2, "0")}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">// 当前租户下已创建的知识库总数</p>
        </div>
        <div className="flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">检索命中率</p>
          <p className="mt-2 font-sans text-5xl font-bold tabular-nums text-[var(--warning)] md:text-6xl">
            {loading ? "--.-" : `${hitRate}%`}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">// 检索请求中有答案的比例</p>
        </div>
        <div className="flex min-h-[200px] flex-col justify-between bg-[var(--bg-card)] px-8 py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">运行中任务</p>
          <p className="mt-2 font-sans text-5xl font-bold tabular-nums text-[var(--success)] md:text-6xl">
            {loading ? "--" : String(data?.runningTasks ?? 0).padStart(2, "0")}
          </p>
          <p className="text-[10px] font-medium text-[var(--text-muted)]">// 当前正在处理的任务数</p>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <Search size={18} strokeWidth={1.8} className="text-[var(--brand)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">检索请求量</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {loading ? "--" : (data?.searchCount ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <AlertTriangle size={18} strokeWidth={1.8} className="text-[var(--danger)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">失败任务</p>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-[var(--danger)]">
              {loading ? "--" : (data?.failedTasks ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] px-5 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-elevated)]">
            <CheckCircle2 size={18} strokeWidth={1.8} className={data?.health?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">核心健康度</p>
            <p className={`mt-1 font-sans text-2xl font-bold tabular-nums ${data?.health?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              {loading ? "检测中" : data?.health?.ok ? "在线" : "降级"}
            </p>
            <p className="text-[10px] font-medium text-[var(--text-muted)]">
              {data?.health?.message ?? "核心引擎状态正常"}
            </p>
          </div>
        </div>
      </div>

      {/* Activity Logs Panel */}
      <ConsolePanel className="overflow-hidden">
        <ConsolePanelHeader
          eyebrow="实时任务流"
          className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4"
        />
        <div className="divide-y divide-[var(--border)]">
          {logs.map((log, index) => (
            <div key={`${log.label}-${index}`} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--bg-elevated)]/50">
              <div className="w-20 shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {log.time}
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]" style={{ borderColor: log.tone }}>
                <Clock size={12} strokeWidth={2.5} style={{ color: log.tone }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {log.label}
                </div>
                <div className="mt-0.5 truncate font-sans text-sm font-bold">{log.target}</div>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: log.tone }}>
                {log.status === "online" ? "在线" : log.status === "degraded" ? "降级" : log.status === "running" ? "处理中" : log.status === "failed" ? "失败" : log.status === "done" ? "完成" : log.status}
              </div>
              <ArrowUpRight size={14} strokeWidth={2} className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>
      </ConsolePanel>
    </div>
  );
}
