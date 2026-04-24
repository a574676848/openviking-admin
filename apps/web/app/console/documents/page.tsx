"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FolderTree,
  GitBranch,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleControlPanel,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleIconButton,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleStatsGrid,
  ConsoleTableShell,
} from "@/components/console/primitives";

interface ImportTask {
  id: string;
  kbId: string;
  sourceType: string;
  sourceUrl: string;
  targetUri: string;
  status: string;
  nodeCount: number;
  vectorCount: number;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP: Record<
  string,
  {
    label: string;
    icon: typeof Clock;
    className: string;
  }
> = {
  pending: { label: "等待处理", icon: Clock, className: "bg-[var(--bg-card)] text-[var(--text-primary)]" },
  running: { label: "处理中", icon: Loader2, className: "bg-[var(--warning)] text-black" },
  done: { label: "成功", icon: CheckCircle2, className: "bg-[var(--success)] text-white" },
  failed: { label: "失败", icon: AlertTriangle, className: "bg-[var(--danger)] text-white" },
};

const SOURCE_ICONS: Record<string, typeof FileText> = {
  git: GitBranch,
  webdav: ServerCog,
  url: Globe,
  local: FileText,
};

export default function DocumentsPage() {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const response = await apiClient.get<ImportTask[]>("/import-tasks");
      setTasks(Array.isArray(response) ? response : []);
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
      vectors: tasks.reduce((sum, task) => sum + (task.vectorCount ?? 0), 0),
    };
  }, [tasks]);

  async function handleSync(id: string) {
    toast.promise(apiClient.get(`/import-tasks/${id}/sync`), {
      loading: "正在同步底层任务状态...",
      success: async () => {
        await fetchTasks();
        return "同步完成";
      },
      error: "同步失败",
    });
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="文档处理中心"
        subtitle="Ingestion Pipeline / Task Terminal"
        actions={
          <Link href="/console/documents/import">
            <ConsoleButton type="button">
              <Plus size={14} strokeWidth={2.6} />
              新建导入任务
            </ConsoleButton>
          </Link>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="All Tasks" value={tasks.length.toLocaleString()} />
        <ConsoleMetricCard label="Running" value={stats.running.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="Failed" value={stats.failed.toLocaleString()} tone="danger" />
        <ConsoleMetricCard label="Vectors" value={stats.vectors.toLocaleString()} tone="brand" />
      </ConsoleStatsGrid>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <ConsoleControlPanel
          eyebrow="Queue Control"
          title="按状态与 URI 收紧任务流"
          footer={
            <ConsoleStatsGrid className="grid-cols-2">
              <ConsoleMetricCard label="Completed" value={stats.done.toLocaleString()} tone="success" />
              <ConsoleMetricCard label="Visible Rows" value={filteredTasks.length.toLocaleString()} />
            </ConsoleStatsGrid>
          }
        >
          <div className="flex flex-wrap gap-3">
            {["all", "pending", "running", "done", "failed"].map((status) => (
              <ConsoleButton
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                tone={filter === status ? "dark" : "neutral"}
                className="px-4 py-3 tracking-[0.16em]"
              >
                {status === "all" ? "全部" : STATUS_MAP[status]?.label ?? status}
              </ConsoleButton>
            ))}
          </div>

          <div className="mt-6">
            <ConsoleField label="Search Task">
            <div className="relative mt-2">
              <Search
                size={16}
                strokeWidth={2.6}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <ConsoleInput
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索来源地址、目标 URI 或知识库 ID"
                className="py-3 pl-11 pr-4"
              />
            </div>
            </ConsoleField>
          </div>
        </ConsoleControlPanel>

        <ConsoleTableShell
          columns={
            <div className="grid grid-cols-[minmax(0,1fr)_140px]">
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Ingestion Jobs
            </div>
            <div className="px-5 py-4 text-right font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Auto Refresh 10s
            </div>
            </div>
          }
          isLoading={loading}
          hasData={filteredTasks.length > 0}
          loadingState={<ConsoleEmptyState icon={RefreshCw} title="正在读取任务流..." description="loading ingestion queue" />}
          emptyState={<ConsoleEmptyState icon={FileText} title="暂无匹配任务" description="queue is empty or filtered out" />}
        >
          {filteredTasks.map((task) => {
                const mapped = STATUS_MAP[task.status] ?? {
                  label: task.status,
                  icon: Clock,
                  className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
                };
                const StatusIcon = mapped.icon;
                const SourceIcon = SOURCE_ICONS[task.sourceType] ?? FileText;

                return (
                  <div
                    key={task.id}
                    className="grid gap-px bg-[var(--border)] xl:grid-cols-[180px_minmax(0,1fr)_130px_130px_180px]"
                  >
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
                    </div>
                    <div className="bg-[var(--bg-card)] px-5 py-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
                          <SourceIcon size={16} strokeWidth={2.6} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-black text-[var(--text-primary)]" title={task.sourceUrl}>
                            {task.sourceUrl || "stream://stdin"}
                          </p>
                          <p className="mt-2 truncate font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand)]">
                            {task.targetUri}
                          </p>
                          {task.errorMsg && (
                            <p className="mt-3 font-mono text-[10px] font-bold text-[var(--danger)]">{task.errorMsg}</p>
                          )}
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
                      <div className="flex gap-3">
                        <ConsoleIconButton
                          type="button"
                          onClick={() => void handleSync(task.id)}
                          tone="warning"
                          title="同步状态"
                        >
                          <RefreshCw size={14} strokeWidth={2.6} />
                        </ConsoleIconButton>
                        <Link href={`/console/knowledge-tree?kbId=${task.kbId}`}>
                          <ConsoleButton type="button" tone="dark" className="h-11 px-4 tracking-[0.16em]">
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
      </section>
    </div>
  );
}
