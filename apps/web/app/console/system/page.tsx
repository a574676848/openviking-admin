"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Database, HardDrive, Radar, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleStatsGrid,
} from "@/components/console/primitives";

interface QueueData {
  Embedding?: number;
  Semantic?: number;
  "Semantic-Nodes"?: number;
}

interface HealthData {
  ok: boolean;
  openviking?: {
    host?: string;
  };
  dbPool?: unknown;
}

type DbStats = Record<string, string | number | null>;

interface StatsData {
  queue: QueueData | null;
  dbStats: DbStats | null;
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthData, statsData] = await Promise.all([
        apiClient.get<HealthData>("/system/health"),
        apiClient.get<StatsData>("/system/stats"),
      ]);
      setHealth(healthData);
      setStats(statsData);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const queue = stats?.queue ?? null;
  const dbStats = stats?.dbStats ?? null;
  const totalQueue = (queue?.Embedding ?? 0) + (queue?.Semantic ?? 0) + (queue?.["Semantic-Nodes"] ?? 0);

  const queueRows = useMemo(
    () => [
      { label: "Embedding", desc: "文本切片转向量", value: queue?.Embedding ?? 0 },
      { label: "Semantic", desc: "语义索引构建", value: queue?.Semantic ?? 0 },
      { label: "Semantic-Nodes", desc: "图谱节点关联", value: queue?.["Semantic-Nodes"] ?? 0 },
    ],
    [queue],
  );

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="系统运行状态"
        subtitle="Runtime Health / Queue And Storage Telemetry"
        actions={
          <ConsoleButton type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} strokeWidth={2.6} className={loading ? "animate-spin" : ""} />
            刷新遥测
          </ConsoleButton>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="Core Health" value={health?.ok ? "ONLINE" : "DEGRADED"} tone={health?.ok ? "success" : "danger"} />
        <ConsoleMetricCard label="Queue Total" value={totalQueue.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="Stored Nodes" value={String(dbStats?.total_nodes ?? 0)} tone="brand" />
        <ConsoleMetricCard label="Last Refresh" value={lastRefresh ? lastRefresh.toLocaleTimeString("zh-CN") : "--:--:--"} />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="flex flex-col gap-8">
          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Runtime Summary" title="核心引擎与队列概览" />
            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className={`border-[3px] border-[var(--border)] p-5 ${health?.ok ? "bg-[var(--success)] text-white" : "bg-[var(--danger)] text-white"}`}>
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.16em]">
                  <Radar size={14} strokeWidth={2.6} />
                  OpenViking
                </div>
                <p className="mt-3 font-sans text-3xl font-black">{health?.ok ? "在线" : "离线"}</p>
                <p className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.12em]">
                  {health?.openviking?.host ?? "unassigned-cluster-node"}
                </p>
              </div>
              <ConsoleStatsGrid className="md:grid-cols-2">
                <ConsoleMetricCard label="Embedding" value={String(queue?.Embedding ?? 0)} />
                <ConsoleMetricCard label="Semantic" value={String(queue?.Semantic ?? 0)} />
              </ConsoleStatsGrid>
            </div>
          </ConsolePanel>

          <ConsolePanel className="overflow-hidden">
            <div className="border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Queue Breakdown
            </div>
            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {queueRows.map((row) => (
                <div key={row.label} className="grid gap-px bg-[var(--border)] lg:grid-cols-[220px_minmax(0,1fr)_140px]">
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-primary)]">
                    {row.label}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-xs font-bold text-[var(--text-secondary)]">
                    {row.desc}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-3xl font-black tabular-nums text-[var(--warning)]">
                    {row.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </ConsolePanel>
        </div>

        <div className="flex flex-col gap-8">
          <ConsolePanel className="overflow-hidden">
            <div className="border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Storage Telemetry
            </div>
            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {dbStats && Object.keys(dbStats).length > 0 ? (
                Object.entries(dbStats).map(([key, value]) => (
                  <div key={key} className="grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                      {key}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5 text-right font-mono text-sm font-black tabular-nums text-[var(--text-primary)]">
                      {typeof value === "number" ? value.toLocaleString() : String(value)}
                    </div>
                  </div>
                ))
              ) : (
                <ConsoleEmptyState icon={Database} title="暂无存储遥测" description="no storage telemetry" />
              )}
            </div>
          </ConsolePanel>

          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Operations Notes" />
            <div className="mt-6 space-y-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
              <p className="flex items-center gap-3">
                <Activity size={14} strokeWidth={2.6} />
                引擎健康优先看 `ONLINE / DEGRADED`。
              </p>
              <p className="flex items-center gap-3">
                <Clock3 size={14} strokeWidth={2.6} />
                队列积压持续升高时优先排查导入流。
              </p>
              <p className="flex items-center gap-3">
                <Database size={14} strokeWidth={2.6} />
                节点数与向量数应与知识库增长同步。
              </p>
              <p className="flex items-center gap-3">
                <HardDrive size={14} strokeWidth={2.6} />
                异常值先确认租户配置，再看 OV 后端。
              </p>
            </div>
          </ConsolePanel>
        </div>
      </section>
    </div>
  );
}
