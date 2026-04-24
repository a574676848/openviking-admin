"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useRef } from "react";

interface DashboardData {
  kbCount: number;
  taskCount: number;
  searchCount: number;
  zeroCount: number;
  failedTasks: number;
  runningTasks: number;
  recentTasks: Record<string, unknown>[];
  health: { ok: boolean; message?: string };
  queue: { Embedding?: number; Semantic?: number; 'Semantic-Nodes'?: number } | null;
}

interface LogItem {
  action: string;
  target: string;
  time: string;
  status: string;
  c: string;
  bg: string;
}

const ScrambleNumber = ({ value, suffix = "" }: { value: string | number, suffix?: React.ReactNode }) => {
  const [display, setDisplay] = useState<string>(String(value));
  const prevValue = useRef(value);
  
  useEffect(() => {
    if (value === prevValue.current) return;
    prevValue.current = value;

    if (value === undefined || value === null || value === "---" || value === "--" || value === "--.-") {
      setTimeout(() => setDisplay(String(value)), 0);
      return;
    }
    const target = String(value);
    const chars = "0101010101ABCDEF!@#$";
    let iteration = 0;
    
    const interval = setInterval(() => {
      setDisplay(target.split('').map((char, index) => {
        if (index < iteration) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));
      
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
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const [dashData] = await Promise.all([
          apiClient.get<DashboardData>('/system/dashboard'),
          apiClient.get('/search/analysis').catch(() => null)
        ]);
        
        if (!active) return;

        setData(dashData);

        // 构造混合日志流
        const recentStream: LogItem[] = [];
        if (dashData?.recentTasks) {
          dashData.recentTasks.slice(0, 10).forEach((t: Record<string, unknown>) => {
             recentStream.push({
                action: "导入任务", 
                target: (t.targetUri || t.sourceType || "URL/文档") as string, 
                time: new Date(t.createdAt as string).toLocaleTimeString(), 
                status: t.status === 'done' ? '成功' : t.status === 'failed' ? '失败' : '运行', 
                c: t.status === 'failed' ? "text-[var(--danger)] border-[var(--danger)]" : t.status === 'running' ? "text-[var(--warning)] border-[var(--warning)]" : "text-[var(--success)] border-[var(--success)]", 
                bg: t.status === 'failed' ? "bg-[var(--danger)]/10" : t.status === 'running' ? "bg-[var(--warning)]/10" : "bg-[var(--success)]/5"
             });
          });
        }
        
        setLogs([
          { action: "系统守望者", target: "core_engine_v1", time: new Date().toLocaleTimeString(), status: "在线", c: "text-[var(--brand)] border-[var(--brand)]", bg: "bg-[var(--brand)]/10" },
           ...recentStream
        ]);

      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, 10000); // 10秒轮询

    return () => { 
      active = false; 
      clearInterval(timer);
    };
  }, []);

  const zeroRate = data && data.searchCount > 0 ? ((data.zeroCount / data.searchCount) * 100).toFixed(1) : '0.0';
  const hitRate = data && data.searchCount > 0 ? (100 - parseFloat(zeroRate)).toFixed(1) : '100.0';

  return (
    <div className="w-full min-h-full flex flex-col pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-12">
        <div>
           <h1 className="text-5xl md:text-7xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)]">
             PLATFORM_SUMMARY
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-[10px]">
             {"// GLOBAL_SYSTEM_OBSERVER_AND_CONTROL"}
           </p>
        </div>
        <div className="flex gap-4 items-center">
           <div className={`text-[10px] font-mono font-bold px-4 py-2 flex items-center border-[var(--border-width)] bg-[var(--bg-elevated)] ${loading ? 'text-[var(--warning)] border-[var(--warning)]' : data?.health?.ok ? 'text-[var(--success)] border-[var(--success)]' : 'text-[var(--danger)] border-[var(--danger)]'}`}>
             <div className={`w-1.5 h-1.5 animate-pulse mr-3 ${loading ? 'bg-[var(--warning)]' : data?.health?.ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
             {loading ? 'CONNECTING...' : data?.health?.ok ? 'CORE_ONLINE' : 'CORE_ERROR'}
           </div>
        </div>
      </div>

      {/* SWISS BENTO GRID */}
      <div className="gap-0 grid grid-cols-1 md:grid-cols-4 border-[var(--border-width)] border-[var(--border)] relative bg-[var(--border)]">
         
         {/* ALL TENANTS VECTORS */}
         <div className="bg-[var(--bg-card)] p-10 md:col-span-2 flex flex-col justify-between group min-h-[300px] border-r-[var(--border-width)] border-[var(--border)]">
            <div className="flex justify-between items-start">
               <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3em] font-mono">
                 VECTORS_TOTAL
               </span>
            </div>
            <div className="mt-4">
               <h2 className="text-7xl md:text-8xl lg:text-9xl font-black font-mono tracking-tighter tabular-nums text-[var(--text-primary)]">
                 <ScrambleNumber value={loading ? '---' : (data?.taskCount?.toLocaleString() || '0')} />
               </h2>
            </div>
         </div>

         <div className="bg-[var(--bg-card)] p-10 flex flex-col justify-between group border-r-[var(--border-width)] border-[var(--border)]">
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3em] font-mono">
               TENANTS_ACTIVE
            </div>
            <h2 className="text-7xl md:text-8xl font-black font-mono tracking-tighter tabular-nums text-[var(--brand)] mt-4">
              <ScrambleNumber value={loading ? '--' : (data?.kbCount?.toString().padStart(2, '0') || '00')} />
            </h2>
         </div>

         <div className="bg-[var(--bg-card)] p-10 flex flex-col justify-between group">
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3em] font-mono">
               GLOBAL_HIT_RATE
            </div>
            <h2 className="text-7xl md:text-8xl font-black font-mono tracking-tighter tabular-nums text-[var(--success)] mt-4">
              <ScrambleNumber value={loading ? '--.-' : hitRate} />
            </h2>
         </div>

         {/* LOGS - LOWER FULL WIDTH */}
         <div className="bg-[var(--bg-card)] col-span-1 md:col-span-4 border-t-[var(--border-width)] border-[var(--border)]">
            <div className="p-4 border-b-[var(--border-width)] border-[var(--border)] flex justify-between items-center bg-[var(--bg-elevated)]">
              <span className="text-[10px] font-bold uppercase tracking-[0.4em] font-mono text-[var(--text-primary)]">
                 SYSTEM_CAPTURE_STREAM
              </span>
            </div>
            <div className="p-0 overflow-y-auto" style={{ maxHeight: "400px" }}>
               {logs.map((log, i) => (
                 <div key={i} className={`flex items-center text-[10px] border-b-[var(--border-width)] border-[var(--border)] p-4 last:border-0 font-mono tracking-widest uppercase hover:bg-[var(--bg-elevated)] transition-colors`}>
                    <span className="opacity-40 mr-6 w-20">{log.time}</span>
                    <span className={`mr-6 font-black ${log.c.includes('danger') ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{log.action}</span>
                    <span className="opacity-60 flex-1 truncate">{log.target}</span>
                    <span className="font-black text-right ml-4">[{log.status}]</span>
                 </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
}
