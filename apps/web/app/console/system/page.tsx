"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Database, HardDrive, Radar, RefreshCw, Layers } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleSurfaceCard,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleStatusPanel,
  ConsoleStatsGrid,
} from "@/components/console/primitives";

interface QueueData {
  Embedding?: number;
  Semantic?: number;
  "Semantic-Nodes"?: number;
}

interface VikingDBCollection {
  Collection: string;
  "Index Count": string;
  "Vector Count": string;
  Status: string;
}

interface VikingDBData {
  collections: VikingDBCollection[];
  totalCollections: number;
  totalIndexCount: number;
  totalVectorCount: number;
}

interface HealthData {
  ok: boolean;
  openviking?: {
    status?: string;
    healthy?: boolean;
    version?: string;
    auth_mode?: string;
  };
  resolvedBaseUrl?: string;
  dbPool?: unknown;
}

type DbStats = Record<string, string | number | null>;

interface StatsData {
  queue: QueueData | null;
  vikingdb: VikingDBData | null;
  models: { status: string } | null;
}

export default function SystemPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [healthData, statsData] = await Promise.all([
        apiClient.get<HealthData>("/system/health"),
        apiClient.get<StatsData>("/system/stats"),
      ]);
      setHealth(healthData);
      setStats(statsData);
      setLastRefresh(new Date());
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "系统遥测加载失败");
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
  const vikingdb = stats?.vikingdb ?? null;
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
        subtitle="查看核心健康度、队列积压与存储遥测"
        actions={
          <ConsoleButton type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} strokeWidth={2.6} className={loading ? "animate-spin" : ""} />
            刷新遥测
          </ConsoleButton>
        }
      />
      {loadError ? (
        <ConsoleStatusPanel
          icon={Activity}
          title="系统遥测加载失败"
          description={loadError}
          action={
            <ConsoleButton type="button" onClick={() => void load()}>
              重新加载
            </ConsoleButton>
          }
        />
      ) : null}

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="核心健康度" value={health?.ok ? "在线" : "降级"} tone={health?.ok ? "success" : "danger"} />
        <ConsoleMetricCard label="队列总量" value={totalQueue.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="向量总数" value={vikingdb?.totalVectorCount?.toLocaleString() ?? "0"} tone="brand" />
        <ConsoleMetricCard label="引擎版本" value={health?.openviking?.version ?? "未知"} tone="brand" />
      </ConsoleStatsGrid>

      <section className={`grid grid-cols-1 gap-8 xl:grid-cols-[1.02fr_0.98fr] ${loadError ? "opacity-60" : ""}`}>
        <div className="flex flex-col gap-8">
          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="运行概览" title="核心引擎与队列概览" />
            <div className="mt-6 grid grid-cols-1 gap-4">
              <ConsoleSurfaceCard tone={health?.ok ? "success" : "danger"} className="p-5">
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.16em]">
                  <Radar size={14} strokeWidth={2.6} />
                  OpenViking
                </div>
                <p className="mt-3 font-sans text-3xl font-black">{health?.ok ? "在线" : "离线"}</p>
                <p className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.12em]">
                  {health?.resolvedBaseUrl ?? "未分配下游节点"}
                </p>
              </ConsoleSurfaceCard>
              <ConsoleStatsGrid className="md:grid-cols-2">
                <ConsoleMetricCard label="Embedding" value={String(queue?.Embedding ?? 0)} />
                <ConsoleMetricCard label="Semantic" value={String(queue?.Semantic ?? 0)} />
              </ConsoleStatsGrid>
            </div>
          </ConsolePanel>

          <ConsolePanel className="overflow-hidden">
            <div className="border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              队列拆分
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
              存储遥测
            </div>
            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {vikingdb && vikingdb.collections.length > 0 ? (
                vikingdb.collections.map((col) => (
                  <div key={col.Collection} className="grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_160px_160px_100px]">
                    <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                      <Layers size={12} strokeWidth={2.6} className="inline mr-2" />
                      {col.Collection}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5 text-right font-mono text-sm font-black tabular-nums text-[var(--text-secondary)]">
                      索引 {col["Index Count"]}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5 text-right font-mono text-sm font-black tabular-nums text-[var(--brand)]">
                      {parseInt(col["Vector Count"]).toLocaleString()} 向量
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5 text-right font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--success)]">
                      {col.Status}
                    </div>
                  </div>
                ))
              ) : (
                <ConsoleEmptyState icon={Database} title="暂无存储遥测" description="当前没有可展示的存储遥测数据。" />
              )}
            </div>
            {/* 汇总行 */}
            {vikingdb && vikingdb.collections.length > 0 && (
              <div className="flex items-center justify-between border-t-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  合计: {vikingdb.totalCollections} 集合 / {vikingdb.totalIndexCount} 索引
                </span>
                <span className="font-mono text-sm font-black tabular-nums text-[var(--brand)]">
                  {vikingdb.totalVectorCount.toLocaleString()} 向量
                </span>
              </div>
            )}
          </ConsolePanel>

          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="运维提示" />
            <div className="mt-6 space-y-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
              <p className="flex items-center gap-3">
                <Activity size={14} strokeWidth={2.6} />
                引擎健康优先看"在线 / 降级"状态。
              </p>
              <p className="flex items-center gap-3">
                <Clock3 size={14} strokeWidth={2.6} />
                队列积压持续升高时优先排查导入流。
              </p>
              <p className="flex items-center gap-3">
                <Database size={14} strokeWidth={2.6} />
                向量数应与知识库增长同步。
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
