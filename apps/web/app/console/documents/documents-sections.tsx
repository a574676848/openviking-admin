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
  stats,
  onFilterChange,
  onSearchChange,
  onBulkAction,
}: DocumentsFiltersPanelProps) {
  return (
    <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.9fr_1.1fr]">
      <ConsoleControlPanel
        eyebrow="任务队列"
        title="按状态与 URI 收紧任务流"
        footer={
          <ConsoleStatsGrid className="grid-cols-2">
            <ConsoleMetricCard label="已完成" value={stats.done.toLocaleString()} tone="success" />
            <ConsoleMetricCard label="排队中" value={stats.pending.toLocaleString()} />
          </ConsoleStatsGrid>
        }
      >
        <div className="flex flex-wrap gap-3">
          {["all", "pending", "running", "done", "failed"].map((status) => (
            <ConsoleButton
              key={status}
              type="button"
              onClick={() => onFilterChange(status)}
              tone={filter === status ? "dark" : "neutral"}
              className="px-4 py-3 tracking-[0.16em]"
            >
              {status === "all" ? "全部" : DOCUMENT_STATUS_MAP[status]?.label ?? status}
            </ConsoleButton>
          ))}
        </div>

        <div className="mt-6">
          <ConsoleField label="搜索任务">
            <div className="relative mt-2">
              <Search
                size={16}
                strokeWidth={2.6}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <ConsoleInput
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索来源地址、目标 URI 或知识库 ID"
                className="py-3 pl-11 pr-4"
              />
            </div>
          </ConsoleField>
        </div>
      </ConsoleControlPanel>

      <ConsoleStatusPanel
        icon={RefreshCw}
        title="任务闭环"
        description="支持单条同步、失败重试、排队取消与批量操作。运行中的任务会持续刷新，但当前版本不支持中途停止。"
        action={
          <div className="flex flex-wrap gap-3">
            <ConsoleButton type="button" tone="neutral" onClick={() => onBulkAction("sync")} disabled={selectedCount === 0}>
              <RefreshCw size={14} strokeWidth={2.6} />
              批量同步
            </ConsoleButton>
            <ConsoleButton type="button" tone="dark" onClick={() => onBulkAction("retry")} disabled={selectedCount === 0}>
              <RotateCcw size={14} strokeWidth={2.6} />
              批量重试
            </ConsoleButton>
            <ConsoleButton type="button" tone="danger" onClick={() => onBulkAction("cancel")} disabled={selectedCount === 0}>
              <Ban size={14} strokeWidth={2.6} />
              批量取消
            </ConsoleButton>
          </div>
        }
      />
    </section>
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
        <div className="grid grid-cols-[72px_minmax(0,1fr)_160px]">
          <div className="flex items-center justify-center bg-[var(--bg-card)] px-5 py-4">
            <input
              type="checkbox"
              aria-label="全选任务"
              checked={tasks.length > 0 && selectedIds.length === tasks.length}
              onChange={(event) => onSelectAll(event.target.checked)}
              className="h-4 w-4 accent-black"
            />
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            导入任务
          </div>
          <div className="px-5 py-4 text-right font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            已选择 {selectedIds.length} / 每 10 秒自动刷新
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
            <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-3xl font-black tabular-nums text-[var(--text-primary)]">
              {task.nodeCount ?? 0}
            </div>
            <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-3xl font-black tabular-nums text-[var(--brand)]">
              {(task.vectorCount ?? 0).toLocaleString()}
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
