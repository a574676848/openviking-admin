"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserRoundCog,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import {
  PlatformPageHeader,
  PlatformStateBadge,
} from "@/components/ui/platform-primitives";
import {
  ConsoleButton,
  ConsoleField,
  ConsoleInput,
  ConsolePanel,
  ConsoleSelect,
} from "@/components/console/primitives";

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  ip: string;
  success: boolean;
  createdAt: string;
}

interface PageResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/* ------------------------------------------------------------------ */
/*  操作类型定义                                                       */
/* ------------------------------------------------------------------ */

interface ActionDef {
  label: string;
  icon: typeof Shield;
  tone: "brand" | "info" | "success" | "warning" | "danger" | "muted";
}

const ACTION_DEF: Record<string, ActionDef> = {
  login:            { label: "登录鉴权",   icon: Shield,        tone: "brand" },
  import:           { label: "知识导入",   icon: RefreshCw,     tone: "warning" },
  reindex:          { label: "重建索引",   icon: RefreshCw,     tone: "muted" },
  search:           { label: "语义检索",   icon: Search,        tone: "success" },
  settings_change:  { label: "参数变更",   icon: UserRoundCog,  tone: "warning" },
  user_create:      { label: "新增成员",   icon: CheckCircle2,  tone: "success" },
  user_delete:      { label: "删除成员",   icon: Trash2,        tone: "danger" },
  create_kb:        { label: "创建知识库", icon: CheckCircle2,  tone: "brand" },
  delete_kb:        { label: "删除知识库", icon: Trash2,        tone: "danger" },
};

function resolveAction(action: string): ActionDef {
  return ACTION_DEF[action] ?? {
    label: action || "未知操作",
    icon: Shield,
    tone: "muted",
  };
}

/* ------------------------------------------------------------------ */
/*  页面组件                                                           */
/* ------------------------------------------------------------------ */

