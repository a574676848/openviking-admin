"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleMetricCard,
  ConsolePanel,
  ConsolePanelHeader,
  ConsolePageHeader,
  ConsoleStatsGrid,
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

  useEffect(() => {
    let active = true;

    const load = async () => {
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
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="租户工作台" subtitle="Tenant Node / Runtime Summary Board" />
      <ConsoleStatsGrid className="lg:grid-cols-[1.4fr_1fr_1fr]">
        <ConsoleMetricCard label="Knowledge Bases" value={loading ? "--" : String(data?.kbCount ?? 0).padStart(2, "0")} tone="brand" />
        <ConsoleMetricCard label="Hit Rate" value={loading ? "--.-" : `${hitRate}%`} tone="warning" />
        <ConsoleMetricCard label="Running Tasks" value={loading ? "--" : String(data?.runningTasks ?? 0).padStart(2, "0")} tone="success" />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.25fr_0.75fr]">
        <ConsolePanel className="overflow-hidden">
          <ConsolePanelHeader eyebrow="实时任务流 / Live Tasks" className="bg-[var(--bg-elevated)] px-5 py-4" />
          <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
            {logs.map((log, index) => (
              <div key={`${log.label}-${index}`} className="grid grid-cols-[110px_minmax(0,1fr)_110px_100px] gap-px bg-[var(--border)]">
                <div className="bg-[var(--bg-card)] px-4 py-4 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {log.time}
                </div>
                <div className="min-w-0 bg-[var(--bg-card)] px-4 py-4">
                  <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    {log.label}
                  </div>
                  <div className="mt-1 truncate font-sans text-base font-black">{log.target}</div>
                </div>
                <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-mono text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: log.tone }}>
                  {log.status}
                </div>
                <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--brand)]">
                  RUN
                </div>
              </div>
            ))}
          </div>
        </ConsolePanel>

        <ConsoleStatsGrid>
          <ConsoleMetricCard label="Search Volume" value={loading ? "--" : (data?.searchCount ?? 0).toLocaleString()} tone="brand" />
          <ConsoleMetricCard label="Failed Tasks" value={loading ? "--" : (data?.failedTasks ?? 0).toLocaleString()} tone="danger" />
          <div className="bg-[var(--bg-card)] px-6 py-6">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Core Health</p>
              <Wrench size={16} strokeWidth={2.4} className={data?.health?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"} />
            </div>
            <div className={`mt-6 font-mono text-3xl font-black uppercase tracking-[0.14em] ${data?.health?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              {loading ? "PING" : data?.health?.ok ? "ONLINE" : "DEGRADED"}
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {data?.health?.message ?? "核心引擎状态正常"}
            </p>
          </div>
        </ConsoleStatsGrid>
      </section>
    </div>
  );
}
