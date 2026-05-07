"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  Clock,
  Copy,
  FileText,
  FolderTree,
  RefreshCw,
  RotateCcw,
  Search,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import {
  PlatformButton,
  PlatformPanel,
  PlatformStateBadge,
} from "@/components/ui/platform-primitives";
import { cx } from "@/components/console/shared";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import {
  canCancelDocumentTask,
  canRetryDocumentTask,
  canSyncDocumentTask,
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
  refreshInterval: number;
  onFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onBulkAction: (action: "sync" | "retry" | "cancel") => void;
  onRefreshIntervalChange: (interval: number) => void;
};

type DocumentsTasksTableProps = {
  tasks: ImportTask[];
  selectedIds: string[];
  actingIds: string[];
  loadError: string;
  loading: boolean;
  refreshInterval: number;
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
  return 0;
}

export function DocumentsFiltersPanel({
  filter,
  searchQuery,
  selectedCount,
  refreshInterval,
  onFilterChange,
  onSearchChange,
  onBulkAction,
  onRefreshIntervalChange,
}: DocumentsFiltersPanelProps) {
  return (
    <PlatformPanel className="px-4 py-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Filters & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border)]">
            {["all", "pending", "running", "done", "failed"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onFilterChange(status)}
                className={`px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wider transition-all rounded-lg ${
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
              size={14}
              strokeWidth={2.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索 URI / KB ID"
              className="h-9 w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius-pill)] pl-9 pr-3 text-xs font-sans font-medium focus:outline-none focus:border-[var(--brand)] transition-all"
            />
          </div>

          <div className="flex items-center gap-2 bg-[var(--bg-elevated)] px-3 py-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] h-9">
            <Timer size={14} className={refreshInterval > 0 ? "text-[var(--brand)] animate-pulse" : "text-[var(--text-muted)]"} />
            <select
              value={refreshInterval}
              onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
              className="bg-transparent border-none text-xs font-sans font-medium focus:outline-none cursor-pointer appearance-none pr-4"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right center', backgroundSize: '10px' }}
            >
              <option value="0">手动刷新</option>
              <option value="10">10S 刷新</option>
              <option value="30">30S 刷新</option>
              <option value="60">60S 刷新</option>
            </select>
          </div>
        </div>

        {/* Right: Bulk Actions */}
        <div
          className={`flex items-center gap-3 transition-all ${
            selectedCount > 0 ? "opacity-100" : "opacity-40 grayscale pointer-events-none"
          }`}
        >
          <span className="font-sans text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mr-2">
            已选 {selectedCount} 项
          </span>
          <PlatformButton
            type="button"
            onClick={() => onBulkAction("sync")}
            className="h-8 px-3"
          >
            <RefreshCw size={14} strokeWidth={2.2} className={selectedCount > 0 ? "animate-spin" : ""} />
            同步
          </PlatformButton>
          <PlatformButton
            type="button"
            onClick={() => onBulkAction("retry")}
            className="h-8 px-3"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            重试
          </PlatformButton>
          <PlatformButton
            type="button"
            tone="danger"
            onClick={() => onBulkAction("cancel")}
            className="h-8 px-3"
          >
            <Ban size={14} strokeWidth={2.2} />
            取消
          </PlatformButton>
        </div>
      </div>
    </PlatformPanel>
  );
}

function FailureReason({ reason }: { reason?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!reason) return <span className="text-[var(--text-muted)] text-xs font-sans italic">无异常</span>;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(reason);
    toast.success("错误信息已复制");
  };

  return (
    <div 
      className={cx(
        "group relative overflow-hidden transition-all duration-300 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-md p-2 cursor-pointer",
        expanded ? "max-h-[300px] overflow-y-auto" : "max-h-[60px]"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cx(
          "font-sans text-xs leading-relaxed text-[var(--danger)]",
          !expanded && "line-clamp-2"
        )}>
          {reason}
        </p>
        <button 
          onClick={handleCopy}
          className="shrink-0 p-1 rounded-md hover:bg-[var(--danger)]/10 text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity"
          title="复制错误信息"
        >
          <Copy size={10} />
        </button>
      </div>
      {!expanded && reason.length > 60 && (
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[var(--bg-card)]/10 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

function SourceMappingCell({
  sourceType,
  sourceUrl,
  targetUri,
  kbId,
}: {
  sourceType: string;
  sourceUrl?: string;
  targetUri?: string;
  kbId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const SourceIcon = DOCUMENT_SOURCE_ICONS[sourceType] ?? FileText;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(`Source: ${sourceUrl || ""}\nTarget: ${targetUri || ""}\nKB ID: ${kbId || ""}`);
    toast.success("资源映射信息已复制");
  };

  return (
    <div 
      className={cx(
        "group relative overflow-hidden transition-all duration-300 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md p-2 cursor-pointer w-full",
        expanded ? "max-h-[300px] overflow-y-auto" : "max-h-[60px]"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] rounded-md bg-[var(--bg-card)] text-[var(--text-secondary)]">
          <SourceIcon size={14} strokeWidth={2.6} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cx(
              "font-sans text-sm font-bold text-[var(--text-primary)]",
              !expanded && "truncate"
            )} title={sourceUrl}>
              {sourceUrl || "stream://stdin"}
            </p>
            <button 
              onClick={handleCopy}
              className="shrink-0 p-1 rounded-md hover:bg-[var(--text-muted)]/10 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
              title="复制信息"
            >
              <Copy size={10} />
            </button>
          </div>
          <p className={cx(
            "mt-1 font-sans text-xs font-medium text-[var(--text-muted)]",
            !expanded && "truncate"
          )}>
            {targetUri}
          </p>
          <p className="mt-0.5 font-sans text-[10px] font-medium text-[var(--text-muted)]">
            ID: {kbId}
          </p>
        </div>
      </div>
      {!expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent pointer-events-none" />
      )}
    </div>
  );
}

export function DocumentsTasksTable({
  tasks,
  selectedIds,
  actingIds,
  loadError,
  loading,
  refreshInterval,
  onReload,
  onSelectAll,
  onSelectOne,
  onSync,
  onRetry,
  onCancel,
}: DocumentsTasksTableProps) {
  const columns = useMemo<ColumnDef<ImportTask>[]>(() => [
    {
      key: "selection",
      header: "",
      headerClassName: "w-[48px] text-center",
      cellClassName: "w-[48px] text-center",
      cell: (task) => (
        <input
          type="checkbox"
          aria-label={`选择任务 ${task.id}`}
          checked={selectedIds.includes(task.id)}
          onChange={(event) => onSelectOne(task.id, event.target.checked)}
          className="h-4 w-4 accent-black"
        />
      ),
    },
    {
      key: "status",
      header: "任务状态",
      headerClassName: "w-[100px] whitespace-nowrap",
      cellClassName: "w-[100px]",
      sortable: true,
      sortValue: (task) => task.status,
      cell: (task) => {
        const mapped = DOCUMENT_STATUS_MAP[task.status] ?? {
          label: task.status,
          icon: Clock,
        };
        const toneMap: Record<string, "success" | "danger" | "warning" | "default" | "muted"> = {
          done: "success",
          failed: "danger",
          running: "warning",
          pending: "default",
          cancelled: "muted",
        };
        return (
          <PlatformStateBadge tone={toneMap[task.status] ?? "default"}>
            {mapped.label}
          </PlatformStateBadge>
        );
      },
    },
    {
      key: "progress",
      header: "任务进度",
      headerClassName: "w-[100px] whitespace-nowrap",
      cellClassName: "w-[100px]",
      sortable: true,
      sortValue: (task) => resolveTaskProgress(task.status),
      cell: (task) => {
        const progress = resolveTaskProgress(task.status);
        return (
          <div className="w-full">
            <div className="flex items-center justify-between font-sans text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden border border-[var(--border)]">
              <div 
                className="h-full transition-all duration-700 bg-[var(--brand)]"
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "创建时间",
      headerClassName: "w-[120px] whitespace-nowrap",
      cellClassName: "w-[120px]",
      sortable: true,
      sortValue: (task) => task.createdAt,
      cell: (task) => (
        <span className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
          {new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      ),
    },
    {
      key: "source",
      header: "来源与知识映射",
      cellClassName: "max-w-[100px]",
      cell: (task) => (
        <SourceMappingCell 
          sourceType={task.sourceType}
          sourceUrl={task.sourceUrl}
          targetUri={task.targetUri}
          kbId={task.kbId}
        />
      ),
    },
    {
      key: "error",
      header: "失败原因",
      cellClassName: "max-w-[100px]",
      cell: (task) => (
        <div className="w-full">
          <FailureReason reason={task.errorMsg ?? undefined} />
        </div>
      ),
    },
    {
      key: "nodeCount",
      header: "节点数",
      sortable: true,
      sortValue: (task) => task.nodeCount ?? 0,
      headerClassName: "w-[70px] text-center whitespace-nowrap",
      cellClassName: "w-[70px] text-center",
      cell: (task) => (
        <div className="font-sans text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {task.nodeCount ?? 0}
        </div>
      ),
    },
    {
      key: "vectorCount",
      header: "向量数",
      sortable: true,
      sortValue: (task) => task.vectorCount ?? 0,
      headerClassName: "w-[90px] text-center whitespace-nowrap",
      cellClassName: "w-[90px] text-center",
      cell: (task) => (
        <div className="font-sans text-sm font-bold tabular-nums text-[var(--brand)]">
          {(task.vectorCount ?? 0).toLocaleString()}
        </div>
      ),
    },
    {
      key: "actions",
      header: "操作执行",
      headerClassName: "w-[180px] text-right pr-5 whitespace-nowrap",
      cellClassName: "w-[180px] text-right pr-5",
      cell: (task) => {
        const isActing = actingIds.includes(task.id);
        const canSync = canSyncDocumentTask(task);
        const canRetry = canRetryDocumentTask(task);
        const canCancel = canCancelDocumentTask(task);
        return (
          <div className="flex items-center justify-end flex-nowrap gap-2">
            <PlatformButton
              type="button"
              tone="brand"
              onClick={() => onSync(task.id)}
              disabled={isActing || !canSync}
              className="h-9 px-3 whitespace-nowrap min-w-fit"
            >
              <RefreshCw size={14} strokeWidth={2.2} className={isActing ? "animate-spin" : ""} />
              同步
            </PlatformButton>
            
            <PlatformButton
              type="button"
              tone="warning"
              onClick={() => onRetry(task.id)}
              disabled={isActing || !canRetry}
              className="h-9 px-3 whitespace-nowrap min-w-fit"
            >
              <RotateCcw size={14} strokeWidth={2.2} />
              重试
            </PlatformButton>

            <PlatformButton
              type="button"
              tone="danger"
              onClick={() => onCancel(task.id)}
              disabled={isActing || !canCancel}
              className="h-9 px-3 whitespace-nowrap min-w-fit"
            >
              <Ban size={14} strokeWidth={2.2} />
              取消
            </PlatformButton>
          </div>
        );
      },
    },
  ], [selectedIds, actingIds, onSelectOne, onSync, onRetry, onCancel]);

  return (
    <div className="relative">
      <DataTable
        data={tasks}
        columns={columns}
        loading={loading}
        loadingMessage="正在读取任务流..."
        errorMessage={loadError}
        emptyMessage="当前没有符合筛选条件的导入任务。"
        tableLabel="文档导入任务列表"
        className="flex-1"
      />
    </div>
  );
}
