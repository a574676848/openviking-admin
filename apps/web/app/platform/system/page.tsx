"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Server, Activity, Clock, Database, ShieldCheck } from "lucide-react";

interface QueueData {
  Embedding?: number;
  Semantic?: number;
  "Semantic-Nodes"?: number;
}

interface StatsData {
  queue: QueueData | null;
  dbStats: Record<string, string | number | null> | null;
}

interface HealthData {
  ok: boolean;
  openviking?: {
    host?: string;
    version?: string;
    commit?: string;
    dimension?: number;
    embeddingModel?: string;
  };
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
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);



  async function load() {
    setLoading(true);
    try {
      const [hData, sData] = await Promise.all([
        apiClient.get<HealthData>('/system/health'),
        apiClient.get<StatsData>('/system/stats'),
      ]);
      setHealth(hData);
      setStats(sData);
      setLastRefresh(new Date());
    } catch (e) {
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
  const dbStats = stats?.dbStats ?? null;
  const ovInfo = health?.openviking;

  const totalQueue = (queue?.Embedding ?? 0) + (queue?.Semantic ?? 0) + (queue?.['Semantic-Nodes'] ?? 0);

  return (
    <div className="w-full flex flex-col pb-10 min-h-full theme-swiss">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-8">
        <div>
           <h1 className="text-5xl md:text-7xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Server size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             底层状态监控_
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-[10px] flex items-center">
             {"// ENGINE STATUS & KNOWLEDGE GRAPH TELEMETRY"}
             {lastRefresh && <span className="ml-4 pl-4 border-l border-[var(--text-muted)] opacity-70">上次刷新: {lastRefresh.toLocaleTimeString('en-GB', { hour12: false })}</span>}
           </p>
        </div>
        <div className="flex gap-4 items-center">
           <button
             onClick={load} disabled={loading}
             className="ov-button px-6 py-3 text-xs flex items-center gap-2 bg-[var(--bg-elevated)] border-[var(--border-width)] border-[var(--border)] text-[var(--text-primary)] disabled:opacity-50"
             style={{ borderRadius: 0 }}
           >
             <Activity size={16} strokeWidth={2} className={loading ? "animate-spin" : ""} />
             <span className="font-mono font-black tracking-widest uppercase">强制刷新节点状态</span>
           </button>
        </div>
      </div>

      {/* ─── KPI Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] mb-8">
         <div className={`bg-[var(--bg-card)] p-6 md:p-8 flex flex-col justify-between group hover:bg-[var(--bg-elevated)] transition-colors min-h-[200px] relative overflow-hidden`}>
            <div className="text-[10px] font-black tracking-widest font-mono uppercase text-[var(--text-secondary)] mb-4 flex items-center relative z-10">
               <span className={`w-2 h-2 inline-block mr-2 ${loading ? 'bg-[var(--warning)] animate-pulse' : health?.ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
               OPENVIKING_CORE_ENGINE
            </div>
            <div className="relative z-10 flex flex-col gap-1">
              <h2 className={`text-4xl md:text-5xl font-black font-mono tracking-tighter uppercase ${loading ? 'text-[var(--warning)]' : health?.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {loading ? <ScrambleText value="PINGING" /> : health?.ok ? "ONLINE" : "OFFLINE"}
              </h2>
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] font-bold">192.168.10.99:1933</span>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <ShieldCheck size={120} strokeWidth={1} className={health?.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'} />
            </div>
         </div>

         <div className="bg-[var(--bg-card)] p-6 md:p-8 flex flex-col justify-between group hover:bg-[var(--bg-elevated)] transition-colors min-h-[200px] relative overflow-hidden">
            <div className="text-[10px] font-black tracking-widest font-mono uppercase text-[var(--text-secondary)] mb-4 flex items-center relative z-10">
               <span className="w-2 h-2 inline-block mr-2 bg-[var(--warning)]" />
               ASYNC_TASK_QUEUE
            </div>
            <div className="relative z-10 flex flex-col gap-1">
              <h2 className={`text-5xl md:text-6xl font-black font-mono tracking-tighter tabular-nums ${totalQueue > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                <ScrambleText value={loading ? '---' : totalQueue} />
              </h2>
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] font-bold uppercase">Embedding / Semantic</span>
            </div>
            {totalQueue > 0 && <div className="absolute top-0 left-0 w-1 h-full bg-[var(--warning)] animate-pulse" />}
         </div>

         <div className="bg-[var(--bg-card)] p-6 md:p-8 flex flex-col justify-between group hover:bg-[var(--bg-elevated)] transition-colors min-h-[200px] relative overflow-hidden">
            <div className="text-[10px] font-black tracking-widest font-mono uppercase text-[var(--text-secondary)] mb-4 flex items-center relative z-10">
               <span className="w-2 h-2 inline-block mr-2 bg-[var(--info)]" />
               CORE_VERSION
            </div>
            <div className="relative z-10 flex flex-col gap-1">
              <h2 className="text-4xl md:text-5xl font-black font-mono tracking-tighter uppercase text-[var(--info)] truncate" title={ovInfo?.version ?? 'UNKNOWN'}>
                {loading ? '...' : (ovInfo?.version ?? 'UNKNOWN')}
              </h2>
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] font-bold uppercase truncate">
                {ovInfo?.commit ? `COMMIT: ${String(ovInfo.commit).slice(0, 7)}` : 'NULL_COMMIT_REF'}
              </span>
            </div>
         </div>

         <div className="bg-[var(--bg-card)] p-6 md:p-8 flex flex-col justify-between group hover:bg-[var(--bg-elevated)] transition-colors min-h-[200px] relative overflow-hidden">
            <div className="text-[10px] font-black tracking-widest font-mono uppercase text-[var(--text-secondary)] mb-4 flex items-center relative z-10">
               <span className="w-2 h-2 inline-block mr-2 bg-[var(--brand)]" />
               VECTOR_DIMENSION
            </div>
            <div className="relative z-10 flex flex-col gap-1">
              <h2 className="text-4xl md:text-5xl font-black font-mono tracking-tighter tabular-nums text-[var(--brand)]">
                <ScrambleText value={loading ? '---' : (dbStats?.dimension ?? ovInfo?.dimension ?? '---')} />
              </h2>
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] font-bold uppercase truncate" title={String(dbStats?.model ?? ovInfo?.embeddingModel ?? 'EMBEDDING_MODEL')}>
                {dbStats?.model ?? ovInfo?.embeddingModel ?? 'EMBEDDING_MODEL'}
              </span>
            </div>
         </div>
      </div>

      {/* ─── Details Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)]">
         
         <div className="bg-[var(--bg-card)] p-6 md:p-8 flex flex-col relative overflow-hidden">
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)", backgroundSize: "24px 24px" }} />
           <h3 className="font-sans font-black text-xl uppercase tracking-tighter mb-6 flex items-center relative z-10 text-[var(--text-primary)]">
              <Clock size={20} strokeWidth={2} className="mr-2 text-[var(--warning)]" />
              实时队列负荷 (QUEUE_LOAD)
           </h3>
           <div className="space-y-4 relative z-10">
              {[
                { label: 'EMBEDDING_QUEUE', key: 'Embedding', desc: 'Text to Vector Serialization' },
                { label: 'SEMANTIC_QUEUE', key: 'Semantic', desc: 'Semantic Graph Indexing' },
                { label: 'NODE_RELATION_QUEUE', key: 'Semantic-Nodes', desc: 'Topological Relationship Linkage' },
              ].map(q => {
                const cnt = (queue as Record<string, number>)?.[q.key] ?? 0;
                return (
                  <div key={q.key} className="flex justify-between items-center bg-[var(--bg-elevated)] border-[var(--border-width)] border-[var(--border)] p-4 group hover:border-[var(--brand)] transition-colors">
                     <div>
                       <div className="font-mono text-xs font-black uppercase tracking-widest text-[var(--text-primary)] mb-1">{q.label}</div>
                       <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{"// "}{q.desc}</div>
                     </div>
                     <div className={`font-mono text-2xl font-black tracking-tighter tabular-nums ${cnt > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                       {loading ? '--' : cnt.toLocaleString()}
                     </div>
                  </div>
                );
              })}
           </div>
         </div>

         <div className="bg-[var(--bg-card)] p-6 md:p-8 flex flex-col relative overflow-hidden">
           <h3 className="font-sans font-black text-xl uppercase tracking-tighter mb-6 flex items-center relative z-10 text-[var(--text-primary)]">
              <Database size={20} strokeWidth={2} className="mr-2 text-[var(--info)]" />
              底层图存储统计 (DB_TELEMETRY)
           </h3>
           {dbStats ? (
             <div className="space-y-2 relative z-10 flex-1 overflow-y-auto max-h-[300px] pr-2 hidden-scrollbar">
                {Object.entries(dbStats).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-2 border-b-[var(--border-width)] border-[var(--border)] border-dashed last:border-0 hover:bg-[var(--brand-muted)] transition-colors px-2 -mx-2">
                     <span className="font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{k}</span>
                     <span className="font-mono text-[11px] font-bold text-[var(--brand)] truncate max-w-[50%] text-right" title={String(v)}>
                       {typeof v === 'number' ? v.toLocaleString() : String(v)}
                     </span>
                  </div>
                ))}
             </div>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center py-12 text-center relative z-10">
               <Database size={48} className="text-[var(--text-muted)] mb-4" strokeWidth={1} />
               <p className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-muted)]">
                 {loading ? 'FETCHING_TELEMETRY_DATA...' : 'NULL_TELEMETRY_DETECTED'}
               </p>
             </div>
           )}
         </div>

      </div>
    </div>
  );
}
