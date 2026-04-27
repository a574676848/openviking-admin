"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Server, Activity, Clock, Database, ShieldCheck, Layers } from "lucide-react";
import {
  PlatformButton,
  PlatformEmptyState,
  PlatformKeyValueRow,
  PlatformPanel,
  PlatformPageHeader,
  PlatformSectionTitle,
  PlatformSignalCard,
  PlatformStatusPanel,
} from "@/components/ui/platform-primitives";

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

interface StatsData {
  queue: QueueData | null;
  vikingdb: VikingDBData | null;
  models: { status: string } | null;
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
  dbPool?: { activeTenants?: number; tenantList?: string[] };
}

const ScrambleText = ({ value, className = "" }: { value: string | number, className?: string }) => {
  const [display, setDisplay] = useState<string>("---");
  useEffect(() => {
    if (value === undefined || value === null) return;
    const target = String(value);
    const chars = "0101010101ABCDEF!@#$";
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplay(target.split('').map((char, index) => {
        if (index < iteration) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));
      if (iteration >= target.length) clearInterval(interval);
      iteration += 1 / 3;
    }, 30);
    return () => clearInterval(interval);
  }, [value]);
  return <span className={className}>{display}</span>;
};

export default function SystemPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [hData, sData] = await Promise.all([
        apiClient.get<HealthData>('/system/health'),
        apiClient.get<StatsData>('/system/stats'),
      ]);
      setHealth(hData);
      setStats(sData);
      setLastRefresh(new Date());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "系统状态加载失败");
      if (process.env.NODE_ENV === "development") console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const queue = stats?.queue ?? null;
  const vikingdb = stats?.vikingdb ?? null;
  const ovInfo = health?.openviking;

  const totalQueue = (queue?.Embedding ?? 0) + (queue?.Semantic ?? 0) + (queue?.['Semantic-Nodes'] ?? 0);

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-6xl">
            <Server size={34} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
            底层状态监控_
          </h1>
        }
        subtitle={
          <>
            {"// 引擎状态与知识图谱遥测"}
            {lastRefresh ? (
              <span className="ml-4 border-l border-[var(--text-muted)] pl-4 opacity-70">
                上次刷新: {lastRefresh.toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            ) : null}
          </>
        }
        subtitleClassName="flex items-center text-[10px]"
        actions={
          <PlatformButton
            type="button"
            onClick={load}
            disabled={loading}
            className="ov-button px-6 py-3 text-xs"
          >
            <Activity size={16} strokeWidth={2} className={loading ? "animate-spin" : ""} />
            <span className="font-mono font-bold tracking-widest uppercase">强制刷新节点状态</span>
          </PlatformButton>
        }
      />

      {loadError && (
        <PlatformStatusPanel
          title="系统状态加载失败"
          description={loadError}
          action={
            <PlatformButton type="button" tone="danger" onClick={load} className="px-4 py-2 text-[10px]">
              重试加载
            </PlatformButton>
          }
          className="mb-8 border-[var(--danger)]"
        />
      )}

      {/* ─── KPI Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] mb-8">
         <PlatformSignalCard
           label="OpenViking 核心引擎"
           marker={<span className={`mr-2 inline-block h-2 w-2 ${loading ? 'bg-[var(--warning)] animate-theme-pulse' : health?.ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />}
           value={loading ? <ScrambleText value="探测中" /> : health?.ok ? "在线" : "离线"}
           hint={health?.resolvedBaseUrl ?? "未配置引擎地址"}
           accent={loading ? "var(--warning)" : health?.ok ? "var(--success)" : "var(--danger)"}
           overlay={<ShieldCheck size={120} strokeWidth={1} className={health?.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'} />}
         />

         <PlatformSignalCard
           label="异步任务队列"
           marker={<span className="mr-2 inline-block h-2 w-2 bg-[var(--warning)]" />}
           value={<ScrambleText value={loading ? '---' : totalQueue} />}
           hint="Embedding / Semantic 队列"
           accent={totalQueue > 0 ? "var(--warning)" : "var(--success)"}
           valueClassName="text-4xl md:text-5xl tabular-nums"
           className={totalQueue > 0 ? "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:animate-theme-pulse before:bg-[var(--warning)]" : undefined}
         />

         <PlatformSignalCard
           label="引擎版本"
           marker={<span className="mr-2 inline-block h-2 w-2 bg-[var(--info)]" />}
           value={loading ? '...' : (ovInfo?.version ?? '未知')}
           hint={ovInfo?.auth_mode ? `认证: ${ovInfo.auth_mode}` : ''}
           accent="var(--info)"
           valueClassName="truncate"
         />

         <PlatformSignalCard
           label="向量总数"
           marker={<span className="mr-2 inline-block h-2 w-2 bg-[var(--brand)]" />}
           value={<ScrambleText value={loading ? '---' : (vikingdb?.totalVectorCount ?? '---')} />}
           hint={vikingdb ? `${vikingdb.totalCollections} 集合 / ${vikingdb.totalIndexCount} 索引` : '暂无图存储数据'}
           accent="var(--brand)"
         />
      </div>

      {/* ─── Details Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)]">

         <PlatformPanel className="relative flex flex-col overflow-hidden p-6 md:p-8">
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)", backgroundSize: "24px 24px" }} />
           <PlatformSectionTitle
             title="实时队列负荷"
             icon={<Clock size={20} strokeWidth={2} className="text-[var(--warning)]" />}
             className="relative z-10"
           />
           <div className="space-y-4 relative z-10">
              {[
                { label: 'Embedding 队列', key: 'Embedding', desc: '文本向量化排队' },
                { label: 'Semantic 队列', key: 'Semantic', desc: '语义图索引排队' },
                { label: '节点关系队列', key: 'Semantic-Nodes', desc: '图节点关系链接排队' },
              ].map(q => {
                const cnt = (queue as Record<string, number>)?.[q.key] ?? 0;
                return (
                  <PlatformPanel
                    key={q.key}
                    className="group flex items-center justify-between bg-[var(--bg-elevated)] p-4 transition-colors hover:border-[var(--brand)]"
                  >
                    <div>
                      <div className="mb-1 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">{q.label}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{"// "}{q.desc}</div>
                    </div>
                    <div className={`font-mono text-2xl font-bold tracking-tighter tabular-nums ${cnt > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                      {loading ? '--' : cnt.toLocaleString()}
                    </div>
                  </PlatformPanel>
                );
              })}
           </div>
         </PlatformPanel>

         <PlatformPanel className="relative flex flex-col overflow-hidden p-6 md:p-8">
           <PlatformSectionTitle
             title="底层图存储统计"
             icon={<Database size={20} strokeWidth={2} className="text-[var(--info)]" />}
             className="relative z-10"
           />
           {vikingdb ? (
             <div className="space-y-4 relative z-10 flex-1 overflow-y-auto max-h-[300px] pr-2 hidden-scrollbar">
               {/* 集合列表 */}
               {vikingdb.collections.map((col) => (
                 <PlatformPanel key={col.Collection} className="bg-[var(--bg-elevated)] p-4">
                   <div className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">
                     <Layers size={14} strokeWidth={2} className="inline mr-2" />
                     {col.Collection}
                   </div>
                   <div className="grid grid-cols-3 gap-2">
                     <PlatformKeyValueRow label="索引数" value={col['Index Count']} />
                     <PlatformKeyValueRow label="向量数" value={parseInt(col['Vector Count']).toLocaleString()} />
                     <PlatformKeyValueRow label="状态" value={col.Status} />
                   </div>
                 </PlatformPanel>
               ))}
               {/* 汇总 */}
               <div className="flex items-center justify-between bg-[var(--bg-elevated)] p-3 border-t border-[var(--border)]">
                 <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                   合计: {vikingdb.totalCollections} 集合 / {vikingdb.totalIndexCount} 索引
                 </span>
                 <span className="font-mono text-sm font-bold tabular-nums text-[var(--brand)]">
                   {vikingdb.totalVectorCount.toLocaleString()} 向量
                 </span>
               </div>
             </div>
           ) : (
             <PlatformEmptyState
               title={loading ? "正在采集图存储指标" : "暂无图存储遥测"}
               description={loading ? "正在采集底层图存储统计。" : "当前未返回可展示的图存储指标。"}
               className="relative z-10 flex-1 border-0 shadow-none"
             />
           )}
         </PlatformPanel>

      </div>
    </div>
  );
}
