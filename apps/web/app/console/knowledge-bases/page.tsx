"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Database,
  FolderTree,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { FormModal } from "@/components/ui/FormModal";
import { buildKnowledgeSiteHomeRoute } from "../knowledge-tree/knowledge-tree.constants";
import {
  KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE,
  openKnowledgeSiteInNewTab,
} from "@/lib/knowledge-site-launch";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleListRow,
  ConsoleStatsGrid,
  ConsoleTableShell,
  resolveConsoleTableState,
} from "@/components/console/primitives";

type KnowledgeBaseStatus = "active" | "building" | "archived";

interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
  status: KnowledgeBaseStatus;
  vikingUri: string;
  docCount: number;
  vectorCount: number;
  createdBy?: ActorInfo | null;
  updatedBy?: ActorInfo | null;
  createdAt: string;
}

interface ActorInfo {
  id: string | null;
  username: string | null;
}

interface DashboardSnapshot {
  kbCount?: number;
  quota?: Record<string, unknown> | null;
}

interface PageResult {
  items: KnowledgeBase[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: "运行中", className: "bg-[var(--success)] text-white" },
  building: { label: "构建中", className: "bg-[var(--warning)] text-black" },
  archived: { label: "已归档", className: "bg-[var(--text-muted)] text-white" },
};

const ARCHIVED_STATUS: KnowledgeBaseStatus = "archived";
const TABLE_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_120px_110px_110px_minmax(160px,1fr)_180px]";

function actorName(actor?: ActorInfo | null) {
  return actor?.username || actor?.id || "—";
}

function KnowledgeBaseActionMenu({
  disabled,
  onRename,
  onArchive,
  kbId,
}: {
  disabled: boolean;
  onRename: () => void;
  onArchive: () => void;
  kbId: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleWindowClick = () => {
      setOpen(false);
    };

    window.addEventListener("click", handleWindowClick);
    return () => {
      window.removeEventListener("click", handleWindowClick);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
        aria-label="更多操作"
        title="更多操作"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2.4} />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-10 min-w-[168px] rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-hover)]">
          <Link
            href={`/console/knowledge-tree?kbId=${encodeURIComponent(kbId)}`}
            className="flex w-full items-center gap-2 rounded-[calc(var(--radius-base)-4px)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            onClick={() => setOpen(false)}
          >
            <FolderTree size={14} strokeWidth={2.4} />
            查看知识树
          </Link>
          <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-2 rounded-[calc(var(--radius-base)-4px)] px-3 py-2 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <PencilLine size={14} strokeWidth={2.4} />
            重命名知识库
          </button>
          <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-2 rounded-[calc(var(--radius-base)-4px)] px-3 py-2 text-left text-sm font-bold text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
          >
            归档知识库
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 根据占用比例返回对应的色调 */
function usageTone(percent: number): "brand" | "warning" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "brand";
}

