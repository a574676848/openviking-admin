"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Clock,
  FileText,
  FolderTree,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleControlPanel,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleIconTile,
  ConsoleIconButton,
  ConsoleInput,
  ConsoleMetricCard,
  ConsoleSurfaceCard,
  ConsoleStatsGrid,
  ConsoleStatusPanel,
  ConsoleTableShell,
} from "@/components/console/primitives";
import {
  DOCUMENT_SOURCE_ICONS,
  DOCUMENT_STATUS_MAP,
  type ImportTask,
} from "./documents.types";

type DocumentsFiltersPanelProps = {
  filter: string;
  searchQuery: string;
  selectedCount: number;
  stats: {
    done: number;
    pending: number;
  };
  onFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onBulkAction: (action: "sync" | "retry" | "cancel") => void;
};

type DocumentsTasksTableProps = {
  tasks: ImportTask[];
  selectedIds: string[];
  actingIds: string[];
  loadError: string;
  loading: boolean;
  onReload: () => void;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (taskId: string, checked: boolean) => void;
  onSync: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
};

function resolveTaskProgress(status: string) {
  if (status === "done") return 100;
  if (status === "running") return 65;
  if (status === "pending") return 20;
  if (status === "cancelled") return 0;
  return 100;
}

export function DocumentsFiltersPanel({
  filter,
  searchQuery,
  selectedCount,
  onFilterChange,
  onSearchChange,
  onBulkAction,
}: DocumentsFiltersPanelProps) {
  return (
    <ConsoleSurfaceCard className="px-3 py-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Filters & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border)]">
            {["all", "pending", "running", "done", "failed"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onFilterChange(status)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all rounded-lg ${
                  filter === status
                    ? "bg-black text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {status === "all" ? "全部" : DOCUMENT_STATUS_MAP[status]?.label ?? status}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              size={12}
              strokeWidth={3}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索 URI / KB ID"
              className="h-9 w-48 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl pl-8 pr-3 text-[10px] font-bold focus:outline-none focus:border-[var(--brand)] transition-all"
            />
          </div>
        </div>

        {/* Right: Bulk Actions */}
        <div
          className={`flex items-center gap-2 transition-all ${
            selectedCount > 0 ? "opacity-100" : "opacity-40 grayscale pointer-events-none"
          }`}
        >
          <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mr-2">
            已选 {selectedCount} 项
          </span>
          <ConsoleButton
            type="button"
            tone="neutral"
            onClick={() => onBulkAction("sync")}
            className="h-8 px-3 text-[10px] border-dashed"
          >
            <RefreshCw size={10} strokeWidth={3} className={selectedCount > 0 ? "animate-spin" : ""} />
            同步
          </ConsoleButton>
          <ConsoleButton
            type="button"
            tone="dark"
            onClick={() => onBulkAction("retry")}
            className="h-8 px-3 text-[10px]"
          >
            <RotateCcw size={10} strokeWidth={3} />
            重试
          </ConsoleButton>
          <ConsoleButton
            type="button"
            tone="danger"
            onClick={() => onBulkAction("cancel")}
            className="h-8 px-3 text-[10px]"
          >
            <Ban size={10} strokeWidth={3} />
            取消
          </ConsoleButton>
        </div>
      </div>
    </ConsoleSurfaceCard>
  );
}

export function DocumentsTasksTable({
  tasks,
  selectedIds,
  actingIds,
  loadError,
  loading,
  onReload,
  onSelectAll,
  onSelectOne,
  onSync,
  onRetry,
  onCancel,
}: DocumentsTasksTableProps) {
  return (
    <ConsoleTableShell
      columns={
        <div className="grid grid-cols-[72px_180px_minmax(0,1fr)_140px_140px_260px] divide-x divide-[var(--border)]">
          <div className="flex items-center justify-center bg-[var(--bg-elevated)] py-4">
            <input
              type="checkbox"
              aria-label="全选任务"
              checked={tasks.length > 0 && selectedIds.length === tasks.length}
              onChange={(event) => onSelectAll(event.target.checked)}
              className="h-4 w-4 accent-black"
            />
          </div>
          <div className="flex items-center px-5 py-4 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
            状态与时间
          </div>
          <div className="flex items-center px-5 py-4 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
            来源与知识映射
          </div>
          <div className="flex items-center px-5 py-4 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
            节点总数
          </div>
          <div className="flex items-center px-5 py-4 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
            向量总数
          </div>
          <div className="flex items-center justify-between px-5 py-4 font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <span>操作执行</span>
            <div className="flex items-center gap-2 text-[var(--brand)]">
              <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
              <span className="opacity-60">10S 自动刷新</span>
            </div>
          </div>
        </div>
      }
      state={loading ? "loading" : loadError ? "error" : tasks.length === 0 ? "empty" : "ready"}
      stateContent={{
        loading: <ConsoleEmptyState icon={RefreshCw} title="正在读取任务流..." description="系统正在同步导入队列，请稍候。" />,
        error: (
          <ConsoleEmptyState
            icon={AlertTriangle}
            title="导入任务加载失败"
            description={loadError}
            action={
              <ConsoleButton type="button" onClick={onReload}>
                重新加载
              </ConsoleButton>
            }
          />
        ),
        empty: <ConsoleEmptyState icon={FileText} title="暂无匹配任务" description="当前没有符合筛选条件的导入任务。" />,
      }}
    >
      {tasks.map((task) => {
        const mapped = DOCUMENT_STATUS_MAP[task.status] ?? {
          label: task.status,
          icon: Clock,
          className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
        };
        const StatusIcon = mapped.icon;
        const SourceIcon = DOCUMENT_SOURCE_ICONS[task.sourceType] ?? FileText;
        const progress = resolveTaskProgress(task.status);
        const isActing = actingIds.includes(task.id);

        return (
          <div
            key={task.id}
            className="grid gap-px bg-[var(--border)] xl:grid-cols-[72px_180px_minmax(0,1fr)_140px_140px_260px]"
          >
            <div className="flex items-center justify-center bg-[var(--bg-card)] px-5 py-5">
              <input
                type="checkbox"
                aria-label={`选择任务 ${task.id}`}
                checked={selectedIds.includes(task.id)}
                onChange={(event) => onSelectOne(task.id, event.target.checked)}
                className="h-4 w-4 accent-black"
              />
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5">
              <ConsoleBadge className={`items-center gap-2 ${mapped.className}`}>
                <StatusIcon
                  size={12}
                  strokeWidth={2.6}
                  className={task.status === "running" ? "animate-spin" : ""}
                />
                {mapped.label}
              </ConsoleBadge>
              <p className="mt-4 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  <span>阶段进度</span>
                  <span>{progress}%</span>
                </div>
                <ConsoleSurfaceCard tone="elevated" className="h-3 p-0">
                  <div className="h-full bg-black transition-all" style={{ width: `${progress}%` }} />
                </ConsoleSurfaceCard>
              </div>
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5">
              <div className="flex items-start gap-3">
                <ConsoleIconTile>
                  <SourceIcon size={16} strokeWidth={2.6} />
                </ConsoleIconTile>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-black text-[var(--text-primary)]" title={task.sourceUrl}>
                    {task.sourceUrl || "stream://stdin"}
                  </p>
                  <p className="mt-2 truncate font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand)]">
                    {task.targetUri}
                  </p>
                  <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    KB: {task.kbId}
                  </p>
                  {task.errorMsg ? (
                    <p className="mt-3 font-mono text-[10px] font-bold text-[var(--danger)]">{task.errorMsg}</p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5">
              <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                节点数
              </p>
              <div className="mt-2 font-mono text-4xl font-black tabular-nums text-[var(--text-primary)]">
                {task.nodeCount ?? 0}
              </div>
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5">
              <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                向量数
              </p>
              <div className="mt-2 font-mono text-4xl font-black tabular-nums text-[var(--brand)]">
                {(task.vectorCount ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5">
              <div className="flex flex-wrap gap-3">
                <ConsoleIconButton
                  type="button"
                  onClick={() => onSync(task.id)}
                  tone="warning"
                  title="同步状态"
                  aria-label="同步状态"
                  disabled={isActing}
                >
                  <RefreshCw size={14} strokeWidth={2.6} />
                </ConsoleIconButton>
                {task.status === "failed" || task.status === "cancelled" ? (
                  <ConsoleButton
                    type="button"
                    tone="dark"
                    onClick={() => onRetry(task.id)}
                    disabled={isActing}
                    className="h-11 px-4 tracking-[0.16em]"
                  >
                    <RotateCcw size={14} strokeWidth={2.6} />
                    重试
                  </ConsoleButton>
                ) : null}
                {task.status === "pending" ? (
                  <ConsoleButton
                    type="button"
                    tone="danger"
                    onClick={() => onCancel(task.id)}
                    disabled={isActing}
                    className="h-11 px-4 tracking-[0.16em]"
                  >
                    <Ban size={14} strokeWidth={2.6} />
                    取消
                  </ConsoleButton>
                ) : null}
                <Link href={`/console/knowledge-tree?kbId=${task.kbId}`}>
                  <ConsoleButton type="button" tone="neutral" className="h-11 px-4 tracking-[0.16em]">
                    <FolderTree size={14} strokeWidth={2.6} />
                    查看树
                  </ConsoleButton>
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </ConsoleTableShell>
  );
}
