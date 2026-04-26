"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  ConsoleButton,
  ConsoleControlPanel,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleIconButton,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleSelect,
  ConsoleStatsGrid,
  ConsoleTableShell,
  resolveConsoleTableState,
  ConsoleBadge,
} from "@/components/console/primitives";

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

const ACTION_MAP: Record<
  string,
  {
    label: string;
    icon: typeof Shield;
    className: string;
  }
> = {
  login: { label: "登录鉴权", icon: Shield, className: "bg-[var(--brand)] text-white" },
  import: { label: "知识导入", icon: RefreshCw, className: "bg-[var(--warning)] text-black" },
  reindex: { label: "重建索引", icon: RefreshCw, className: "bg-black text-white" },
  search: { label: "语义检索", icon: Search, className: "bg-[var(--success)] text-white" },
  settings_change: { label: "参数变更", icon: UserRoundCog, className: "bg-[var(--warning)] text-black" },
  user_create: { label: "新增成员", icon: CheckCircle2, className: "bg-[var(--success)] text-white" },
  user_delete: { label: "删除成员", icon: Trash2, className: "bg-[var(--danger)] text-white" },
  create_kb: { label: "创建知识库", icon: CheckCircle2, className: "bg-[var(--brand)] text-white" },
  delete_kb: { label: "删除知识库", icon: Trash2, className: "bg-[var(--danger)] text-white" },
};

export default function AuditPage() {
  const [result, setResult] = useState<PageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");

  const load = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: "15",
        });
        if (filterAction) {
          params.set("action", filterAction);
        }
        if (filterUser) {
          params.set("username", filterUser);
        }
        const response = await apiClient.get<PageResult>(`/audit?${params.toString()}`);
        setResult(response);
        setPage(targetPage);
      } catch (error: unknown) {
        setLoadError(error instanceof Error ? error.message : "审计流水加载失败");
      } finally {
        setLoading(false);
      }
    },
    [filterAction, filterUser],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void load(1);
    });
  }, [load]);

  const stats = useMemo(() => {
    const items = result?.items ?? [];
    const successCount = items.filter((item) => item.success).length;
    const failCount = items.length - successCount;
    const users = new Set(items.map((item) => item.username || item.userId).filter(Boolean)).size;

    return {
      successCount,
      failCount,
      users,
    };
  }, [result]);

  const tableState = resolveConsoleTableState({
    loading,
    hasError: Boolean(loadError),
    hasData: Boolean(result?.items?.length),
  });

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="审计日志流"
        subtitle="查看租户操作留痕、执行结果与筛选分页"
        icon={Shield}
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="当前页记录" value={String(result?.items.length ?? 0).padStart(2, "0")} />
        <ConsoleMetricCard label="总记录数" value={(result?.total ?? 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="成功执行" value={stats.successCount.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="失败执行" value={stats.failCount.toLocaleString()} tone="danger" />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <ConsoleControlPanel
          eyebrow="筛选台"
          title="按操作类型与执行人筛选"
          footer={
            <ConsoleStatsGrid className="grid-cols-2">
              <ConsoleMetricCard label="当前页用户数" value={stats.users.toLocaleString()} />
              <ConsoleMetricCard label="当前页码" value={`${page}/${result?.pages ?? 1}`} tone="warning" />
            </ConsoleStatsGrid>
          }
        >
          <div className="grid grid-cols-1 gap-5">
            <ConsoleField label="操作类型">
              <ConsoleSelect value={filterAction} onChange={(event) => setFilterAction(event.target.value)}>
                <option value="">全部事件</option>
                {Object.entries(ACTION_MAP).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </ConsoleSelect>
            </ConsoleField>

            <ConsoleField label="执行人">
              <ConsoleInput
                value={filterUser}
                onChange={(event) => setFilterUser(event.target.value)}
                placeholder="输入用户名关键词"
              />
            </ConsoleField>

            <ConsoleButton type="button" onClick={() => void load(1)} className="mt-2">
              应用筛选
            </ConsoleButton>
          </div>
        </ConsoleControlPanel>

        <ConsoleTableShell
          columns={
            <div className="grid grid-cols-[minmax(0,1fr)_140px]">
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              当前租户操作流水
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4">
              <ConsoleIconButton
                type="button"
                aria-label="上一页审计日志"
                disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}
              >
                <ChevronLeft size={14} strokeWidth={2.6} />
              </ConsoleIconButton>
              <ConsoleIconButton
                type="button"
                aria-label="下一页审计日志"
                disabled={page >= (result?.pages ?? 1) || loading}
                onClick={() => void load(page + 1)}
              >
                <ChevronRight size={14} strokeWidth={2.6} />
              </ConsoleIconButton>
            </div>
            </div>
          }
          state={tableState}
          stateContent={{
            loading: <ConsoleEmptyState icon={RefreshCw} title="正在同步审计流水..." description="系统正在加载当前租户的操作留痕。" />,
            error: (
              <ConsoleEmptyState
                icon={Shield}
                title="审计流水加载失败"
                description={loadError}
                action={
                  <ConsoleButton type="button" onClick={() => void load(page)}>
                    重新加载
                  </ConsoleButton>
                }
              />
            ),
            empty: <ConsoleEmptyState icon={Shield} title="暂无审计记录" description="当前筛选条件下没有匹配的操作留痕。" />,
          }}
        >
          {result?.items?.map((log) => {
                const mapped = ACTION_MAP[log.action] ?? {
                  label: log.action,
                  icon: Shield,
                  className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
                };
                const Icon = mapped.icon;

                return (
                  <div
                    key={log.id}
                    className="grid gap-px bg-[var(--border)] xl:grid-cols-[170px_140px_170px_minmax(0,1fr)_130px_120px]"
                  >
                    <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                      {new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5">
                      <p className="font-sans text-base font-black text-[var(--text-primary)]">
                        {log.username || "system"}
                      </p>
                      <p className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {log.userId || "n/a"}
                      </p>
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5">
                      <ConsoleBadge className={`items-center gap-2 ${mapped.className}`} tone="default">
                        <Icon size={12} strokeWidth={2.6} />
                        {mapped.label}
                      </ConsoleBadge>
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5">
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        目标对象
                      </p>
                      <p className="mt-2 break-all font-mono text-xs font-bold text-[var(--text-primary)]">
                        {log.target || "-"}
                      </p>
                      {Object.keys(log.meta ?? {}).length > 0 && (
                        <p className="mt-3 font-mono text-[10px] font-bold text-[var(--text-secondary)]">
                          {JSON.stringify(log.meta)}
                        </p>
                      )}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-primary)]">
                      {log.ip || "-"}
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5">
                      <ConsoleBadge tone={log.success ? "success" : "danger"}>
                        {log.success ? "成功" : "失败"}
                      </ConsoleBadge>
                    </div>
                  </div>
                );
              })}
        </ConsoleTableShell>
      </section>
    </div>
  );
}
