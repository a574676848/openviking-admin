"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useCallback, type ElementType } from "react";
import { Shield, Key, TerminalSquare, RefreshCw, Trash2, Database, Settings2 } from "lucide-react";

interface AuditLog {
  id: string; userId: string; username: string; action: string;
  target: string; meta: Record<string, unknown>; ip: string;
  success: boolean; createdAt: string;
}
interface PageResult {
  items: AuditLog[]; total: number; page: number; pageSize: number; pages: number;
}

const ACTION_MAP: Record<string, { label: string; color: string; icon: ElementType }> = {
  login: { label: "CORE_ACCESS", color: "var(--brand)", icon: Key },
  switch_role: { label: "VIEW_IMPERSONATE", color: "var(--info)", icon: RefreshCw },
  create_tenant: { label: "SPACE_ALLOCATED", color: "var(--success)", icon: Shield },
  update_tenant: { label: "SPACE_MODIFIED", color: "var(--warning)", icon: Settings2 },
  delete_tenant: { label: "SPACE_TERMINATED", color: "var(--danger)", icon: Trash2 },
  settings_change: { label: "GLOBAL_CFG_SET", color: "var(--warning)", icon: TerminalSquare },
  user_create: { label: "USR_PROVISION", color: "var(--success)", icon: Shield },
  user_delete: { label: "USR_DECOMMISSION", color: "var(--danger)", icon: Trash2 },
  import: { label: "DATA_INGEST", color: "var(--info)", icon: Database },
};

export default function AuditPage() {
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (filterAction) params.set("action", filterAction);
      if (filterUser) params.set("username", filterUser);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      const data = await apiClient.get<PageResult>(`/audit?${params.toString()}`);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterUser, filterDateFrom, filterDateTo]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const handleSearch = () => { setPage(1); load(1); };

  return (
    <div className="w-full flex flex-col pb-10 min-h-full theme-swiss">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-8">
        <div>
           <h1 className="text-4xl md:text-5xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Shield size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             平台审计流_
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-xs">
             {"// GLOBAL_SYSTEM_TRAIL & OPERATION_TELEMETRY"}
           </p>
        </div>
      </div>

      {/* ─── Filters ─── */}
      <div className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] p-6 mb-8 shadow-[var(--shadow-base)]">
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="flex flex-col gap-1.5">
               <label className="font-mono text-[9px] font-black tracking-widest uppercase text-[var(--text-secondary)]">OP_TYPE</label>
               <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="ov-input px-3 py-2 font-mono text-xs uppercase bg-[var(--bg-input)]">
                 <option value="">* (ALL_EVENTS)</option>
                 {Object.keys(ACTION_MAP).map(k => (
                   <option key={k} value={k}>{ACTION_MAP[k]?.label ?? k}</option>
                 ))}
               </select>
            </div>
            <div className="flex flex-col gap-1.5">
               <label className="font-mono text-[9px] font-black tracking-widest uppercase text-[var(--text-secondary)]">USER_ID</label>
               <input type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="FUZZY..." className="ov-input px-3 py-2 font-mono text-xs tracking-widest" />
            </div>
            <div className="flex flex-col gap-1.5">
               <label className="font-mono text-[9px] font-black tracking-widest uppercase text-[var(--text-secondary)]">T_FROM</label>
               <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="ov-input px-3 py-2 font-mono text-xs tracking-widest" />
            </div>
            <div className="flex flex-col gap-1.5">
               <label className="font-mono text-[9px] font-black tracking-widest uppercase text-[var(--text-secondary)]">T_TO</label>
               <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="ov-input px-3 py-2 font-mono text-xs tracking-widest" />
            </div>
            <div className="flex flex-col justify-end">
               <button onClick={handleSearch} className="ov-button py-2 font-black tracking-[0.2em] w-full text-xs uppercase">{">>"} APPLY_FILTER</button>
            </div>
         </div>
      </div>

      {/* ─── Data Grid ─── */}
      <div className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] overflow-x-auto relative flex-1 shadow-[var(--shadow-base)]">
        <div className="flex justify-between items-center p-3 border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)]">
             <span className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-primary)]">
             {'// RECORDS_FOUND: '}<span className="text-[var(--brand)]">[{result?.total ?? 0}]</span>
           </span>
           {result && result.pages > 1 && (
             <div className="flex items-center gap-2">
               <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }} className="ov-button px-2 py-1 disabled:opacity-50 text-[10px]">PREV</button>
               <span className="font-mono text-[10px] font-black tracking-widest text-[var(--text-primary)] px-2">P.{page}/{result.pages}</span>
               <button disabled={page >= result.pages} onClick={() => { const p = page + 1; setPage(p); load(p); }} className="ov-button px-2 py-1 disabled:opacity-50 text-[10px]">NEXT</button>
             </div>
           )}
        </div>
        <table className="w-full text-left border-collapse font-mono">
          <thead>
            <tr className="bg-[var(--bg-elevated)] border-b-[var(--border-width)] border-[var(--border)]">
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Timestamp</th>
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Operator</th>
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Classification</th>
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Target</th>
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Status</th>
              <th className="p-4 text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">Telemetry</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-12 text-center text-xs tracking-[0.3em] text-[var(--text-muted)] uppercase animate-pulse">{"// SYNCING_AUDIT_DATA..."}</td></tr>
            ) : !result?.items.length ? (
              <tr><td colSpan={6} className="p-12 text-center text-xs tracking-widest text-[var(--text-muted)] uppercase">{"// NULL_LOGS_FOUND"}</td></tr>
            ) : result.items.map(log => {
              const mapped = ACTION_MAP[log.action] ?? { label: log.action.toUpperCase(), color: "var(--text-muted)", icon: Shield };
              const Icon = mapped.icon;
              return (
                <tr key={log.id} className="border-b-[var(--border-width)] border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)] transition-colors">
                  <td className="p-4 text-[10px] tracking-widest text-[var(--text-secondary)] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('en-GB', { hour12: false }).replace(',', '')}
                  </td>
                  <td className="p-4 font-black text-[11px] text-[var(--text-primary)] uppercase">
                    {log.username || "ROOT"}
                  </td>
                  <td className="p-4">
                     <span className="inline-flex items-center gap-2 text-[10px] font-black tracking-widest" style={{ color: mapped.color }}>
                       <Icon size={12} strokeWidth={3} />
                       {mapped.label}
                     </span>
                  </td>
                  <td className="p-4 text-[10px] text-[var(--text-secondary)] max-w-[120px] truncate uppercase font-bold" title={log.target}>
                    {log.target || "---"}
                  </td>
                  <td className="p-4 text-[10px] font-black">
                    {log.success ? (
                      <span className="text-[var(--success)]">OK</span>
                    ) : (
                      <span className="text-[var(--danger)]">ERR</span>
                    )}
                  </td>
                  <td className="p-4">
                     <div className="text-[9px] text-[var(--text-muted)] bg-[var(--bg-elevated)] p-1.5 border-[var(--border-width)] border-[var(--border)] truncate max-w-[150px]" title={JSON.stringify(log.meta)}>
                       {JSON.stringify(log.meta)}
                     </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
