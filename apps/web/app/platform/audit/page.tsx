"use client";
import { apiClient } from "@/lib/apiClient";
import { useEffect, useState, useCallback, type ElementType } from "react";
import { Shield, Key, TerminalSquare, RefreshCw, Trash2, Database, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
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
      sortable: true,
      sortValue: (log) => new Date(log.createdAt),
      cell: (log) => (
        <div className="font-mono text-[10px] tracking-widest text-[var(--text-secondary)] whitespace-nowrap">
          {new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </div>
      ),
    },
    {
      key: "username",
      header: "操作人",
      searchable: true,
      searchValue: (log) => log.username || "ROOT",
      sortable: true,
      sortValue: (log) => log.username || "ROOT",
      cell: (log) => (
        <div className="font-bold text-[11px] text-[var(--text-primary)]">
          {log.username || "ROOT"}
        </div>
      ),
    },
    {
      key: "classification",
      header: "操作类型",
      searchable: true,
      searchValue: (log) => ACTION_MAP[log.action]?.label ?? log.action,
      sortable: true,
      sortValue: (log) => ACTION_MAP[log.action]?.label ?? log.action,
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
      searchable: true,
      searchValue: (log) => log.target || "",
      sortable: true,
      sortValue: (log) => log.target || "",
      cell: (log) => (
        <div className="max-w-[120px] truncate text-[10px] text-[var(--text-secondary)] uppercase font-bold" title={log.target}>
          {log.target || "---"}
        </div>
      ),
    },
    {
      key: "status",
      header: "结果",
      searchable: true,
      searchValue: (log) => (log.success ? "成功" : "失败"),
      sortable: true,
      sortValue: (log) => log.success,
      cell: (log) => (
        <PlatformStateBadge tone={log.success ? "success" : "danger"}>
          {log.success ? "成功" : "失败"}
        </PlatformStateBadge>
      ),
    },
    {
      key: "meta",
      header: "附加信息",
      searchable: true,
      searchValue: (log) => JSON.stringify(log.meta),
      cell: (log) => (
        <div className="max-w-[150px] truncate border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-[9px] text-[var(--text-muted)]" title={JSON.stringify(log.meta)}>
          {JSON.stringify(log.meta)}
        </div>
      ),
    },
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-5xl">
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
            <PlatformField label="&nbsp;">
               <PlatformButton
                 type="button"
                 onClick={handleSearch}
                 className="ov-button w-full py-3 text-sm"
               >
                 应用筛选
               </PlatformButton>
            </PlatformField>
         </div>
      </PlatformPanel>

      {/* ─── Data Grid ─── */}
      <div className="relative flex-1 overflow-hidden rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)]">
        {/* 工具栏：记录总数 + 分页 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              记录总数
            </span>
            <span className="font-mono text-sm font-black tabular-nums text-[var(--brand)]">
              [{result?.total ?? 0}]
            </span>
          </div>

          {result && result.pages > 1 ? (
            <div className="flex items-center gap-3">
              <PlatformButton
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => { const p = page - 1; setPage(p); void load(p); }}
                className="ov-button px-3 py-1.5 text-[10px]"
              >
                <ChevronLeft size={12} strokeWidth={2.6} />
                上一页
              </PlatformButton>
              <span className="font-mono text-[10px] font-bold tracking-widest text-[var(--text-primary)]">
                第 {page}/{result.pages} 页
              </span>
              <PlatformButton
                type="button"
                disabled={page >= result.pages || loading}
                onClick={() => { const p = page + 1; setPage(p); void load(p); }}
                className="ov-button px-3 py-1.5 text-[10px]"
              >
                下一页
                <ChevronRight size={12} strokeWidth={2.6} />
              </PlatformButton>
            </div>
          ) : null}
        </div>
        <DataTable
          data={result?.items ?? []}
          columns={columns}
          loading={loading}
          loadingMessage="正在同步审计日志..."
          errorMessage={loadError ? `审计日志加载失败：${loadError}` : undefined}
          emptyMessage="当前筛选条件下没有审计记录"
          tableLabel="平台审计日志表"
          searchConfig={{ placeholder: "搜索操作人 / 事件类型 / 目标对象..." }}
          className="border-0 shadow-none rounded-none"
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