/** 配额进度卡片 — 符合 Playful Engineering 设计语言 */
function QuotaProgressCard({ used, total, percent }: { used: number; total: number; percent: number }) {
  const tone = usageTone(percent);
  const fillColor =
    tone === "danger"
      ? "bg-[var(--danger)]"
      : tone === "warning"
        ? "bg-[var(--warning)]"
        : "bg-[var(--brand)]";

  return (
    <div className="rounded-[var(--radius-base)] border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-6">
      {/* 顶部：大数字 + 百分比方块 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
            已使用 / 总量
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-sans text-5xl font-black tabular-nums leading-none text-[var(--text-primary)]">
              {used.toLocaleString()}
            </span>
            <span className="font-sans text-sm font-bold text-[var(--text-muted)]">
              / {total.toLocaleString()}
            </span>
          </div>
        </div>
        <div
          className="flex h-10 items-center justify-center rounded-full px-5 text-black"
        >
          <span className="font-sans text-sm font-black tabular-nums text-[var(--text-primary)]">{percent}%</span>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-6">
        <div className="relative h-3 border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-[2px]">
          <div
            className={`h-full transition-all duration-700 ease-out ${fillColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {/* 分段色标 */}
      <div className="mt-4 flex items-center gap-5">
        {[
          { label: "充足", color: "bg-[var(--brand)]", active: percent < 70 },
          { label: "紧张", color: "bg-[var(--warning)]", active: percent >= 70 && percent < 90 },
          { label: "耗尽", color: "bg-[var(--danger)]", active: percent >= 90 },
        ].map((seg) => (
          <span
            key={seg.label}
            className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] ${
              seg.active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
            }`}
          >
            <span className={`inline-block h-2.5 w-2.5 border-2 border-[var(--border)] ${seg.color}`} />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function KnowledgeBasesPage() {
  const confirm = useConfirm();
  const [pageResult, setPageResult] = useState<PageResult | null>(null);
  const [quota, setQuota] = useState({ used: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<KnowledgeBase | null>(null);
  const [renameName, setRenameName] = useState("");

  const PAGE_SIZE = 6;

  const load = useCallback(async (targetPage: number) => {
    const params = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(PAGE_SIZE),
    });
    const keyword = searchQuery.trim();
    if (keyword) {
      params.set("q", keyword);
    }

    const [kbData, dashboard] = await Promise.all([
      apiClient.get<PageResult>(`/knowledge-bases/paged?${params.toString()}`),
      apiClient.get<DashboardSnapshot>("/system/dashboard"),
    ]);

    setPageResult(kbData);
    setPage(targetPage);

    const used = dashboard.kbCount ?? kbData.total;
    const maxDocs = (dashboard.quota as Record<string, number> | undefined)?.maxDocs ?? 0;
    setQuota({
      used,
      total: maxDocs > 0 ? maxDocs : 0,
    });
  }, [searchQuery]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await load(1);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [load]);

  const items = pageResult?.items ?? [];
  const totalPages = pageResult?.pages ?? 1;
  const totalItems = pageResult?.total ?? 0;

  const totals = useMemo(() => {
    return items.reduce(
      (accumulator, item) => {
        accumulator.docs += item.docCount ?? 0;
        accumulator.vectors += item.vectorCount ?? 0;
        return accumulator;
      },
      { docs: 0, vectors: 0 },
    );
  }, [items]);

  const usagePercent = quota.total > 0 ? Math.min(Math.round((quota.used / quota.total) * 100), 100) : 0;
  const tableState = resolveConsoleTableState({
    loading,
    hasData: items.length > 0,
  });

  async function handleArchive(item: KnowledgeBase) {
    const approved = await confirm({
      title: "归档知识库",
      description: `归档后「${item.name}」会从列表、能力入口和 WebDAV 目录中隐藏。`,
      confirmText: "归档",
      cancelText: "保留",
      tone: "warning",
    });

    if (!approved) {
      return;
    }

    setMutatingId(item.id);
    try {
      await apiClient.patch(`/knowledge-bases/${item.id}`, {
        status: ARCHIVED_STATUS,
      });
      toast.success("知识库已归档");
      await load(page);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "知识库状态更新失败");
    } finally {
      setMutatingId(null);
    }
  }

  async function handleRenameSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!renameTarget) {
      return;
    }

    const nextName = renameName.trim();
    if (!nextName) {
      toast.error("请输入新的知识库名称");
      return;
    }

    setMutatingId(renameTarget.id);
    try {
      await apiClient.patch(`/knowledge-bases/${renameTarget.id}`, {
        name: nextName,
      });
      toast.success("知识库名称已更新");
      await load(page);
      setRenameTarget(null);
      setRenameName("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "知识库重命名失败");
    } finally {
      setMutatingId(null);
    }
  }

  function handleEnterSite(kbId: string) {
    const opened = openKnowledgeSiteInNewTab(buildKnowledgeSiteHomeRoute(kbId));
    if (!opened) {
      toast.error(KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="知识库管理"
        subtitle="统一管理租户知识库、容量使用与知识树入口"
        actions={
          <Link href="/console/knowledge-bases/new">
            <ConsoleButton type="button">
              <Plus size={14} strokeWidth={2.6} />
              新建知识库
            </ConsoleButton>
          </Link>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="知识库数量" value={(totalItems || 0).toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="文档数" value={totals.docs.toLocaleString()} />
        <ConsoleMetricCard label="向量数" value={totals.vectors.toLocaleString()} tone="warning" />
        <ConsoleMetricCard
          label="配额占用"
          value={
            quota.total > 0
              ? `${usagePercent}%`
              : "—"
          }
          tone={quota.total > 0 ? usageTone(usagePercent) : "default"}
        />
      </ConsoleStatsGrid>

      <ConsolePanel className="p-6">
        <ConsolePanelHeader title="配额与命名空间概况" />

        {quota.total > 0 ? (
          <QuotaProgressCard used={quota.used} total={quota.total} percent={usagePercent} />
        ) : (
          <div className="rounded-[var(--radius-base)] border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <p className="text-xs font-bold text-[var(--text-muted)]">
              当前租户未设置配额上限
            </p>
          </div>
        )}
      </ConsolePanel>

      <div className="flex h-full flex-col gap-4">
          {/* 搜索框 */}
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              void load(1);
            }}
          >
            <Search
              size={16}
              strokeWidth={2.6}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <ConsoleInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="按名称或 ID 检索知识库，按回车搜索"
              className="w-full py-3 pl-11 pr-4"
            />
          </form>

          <ConsoleTableShell
            className="flex-1"
            columns={
              <>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">知识库</div>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">状态</div>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">文档数</div>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">向量数</div>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">引擎资源 URI</div>
                <div className="px-5 py-4 font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">操作</div>
              </>
            }
            headerClassName={`grid ${TABLE_COLUMNS}`}
            state={tableState}
            stateContent={{
              loading: (
                <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-sans text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  正在读取知识库注册表...
                </div>
              ),
              empty: <ConsoleEmptyState icon={Database} title="暂无匹配知识库" description="当前没有符合筛选条件的知识库记录。" />,
            }}
          >
            {items.map((item) => {
              const status = STATUS_MAP[item.status] ?? {
                label: item.status || "unknown",
                className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
              };

              return (
                <ConsoleListRow
                  key={item.id}
                  name={item.name}
                  nameTestId={`knowledge-base-name-${item.id}`}
                  detailId={item.id}
                  date={`创建于 ${new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })} · 创建人 ${actorName(item.createdBy)} · 更新人 ${actorName(item.updatedBy)}`}
                  badges={[
                    { label: status.label, className: status.className },
                  ]}
                  metrics={[
                    { value: item.docCount ?? 0 },
                    { value: (item.vectorCount ?? 0).toLocaleString(), className: "text-[var(--brand)]" },
                    {
                      value: item.vikingUri || "—",
                      className: "min-w-0",
                      render: (v) => (
                        <span
                          className="block break-all font-sans text-[11px] font-bold leading-relaxed text-[var(--text-muted)] select-all"
                          title="双击或框选复制"
                        >
                          {v}
                        </span>
                      ),
                    },
                  ]}
                  columns={TABLE_COLUMNS}
                  actions={
                    <div className="flex items-center gap-3">
                      <ConsoleButton
                        type="button"
                        tone="dark"
                        className="px-3 py-2.5 text-[11px] whitespace-nowrap"
                        onClick={() => handleEnterSite(item.id)}
                      >
                        进入空间
                      </ConsoleButton>
                      <KnowledgeBaseActionMenu
                        kbId={item.id}
                        disabled={mutatingId === item.id}
                        onRename={() => {
                          setRenameTarget(item);
                          setRenameName(item.name);
                        }}
                        onArchive={() => void handleArchive(item)}
                      />
                    </div>
                  }
                />
              );
            })}
          </ConsoleTableShell>

          {/* 分页控件 */}
          {!loading && totalItems > 0 ? (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-sans text-xs text-[var(--text-muted)] md:flex-row md:items-center md:justify-between">
              <div className="font-medium">
                第 {page}/{totalPages} 页，共 {totalItems} 个知识库
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load(page - 1)}
                  disabled={page <= 1}
                  className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:border-[var(--brand)]"
                >
                  <ChevronLeft size={14} />
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => void load(page + 1)}
                  disabled={page >= totalPages}
                  className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:border-[var(--brand)]"
                >
                  下一页
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : null}
      </div>

      <FormModal
        isOpen={Boolean(renameTarget)}
        onClose={() => {
          if (mutatingId) {
            return;
          }
          setRenameTarget(null);
          setRenameName("");
        }}
        onSubmit={handleRenameSubmit}
        title="重命名知识库"
        saving={Boolean(mutatingId)}
        saveText="保存名称"
        savingText="保存中..."
      >
        <div className="space-y-4">
          <div className="rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-muted)]">
            当前对象：{renameTarget?.name ?? "未选择"}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--text-primary)]">
              新的知识库名称
            </label>
            <input
              autoFocus
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              placeholder="输入新的知识库名称"
              className="ov-input px-4 py-3 font-sans text-sm"
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}
