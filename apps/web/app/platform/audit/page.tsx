"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useCallback, type ElementType } from "react";
import { Shield, Key, TerminalSquare, RefreshCw, Trash2, Database, Settings2 } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import {
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPanel,
  PlatformPageHeader,
  PlatformSelect,
  PlatformStateBadge,
  PlatformStatPill,
  PlatformUtilityBar,
} from "@/components/ui/platform-primitives";

interface AuditLog {
  id: string; userId: string; username: string; action: string;
  target: string; meta: Record<string, unknown>; ip: string;
  success: boolean; createdAt: string;
}
interface PageResult {
  items: AuditLog[]; total: number; page: number; pageSize: number; pages: number;
}

const ACTION_MAP: Record<string, { label: string; color: string; icon: ElementType }> = {
  login: { label: "平台登录", color: "var(--brand)", icon: Key },
  switch_role: { label: "视角切换", color: "var(--info)", icon: RefreshCw },
  create_tenant: { label: "租户创建", color: "var(--success)", icon: Shield },
  update_tenant: { label: "租户更新", color: "var(--warning)", icon: Settings2 },
  delete_tenant: { label: "租户删除", color: "var(--danger)", icon: Trash2 },
  settings_change: { label: "全局配置变更", color: "var(--warning)", icon: TerminalSquare },
  user_create: { label: "账号创建", color: "var(--success)", icon: Shield },
  user_delete: { label: "账号删除", color: "var(--danger)", icon: Trash2 },
  import: { label: "导入任务", color: "var(--info)", icon: Database },
};

export default function AuditPage() {
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (filterAction) params.set("action", filterAction);
      if (filterUser) params.set("username", filterUser);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      const data = await apiClient.get<PageResult>(`/audit?${params.toString()}`);
      setResult(data);
    } catch (error: unknown) {
      setResult(null);
      setLoadError(error instanceof Error ? error.message : "平台审计日志加载失败");
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

  const columns: ColumnDef<AuditLog>[] = [
    {
      key: "createdAt",
      header: "时间",
      cell: (log) => (
        <div className="font-mono text-[10px] tracking-widest text-[var(--text-secondary)] whitespace-nowrap">
          {new Date(log.createdAt).toLocaleString("en-GB", { hour12: false }).replace(",", "")}
        </div>
      ),
    },
    {
      key: "username",
      header: "操作人",
      cell: (log) => (
        <div className="font-black text-[11px] text-[var(--text-primary)] uppercase">
          {log.username || "ROOT"}
        </div>
      ),
    },
    {
      key: "classification",
      header: "操作类型",
      cell: (log) => {
        const mapped = ACTION_MAP[log.action] ?? { label: log.action.toUpperCase(), color: "var(--text-muted)", icon: Shield };
        const Icon = mapped.icon;
        const tone =
          mapped.color === "var(--brand)"
            ? "brand"
            : mapped.color === "var(--info)"
              ? "info"
              : mapped.color === "var(--success)"
                ? "success"
                : mapped.color === "var(--warning)"
                  ? "warning"
                  : mapped.color === "var(--danger)"
                    ? "danger"
                    : "muted";
        return (
          <PlatformStateBadge tone={tone}>
            <Icon size={12} strokeWidth={3} />
            {mapped.label}
          </PlatformStateBadge>
        );
      },
    },
    {
      key: "target",
      header: "目标对象",
      cell: (log) => (
        <div className="max-w-[120px] truncate text-[10px] text-[var(--text-secondary)] uppercase font-bold" title={log.target}>
          {log.target || "---"}
        </div>
      ),
    },
    {
      key: "status",
      header: "结果",
      cell: (log) => (
        <PlatformStateBadge tone={log.success ? "success" : "danger"}>
          {log.success ? "成功" : "失败"}
        </PlatformStateBadge>
      ),
    },
    {
      key: "meta",
      header: "附加信息",
      cell: (log) => (
        <div className="max-w-[150px] truncate rounded-none border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-[9px] text-[var(--text-muted)]" title={JSON.stringify(log.meta)}>
          {JSON.stringify(log.meta)}
        </div>
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-black tracking-tighter text-[var(--text-primary)] md:text-5xl">
            <Shield size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
            平台审计流_
          </h1>
        }
        subtitle={"// 全局系统操作轨迹与审计遥测"}
      />

      {/* ─── Filters ─── */}
      <PlatformPanel className="mb-8 p-6">
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <PlatformField label="操作类型">
               <PlatformSelect value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                 <option value="">全部事件</option>
                 {Object.keys(ACTION_MAP).map(k => (
                   <option key={k} value={k}>{ACTION_MAP[k]?.label ?? k}</option>
                 ))}
               </PlatformSelect>
            </PlatformField>
            <PlatformField label="操作账号">
               <PlatformInput type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="模糊匹配账号" />
            </PlatformField>
            <PlatformField label="开始日期">
               <PlatformInput type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </PlatformField>
            <PlatformField label="结束日期">
               <PlatformInput type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </PlatformField>
            <div className="flex flex-col justify-end">
               <PlatformButton
                 type="button"
                 onClick={handleSearch}
                 className="ov-button w-full py-2 text-xs"
               >
                 应用筛选
               </PlatformButton>
            </div>
         </div>
      </PlatformPanel>

      {/* ─── Data Grid ─── */}
      <div className="bg-[var(--bg-card)] border-[var(--border-width)] border-[var(--border)] overflow-x-auto relative flex-1 shadow-[var(--shadow-base)]">
        <PlatformUtilityBar
          className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)]"
          leading={
            <PlatformStatPill
              label="记录总数"
              value={<span>[{result?.total ?? 0}]</span>}
              accent="var(--brand)"
              backgroundClassName="bg-[var(--bg-card)]"
            />
          }
          trailing={
            result && result.pages > 1 ? (
              <>
                <PlatformButton
                  type="button"
                  aria-label="上一页平台审计日志"
                  title="上一页平台审计日志"
                  disabled={page <= 1 || loading}
                  onClick={() => { const p = page - 1; setPage(p); load(p); }}
                  className="ov-button px-2 py-1 text-[10px]"
                >
                  上一页
                </PlatformButton>
                <span className="px-2 font-mono text-[10px] font-black tracking-widest text-[var(--text-primary)]">P.{page}/{result.pages}</span>
                <PlatformButton
                  type="button"
                  aria-label="下一页平台审计日志"
                  title="下一页平台审计日志"
                  disabled={page >= result.pages || loading}
                  onClick={() => { const p = page + 1; setPage(p); load(p); }}
                  className="ov-button px-2 py-1 text-[10px]"
                >
                  下一页
                </PlatformButton>
              </>
            ) : undefined
          }
        />
        <DataTable
          data={result?.items ?? []}
          columns={columns}
          loading={loading}
          loadingMessage="正在同步审计日志..."
          errorMessage={loadError ? `审计日志加载失败：${loadError}` : undefined}
          emptyMessage="当前筛选条件下没有审计记录"
          tableLabel="平台审计日志表"
          className="border-0 shadow-none"
          rowClassName={() => "hover:bg-[var(--bg-elevated)] transition-colors"}
        />
        {loadError ? (
          <div className="border-t-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
            <PlatformButton
              type="button"
              tone="danger"
              onClick={() => void load(page)}
              className="ov-button px-4 py-2 text-[10px]"
            >
              重试加载
            </PlatformButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
