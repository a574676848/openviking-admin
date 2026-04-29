"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  ConsoleButton,
  ConsolePageHeader,
  ConsoleSurfaceCard,
} from "@/components/console/primitives";
import { DocumentsFiltersPanel, DocumentsTasksTable } from "./documents-sections";
import type { ImportTask } from "./documents.types";

export default function DocumentsPage() {
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actingIds, setActingIds] = useState<string[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoadError("");
    try {
      const response = await apiClient.get<ImportTask[]>("/import-tasks");
      setTasks(Array.isArray(response) ? response : []);
    } catch (error: unknown) {
      setTasks([]);
      setLoadError(error instanceof Error ? error.message : "导入任务加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    const timer = window.setInterval(fetchTasks, 10000);
    return () => {
      window.clearInterval(timer);
    };
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      if (filter !== "all" && task.status !== filter) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      return (
        task.sourceUrl?.toLowerCase().includes(keyword) ||
        task.targetUri?.toLowerCase().includes(keyword) ||
        task.kbId?.toLowerCase().includes(keyword)
      );
    });
  }, [filter, searchQuery, tasks]);

  const stats = useMemo(() => {
    return {
      done: tasks.filter((task) => task.status === "done").length,
      running: tasks.filter((task) => task.status === "running").length,
      failed: tasks.filter((task) => task.status === "failed").length,
      pending: tasks.filter((task) => task.status === "pending").length,
      vectors: tasks.reduce((sum, task) => sum + (task.vectorCount ?? 0), 0),
    };
  }, [tasks]);

  const selectedTasks = useMemo(
    () => filteredTasks.filter((task) => selectedIds.includes(task.id)),
    [filteredTasks, selectedIds],
  );

  async function runTaskAction(id: string, request: () => Promise<unknown>, messages: { loading: string; success: string; error: string }) {
    setActingIds((current) => [...current, id]);
    await toast.promise(request(), {
      loading: messages.loading,
      success: async () => {
        await fetchTasks();
        return messages.success;
      },
      error: (error: unknown) => (error instanceof Error ? error.message : messages.error),
    });
    setActingIds((current) => current.filter((taskId) => taskId !== id));
  }

  async function handleSync(id: string) {
    await runTaskAction(id, () => apiClient.get(`/import-tasks/${id}/sync`), {
      loading: "正在同步底层任务状态...",
      success: "同步完成",
      error: "同步失败",
    });
  }

  async function handleRetry(id: string) {
    await runTaskAction(id, () => apiClient.post(`/import-tasks/${id}/retry`, {}), {
      loading: "正在重试失败任务...",
      success: "任务已重新排队",
      error: "重试失败",
    });
  }

  async function handleCancel(id: string) {
    const approved = await confirm({
      title: "取消排队任务",
      description: "该任务会退出当前队列，但不会删除已有导入结果。",
      confirmText: "确认取消",
      cancelText: "继续保留",
      tone: "danger",
    });
    if (!approved) {
      return;
    }

    await runTaskAction(id, () => apiClient.post(`/import-tasks/${id}/cancel`, {}), {
      loading: "正在取消排队任务...",
      success: "任务已取消",
      error: "取消失败",
    });
  }

  async function handleBulkAction(action: "sync" | "retry" | "cancel") {
    const actionableTasks = selectedTasks.filter((task) => {
      if (action === "retry") return ["failed", "cancelled"].includes(task.status);
      if (action === "cancel") return task.status === "pending";
      return true;
    });

    if (actionableTasks.length === 0) {
      toast.error(action === "retry" ? "所选任务中没有可重试项" : action === "cancel" ? "所选任务中没有可取消项" : "请先选择任务");
      return;
    }

    if (action === "cancel") {
      const approved = await confirm({
        title: "批量取消排队任务",
        description: `将取消 ${actionableTasks.length} 个排队任务。该操作不会删除已经写入的知识内容。`,
        confirmText: "确认取消",
        cancelText: "返回",
        tone: "danger",
      });
      if (!approved) {
        return;
      }
    }

    setActingIds((current) => [...current, ...actionableTasks.map((task) => task.id)]);
    try {
      await Promise.all(
        actionableTasks.map((task) => {
          if (action === "retry") {
            return apiClient.post(`/import-tasks/${task.id}/retry`, {});
          }
          if (action === "cancel") {
            return apiClient.post(`/import-tasks/${task.id}/cancel`, {});
          }
          return apiClient.get(`/import-tasks/${task.id}/sync`);
        }),
      );
      toast.success(
        action === "retry"
          ? `已重试 ${actionableTasks.length} 个任务`
          : action === "cancel"
            ? `已取消 ${actionableTasks.length} 个任务`
            : `已同步 ${actionableTasks.length} 个任务`,
      );
      setSelectedIds([]);
      await fetchTasks();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "批量操作失败");
    } finally {
      setActingIds((current) => current.filter((taskId) => !actionableTasks.some((task) => task.id === taskId)));
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-1">
      {/* Bento Row 1: Header (Full Width) */}
      <ConsoleSurfaceCard>
        <ConsolePageHeader
          title="文档处理中心"
          subtitle="统一查看导入任务、同步状态与知识树去向"
          className="border-none pb-0"
          actions={
            <Link href="/console/documents/import">
              <ConsoleButton type="button">
                <Plus size={14} strokeWidth={2.6} />
                新建导入任务
              </ConsoleButton>
            </Link>
          }
        />
      </ConsoleSurfaceCard>

      {/* Bento Row 2: Core Metrics Dashboard (Full Width) */}
      <div className="grid grid-cols-2 gap-1 lg:grid-cols-4">
        <ConsoleSurfaceCard className="flex flex-col justify-between">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            全部任务
          </p>
          <div className="mt-4 font-mono text-5xl font-black tabular-nums text-[var(--text-primary)]">
            {tasks.length.toLocaleString()}
          </div>
        </ConsoleSurfaceCard>
        <ConsoleSurfaceCard className="flex flex-col justify-between" tone="elevated">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            处理中
          </p>
          <div className="mt-4 font-mono text-5xl font-black tabular-nums text-[var(--warning)]">
            {stats.running.toLocaleString()}
          </div>
        </ConsoleSurfaceCard>
        <ConsoleSurfaceCard className="flex flex-col justify-between">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            失败任务
          </p>
          <div className="mt-4 font-mono text-5xl font-black tabular-nums text-[var(--danger)]">
            {stats.failed.toLocaleString()}
          </div>
        </ConsoleSurfaceCard>
        <ConsoleSurfaceCard className="flex flex-col justify-between">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            累计向量
          </p>
          <div className="mt-4 font-mono text-5xl font-black tabular-nums text-[var(--brand)]">
            {stats.vectors.toLocaleString()}
          </div>
        </ConsoleSurfaceCard>
      </div>

      {/* Bento Row 3: Filters & Actions (Full Width) */}
      <DocumentsFiltersPanel
        filter={filter}
        searchQuery={searchQuery}
        selectedCount={selectedIds.length}
        onFilterChange={setFilter}
        onSearchChange={setSearchQuery}
        onBulkAction={(action) => void handleBulkAction(action)}
      />

      {/* Bento Row 4: Main Data Table */}
      <div className="mt-0">
        <DocumentsTasksTable
          tasks={filteredTasks}
          selectedIds={selectedIds}
          actingIds={actingIds}
          loadError={loadError}
          loading={loading}
          onReload={() => void fetchTasks()}
          onSelectAll={(checked) => setSelectedIds(checked ? filteredTasks.map((t) => t.id) : [])}
          onSelectOne={(taskId, checked) =>
            setSelectedIds((current) =>
              checked ? [...current, taskId] : current.filter((item) => item !== taskId),
            )
          }
          onSync={(id) => void handleSync(id)}
          onRetry={(id) => void handleRetry(id)}
          onCancel={(id) => void handleCancel(id)}
        />
      </div>
    </div>
  );
}
