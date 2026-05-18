"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Play, RefreshCw, ServerCog, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { API_ENDPOINTS, IsolationLevel } from "@/lib/constants";
import {
  PlatformButton,
  PlatformField,
  PlatformPageHeader,
  PlatformPanel,
  PlatformSectionTitle,
  PlatformSelect,
  PlatformStateBadge,
} from "@/components/ui/platform-primitives";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { ScrambleText } from "@/components/ui/ScrambleText";

interface Tenant {
  id: string;
  tenantId: string;
  displayName: string;
  status: string;
  isolationLevel: IsolationLevel;
  dbConfig: Record<string, unknown> | null;
}

interface PrecheckItem {
  name: string;
  passed: boolean;
  message: string;
}

interface PrecheckResult {
  passed: boolean;
  scope?: MigrationScope;
  sourceLevel?: IsolationLevel;
  targetLevel?: IsolationLevel;
  items: PrecheckItem[];
}

type MigrationScope = "platform" | "tenant";

interface MigrationTask {
  id: string;
  scope: MigrationScope;
  tenantId: string | null;
  sourceLevel: IsolationLevel | null;
  targetLevel: IsolationLevel | null;
  status: "pending" | "running" | "succeeded" | "failed";
  step: string;
  progress: number;
  errorMessage: string | null;
  createdByName: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<MigrationTask["status"], string> = {
  pending: "等待执行",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
};

export default function DatabaseMigrationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tasks, setTasks] = useState<MigrationTask[]>([]);
  const [scope, setScope] = useState<MigrationScope>("platform");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [precheckResult, setPrecheckResult] = useState<PrecheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId || tenant.tenantId === selectedTenantId),
    [selectedTenantId, tenants],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantItems, taskItems] = await Promise.all([
        apiClient.get<Tenant[]>(API_ENDPOINTS.TENANT_MIGRATIONS.TENANTS),
        apiClient.get<MigrationTask[]>(API_ENDPOINTS.TENANT_MIGRATIONS.TASKS),
      ]);
      setTenants(Array.isArray(tenantItems) ? tenantItems : []);
      setTasks(Array.isArray(taskItems) ? taskItems : []);
      if (!selectedTenantId && Array.isArray(tenantItems) && tenantItems.length > 0) {
        setSelectedTenantId(tenantItems[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasRunningTask = tasks.some((task) => task.status === "pending" || task.status === "running");
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => {
      void load();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [load, tasks]);

  const buildTenantPayload = () => ({ tenantId: selectedTenantId });

  const runPrecheck = async () => {
    setChecking(true);
    setPrecheckResult(null);
    try {
      const endpoint =
        scope === "platform"
          ? API_ENDPOINTS.TENANT_MIGRATIONS.PLATFORM_PRECHECK
          : API_ENDPOINTS.TENANT_MIGRATIONS.PRECHECK;
      const result = await apiClient.post<PrecheckResult>(
        endpoint,
        scope === "platform" ? {} : buildTenantPayload(),
      );
      setPrecheckResult(result);
      toast[result.passed ? "success" : "error"](
        result.passed ? "迁移预检已通过" : "迁移预检未通过",
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "迁移预检失败");
    } finally {
      setChecking(false);
    }
  };

  const createTask = async () => {
    setCreating(true);
    try {
      const endpoint =
        scope === "platform"
          ? API_ENDPOINTS.TENANT_MIGRATIONS.PLATFORM_TASKS
          : API_ENDPOINTS.TENANT_MIGRATIONS.TASKS;
      await apiClient.post(
        endpoint,
        scope === "platform" ? {} : buildTenantPayload(),
      );
      toast.success("迁移任务已创建");
      setPrecheckResult(null);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "迁移任务创建失败");
    } finally {
      setCreating(false);
    }
  };

  const columns: ColumnDef<MigrationTask>[] = [
    {
      key: "tenant",
      header: "范围",
      searchable: true,
      searchValue: (task) => `${task.scope} ${task.tenantId ?? "platform"}`,
      cell: (task) => (
        <div>
          <div className="font-sans text-sm font-bold">
            {task.scope === "platform" ? "平台公共表" : task.tenantId}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {task.scope === "platform"
              ? "控制库"
              : (task.targetLevel ?? task.sourceLevel ?? "未知规格").toUpperCase()}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "状态",
      sortable: true,
      sortValue: (task) => task.status,
      cell: (task) => (
        <PlatformStateBadge
          tone={
            task.status === "succeeded"
              ? "success"
              : task.status === "failed"
                ? "danger"
                : task.status === "running"
                  ? "brand"
                  : "warning"
          }
        >
          {STATUS_LABEL[task.status]}
        </PlatformStateBadge>
      ),
    },
    {
      key: "progress",
      header: "进度",
      sortable: true,
      sortValue: (task) => task.progress,
      cell: (task) => (
        <div className="min-w-[180px]">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[var(--text-secondary)]">
            <span>{task.step}</span>
            <span>{task.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div
              className="h-full bg-[var(--brand)] transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {task.errorMessage ? (
            <div className="mt-2 text-xs text-[var(--danger)]">{task.errorMessage}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "operator",
      header: "操作人",
      searchable: true,
      searchValue: (task) => task.createdByName ?? "",
      cell: (task) => (
        <span className="font-sans text-sm font-bold text-[var(--text-primary)]">
          {task.createdByName || "系统"}
        </span>
      ),
    },
    {
      key: "errorMessage",
      header: "错误消息",
      searchable: true,
      searchValue: (task) => task.errorMessage ?? "",
      cell: (task) => task.errorMessage ? (
        <div className="max-w-[260px] truncate text-xs text-[var(--danger)]" title={task.errorMessage}>
          {task.errorMessage}
        </div>
      ) : (
        <span className="text-xs text-[var(--text-muted)]">无</span>
      ),
    },
    {
      key: "createdAt",
      header: "创建时间",
      sortable: true,
      sortValue: (task) => task.createdAt,
      cell: (task) => new Date(task.createdAt).toLocaleString("zh-CN"),
    },
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        className="mb-10"
        title={
          <h1 className="mb-2 text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-6xl">
            <ScrambleText text="数据库迁移平台_" scrambleDuration={1200} />
          </h1>
        }
        subtitle={"// 统一管理平台控制库升级与租户存储校准"}
        actions={
          <PlatformButton type="button" onClick={load} className="px-5 py-3" disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span className="font-bold">刷新状态</span>
          </PlatformButton>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <PlatformPanel className="space-y-6 bg-[var(--bg-elevated)]/60 p-6">
          <PlatformSectionTitle
            title="迁移参数"
            subtitle="选择升级范围，系统会先完成预检，再以后台任务执行"
          />
          <PlatformField label="迁移范围">
            <PlatformSelect
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as MigrationScope);
                setPrecheckResult(null);
              }}
            >
              <option value="platform">平台公共表</option>
              <option value="tenant">租户业务存储</option>
            </PlatformSelect>
          </PlatformField>

          {scope === "tenant" ? (
            <PlatformField label="租户">
              <PlatformSelect
                value={selectedTenantId}
                onChange={(event) => {
                  setSelectedTenantId(event.target.value);
                  setPrecheckResult(null);
                }}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.displayName} / {tenant.tenantId} / {tenant.isolationLevel}
                  </option>
                ))}
              </PlatformSelect>
            </PlatformField>
          ) : null}

          {scope === "tenant" && selectedTenant ? (
            <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <Database size={16} className="text-[var(--brand)]" />
              <span className="text-sm font-bold">{selectedTenant.displayName}</span>
              <PlatformStateBadge tone="default">{selectedTenant.isolationLevel.toUpperCase()}</PlatformStateBadge>
              <span className="text-xs text-[var(--text-muted)]">按当前存储策略校准结构</span>
            </div>
          ) : null}

          {scope === "platform" ? (
            <div className="flex items-start gap-3 border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
              <ServerCog size={18} className="mt-0.5 text-[var(--brand)]" />
              <div>
                <div className="font-sans text-sm font-bold">平台公共库</div>
                <div className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">
                  检查并升级平台控制库中尚未生效的公共表结构。
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <PlatformButton
              type="button"
              onClick={runPrecheck}
              disabled={(scope === "tenant" && !selectedTenantId) || checking}
              className="px-5 py-3"
            >
              <ShieldCheck size={16} />
              <span className="font-bold">{checking ? "预检中" : "执行预检"}</span>
            </PlatformButton>
            <PlatformButton
              type="button"
              onClick={createTask}
              disabled={!precheckResult?.passed || creating}
              className="px-5 py-3 bg-[var(--brand)] text-white border-[var(--brand)]"
            >
              <Play size={16} />
              <span className="font-bold text-white">{creating ? "创建中" : "创建迁移任务"}</span>
            </PlatformButton>
          </div>
        </PlatformPanel>

        <PlatformPanel className="space-y-6 bg-[var(--bg-elevated)]/60 p-6">
          <PlatformSectionTitle
            title="预检结果"
            subtitle="所有检查通过后才允许创建迁移任务"
          />
          {precheckResult ? (
            <div className="space-y-3">
              {precheckResult.items.map((item) => (
                <div key={item.name} className="flex gap-3 border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  {item.passed ? (
                    <CheckCircle2 size={18} className="mt-0.5 text-[var(--success)]" />
                  ) : (
                    <XCircle size={18} className="mt-0.5 text-[var(--danger)]" />
                  )}
                  <div>
                    <div className="font-sans text-sm font-bold">{item.name}</div>
                    <div className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)]">
              等待执行迁移预检
            </div>
          )}
        </PlatformPanel>
      </div>

      <DataTable
        data={tasks}
        columns={columns}
        loading={loading}
        loadingMessage="正在同步迁移任务..."
        emptyMessage="当前还没有数据库迁移任务"
        tableLabel="数据库迁移任务列表"
        searchConfig={{ placeholder: "搜索租户或任务状态..." }}
      />
    </div>
  );
}
