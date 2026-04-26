"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useRef } from "react";
import {
  PlatformActivityRow,
  PlatformFooterBar,
  PlatformMetric,
  PlatformPanel,
  PlatformPageHeader,
  PlatformStateBadge,
  PlatformStatusPanel,
} from "@/components/ui/platform-primitives";

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
  tone: "brand" | "success" | "warning" | "danger";
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
  const [loadError, setLoadError] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoadError("");
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
                tone: t.status === 'failed' ? "danger" : t.status === 'running' ? "warning" : "success",
             });
          });
        }
        
        setLogs([
          { action: "系统守望者", target: "core_engine_v1", time: new Date().toLocaleTimeString(), status: "在线", tone: "brand" },
           ...recentStream
        ]);

      } catch (e) {
        if (active) {
          setLoadError(e instanceof Error ? e.message : "平台总览加载失败");
        }
        if (process.env.NODE_ENV === "development") console.error(e);
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
      <PlatformPageHeader
        className="mb-12"
        title={
          <h1 className="mb-2 text-4xl font-black tracking-tighter text-[var(--text-primary)] md:text-6xl">
            平台总览
          </h1>
        }
        subtitle={"// 全局系统观察与平台运行控制"}
        subtitleClassName="text-[10px]"
        actions={
          <PlatformStateBadge tone={loading ? "warning" : data?.health?.ok ? "success" : "danger"} className="px-4 py-2 text-[10px]">
            <div className={`mr-3 h-1.5 w-1.5 animate-pulse ${loading ? 'bg-[var(--warning)]' : data?.health?.ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
            {loading ? '连接中' : data?.health?.ok ? '核心在线' : '核心异常'}
          </PlatformStateBadge>
        }
      />

      {loadError ? (
        <PlatformStatusPanel
          title="平台总览加载失败"
          description={loadError}
          className="mb-8 border-[var(--danger)]"
        />
      ) : null}

      {/* SWISS BENTO GRID */}
      <div className="gap-0 grid grid-cols-1 md:grid-cols-4 border-[var(--border-width)] border-[var(--border)] relative bg-[var(--border)]">
         
         {/* ALL TENANTS VECTORS */}
         <PlatformMetric
            label="向量总量"
            value={<ScrambleNumber value={loading ? '---' : (data?.taskCount?.toLocaleString() || '0')} />}
            className="min-h-[300px] border-r-[var(--border-width)] px-10 py-10 shadow-none md:col-span-2"
            valueClassName="text-6xl md:text-7xl lg:text-8xl"
            labelClassName="tracking-[0.3em]"
         />

         <PlatformMetric
            label="活跃租户"
            value={<ScrambleNumber value={loading ? '--' : (data?.kbCount?.toString().padStart(2, '0') || '00')} />}
            accent="var(--brand)"
            className="border-r-[var(--border-width)] px-10 py-10 shadow-none"
            valueClassName="text-6xl md:text-7xl"
            labelClassName="tracking-[0.3em]"
         />

         <PlatformMetric
            label="全局命中率"
            value={<ScrambleNumber value={loading ? '--.-' : hitRate} />}
            accent="var(--success)"
            className="px-10 py-10 shadow-none"
            valueClassName="text-6xl md:text-7xl"
            labelClassName="tracking-[0.3em]"
         />

         {/* LOGS - LOWER FULL WIDTH */}
         <PlatformPanel className="col-span-1 border-t-[var(--border-width)] shadow-none md:col-span-4">
            <PlatformFooterBar
              className="border-t-0 border-b-[var(--border-width)] bg-[var(--bg-elevated)] tracking-[0.4em] text-[var(--text-primary)]"
              leading="系统采样流"
            />
            <div className="p-0 overflow-y-auto" style={{ maxHeight: "400px" }}>
               {logs.map((log, i) => (
                 <PlatformActivityRow
                    key={`${log.action}-${log.time}-${i}`}
                    time={log.time}
                    primary={log.action}
                    secondary={log.target}
                    status={log.status}
                    tone={log.tone}
                 />
               ))}
            </div>
         </PlatformPanel>
      </div>
    </div>
  );
}