export default function AuditPage() {
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  /* ---- 数据加载 ---- */

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: "20",
        });
        if (filterAction) params.set("action", filterAction);
        if (filterUser) params.set("username", filterUser);
        if (filterDateFrom) params.set("dateFrom", filterDateFrom);
        if (filterDateTo) params.set("dateTo", filterDateTo);

        const data = await apiClient.get<PageResult>(`/audit?${params.toString()}`);
        setResult(data);
        setPage(targetPage);
      } catch (error: unknown) {
        setResult(null);
        setLoadError(error instanceof Error ? error.message : "审计流水加载失败");
      } finally {
        setLoading(false);
      }
    },
    [filterAction, filterUser, filterDateFrom, filterDateTo],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void load(1);
    });
  }, [load]);

  /* ---- 筛选重置 ---- */

  const handleSearch = () => {
    setPage(1);
    void load(1);
  };

  /* ---- 列定义 — Badge 使用 PlatformStateBadge，对齐 platform/audit ---- */

  const columns: ColumnDef<AuditLog>[] = [
    {
      key: "createdAt",
      header: "时间",
      sortable: true,
      sortValue: (log) => new Date(log.createdAt),
      cell: (log) => (
        <div className="whitespace-nowrap font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
          {new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </div>
      ),
    },
    {
      key: "username",
      header: "操作人",
      searchable: true,
      searchValue: (log) => log.username || "系统",
      sortable: true,
      sortValue: (log) => log.username || "系统",
      cell: (log) => (
        <div className="font-bold text-[11px] text-[var(--text-primary)]">
          {log.username || "系统"}
        </div>
      ),
    },
    {
      key: "action",
      header: "操作类型",
      searchable: true,
      searchValue: (log) => resolveAction(log.action).label,
      sortable: true,
      sortValue: (log) => resolveAction(log.action).label,
      cell: (log) => {
        const def = resolveAction(log.action);
        const Icon = def.icon;
        return (
          <PlatformStateBadge tone={def.tone}>
            <Icon size={12} strokeWidth={3} />
            {def.label}
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
        <div className="max-w-[120px] truncate text-[10px] font-bold uppercase text-[var(--text-secondary)]" title={log.target}>
          {log.target || "---"}
        </div>
      ),
    },
    {
      key: "ip",
      header: "来源 IP",
      cell: (log) => (
        <div className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
          {log.ip || "---"}
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
        <div
          className="max-w-[150px] truncate border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 text-[9px] text-[var(--text-muted)]"
          title={JSON.stringify(log.meta)}
        >
          {JSON.stringify(log.meta)}
        </div>
      ),
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  渲染                                                               */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex min-h-full flex-col gap-8 pb-10">
      {/* 页头 — 参考 integrations 的 PlatformPageHeader 写法 */}
      <PlatformPageHeader
        title={
          <h1 className="font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            租户审计日志
          </h1>
        }
        subtitle="查看当前租户下所有操作留痕、执行结果与筛选分页"
        subtitleClassName="mt-2 text-sm font-medium tracking-normal normal-case text-[var(--text-muted)]"
      />

      {/* 筛选区 — 紧凑布局，按钮同行 */}
      <ConsolePanel className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <ConsoleField label="操作类型">
            <ConsoleSelect
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="">全部事件</option>
              {Object.entries(ACTION_DEF).map(([key, def]) => (
                <option key={key} value={key}>
                  {def.label}
                </option>
              ))}
            </ConsoleSelect>
          </ConsoleField>

          <ConsoleField label="执行人">
            <ConsoleInput
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              placeholder="输入用户名关键词"
            />
          </ConsoleField>

          <ConsoleField label="起始日期">
            <ConsoleInput
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </ConsoleField>

          <ConsoleField label="截止日期">
            <ConsoleInput
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </ConsoleField>

          <ConsoleField label="&nbsp;">
            <ConsoleButton type="button" onClick={handleSearch} className="w-full py-3 text-sm">
              应用筛选
            </ConsoleButton>
          </ConsoleField>
        </div>
      </ConsolePanel>

      {/* 数据表格 — 圆角容器 + 工具栏 */}
      <div className="relative flex-1 overflow-hidden rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)]">
        {/* 工具栏：记录总数 + 分页 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              记录总数
            </span>
            <span className="font-sans text-sm font-black tabular-nums text-[var(--brand)]">
              [{result?.total ?? 0}]
            </span>
          </div>

          {result && result.pages > 1 ? (
            <div className="flex items-center gap-3">
              <ConsoleButton
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => { const p = page - 1; setPage(p); void load(p); }}
                className="px-3 py-1.5 text-[10px]"
              >
                <ChevronLeft size={12} strokeWidth={2.6} />
                上一页
              </ConsoleButton>
              <span className="font-sans text-[10px] font-bold tracking-widest text-[var(--text-primary)]">
                第 {page}/{result.pages} 页
              </span>
              <ConsoleButton
                type="button"
                disabled={page >= result.pages || loading}
                onClick={() => { const p = page + 1; setPage(p); void load(p); }}
                className="px-3 py-1.5 text-[10px]"
              >
                下一页
                <ChevronRight size={12} strokeWidth={2.6} />
              </ConsoleButton>
            </div>
          ) : null}
        </div>

        <DataTable
          data={result?.items ?? []}
          columns={columns}
          loading={loading}
          loadingMessage="正在同步审计流水..."
          errorMessage={loadError ? `审计流水加载失败：${loadError}` : undefined}
          emptyMessage="当前筛选条件下没有匹配的审计记录"
          tableLabel="租户审计日志表"
          searchConfig={{ placeholder: "搜索操作人 / 事件类型 / 目标对象..." }}
          className="border-0 shadow-none rounded-none"
          rowClassName={() => "hover:bg-[var(--bg-elevated)] transition-colors"}
        />

        {loadError ? (
          <div className="border-t border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
            <ConsoleButton
              type="button"
              tone="danger"
              onClick={() => void load(page)}
              className="px-4 py-2 text-[10px]"
            >
              重试加载
            </ConsoleButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
