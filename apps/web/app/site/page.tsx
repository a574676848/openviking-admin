"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Clock3,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  UsersRound,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { FormModal } from "@/components/ui/FormModal";
import { apiClient } from "@/lib/apiClient";
import { readRecentKnowledgeDocuments } from "@/lib/knowledge-site-recent";
import {
  getShellButtonClass,
  getShellPanelClass,
  getShellTileClass,
} from "@/components/ui/shell-primitives";
import { buildKnowledgeSiteHomeRoute } from "../console/knowledge-tree/knowledge-tree.constants";

const GithubIcon = ({ size = 24, strokeWidth = 2, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface KnowledgeBaseSummary {
  id: string;
  name: string;
  tenantId: string;
  status?: "active" | "building" | "archived";
  description?: string;
  docCount?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: ActorInfo | null;
  updatedBy?: ActorInfo | null;
}

interface ActorInfo {
  id?: string | null;
  username?: string | null;
}

interface DashboardSnapshot {
  tenantIdentifier?: string;
}

interface KnowledgeBaseDraft {
  name: string;
  description: string;
}

const ARCHIVED_STATUS = "archived";
const HTTP_STATUS_UNAUTHORIZED = 401;
const EMPTY_DRAFT: KnowledgeBaseDraft = {
  name: "",
  description: "",
};
const RECENT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function buildSiteLoginRoute() {
  return "/login?mode=site&next=%2Fsite";
}

function isTokenExpiredError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === HTTP_STATUS_UNAUTHORIZED
  );
}

function formatRecentVisitedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "最近访问";
  }
  return RECENT_DATE_FORMATTER.format(date);
}

function formatKnowledgeBaseTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function resolveActorName(actor?: ActorInfo | null) {
  return actor?.username?.trim() || actor?.id?.trim() || "-";
}

function KnowledgeBaseCardMenu({
  disabled,
  onRename,
  onArchive,
  shellTheme,
}: {
  disabled: boolean;
  onRename: () => void;
  onArchive: () => void;
  shellTheme: "neo" | "starry";
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
        disabled={disabled}
        aria-label="空间更多操作"
        className={`${getShellButtonClass(
          shellTheme,
          "default",
          "h-10 w-10 p-0",
        )} disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {open ? (
        <div
          className={getShellPanelClass(
            shellTheme,
            "popover",
            "absolute right-0 top-12 z-20 min-w-[180px] p-1",
          )}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[calc(var(--radius-base)-6px)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] focus:bg-[var(--brand-muted)] focus:text-[var(--brand)] focus:outline-none"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <PencilLine size={15} strokeWidth={1.8} />
            重命名空间
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[calc(var(--radius-base)-6px)] px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10 focus:bg-[var(--danger)]/10 focus:outline-none"
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
          >
            <Trash2 size={15} strokeWidth={1.8} />
            删除空间
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function KnowledgeSiteIndexPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { user, isLoading, theme, logout } = useApp();
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [tenantIdentifier, setTenantIdentifier] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>(
    [],
  );
  const [recentDocuments, setRecentDocuments] = useState<
    ReturnType<typeof readRecentKnowledgeDocuments>
  >([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draft, setDraft] = useState<KnowledgeBaseDraft>(EMPTY_DRAFT);
  const [renameTarget, setRenameTarget] = useState<KnowledgeBaseSummary | null>(
    null,
  );
  const [renameName, setRenameName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const shellTheme = theme === "starry" ? "starry" : "neo";

  function redirectToSiteLogin(error: unknown) {
    if (!isTokenExpiredError(error)) {
      return false;
    }

    setKnowledgeBases([]);
    router.replace(buildSiteLoginRoute());
    return true;
  }

  async function loadKnowledgeBases() {
    const [kbList, dashboard] = await Promise.all([
      apiClient.get<KnowledgeBaseSummary[]>("/knowledge-bases"),
      apiClient
        .get<DashboardSnapshot>("/system/dashboard")
        .catch(() => ({ tenantIdentifier: user?.tenantId ?? "" })),
    ]);

    setKnowledgeBases(Array.isArray(kbList) ? kbList : []);
    setTenantIdentifier(dashboard.tenantIdentifier ?? user?.tenantId ?? "");
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || isLoading) {
      return;
    }

    if (!user) {
      router.replace(buildSiteLoginRoute());
    }
  }, [hydrated, isLoading, router, user]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setRecentDocuments(readRecentKnowledgeDocuments(user?.tenantId));
  }, [hydrated, user?.tenantId]);

  useEffect(() => {
    if (!hydrated || isLoading || !user) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    queueMicrotask(() => {
      void loadKnowledgeBases()
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          setKnowledgeBases([]);
          if (redirectToSiteLogin(error)) {
            return;
          }
          toast.error(
            error instanceof Error ? error.message : "知识空间加载失败",
          );
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isLoading, user]);

  const filteredKnowledgeBases = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return knowledgeBases;
    }

    return knowledgeBases.filter((item) => {
      return (
        item.name.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword)
      );
    });
  }, [knowledgeBases, searchQuery]);

  const totalPages = Math.ceil(filteredKnowledgeBases.length / pageSize);
  const paginatedKbs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredKnowledgeBases.slice(start, start + pageSize);
  }, [filteredKnowledgeBases, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (!hydrated || isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--editor-bg)] text-sm text-[var(--text-muted)]">
        正在连接知识空间…
      </div>
    );
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextName = draft.name.trim();
    const currentTenantIdentifier = tenantIdentifier || user?.tenantId || "";
    if (!nextName) {
      toast.error("请输入知识库名称");
      return;
    }
    if (!currentTenantIdentifier) {
      toast.error("当前租户标识不可用");
      return;
    }

    setMutating(true);
    try {
      await apiClient.post("/knowledge-bases", {
        name: nextName,
        description: draft.description.trim(),
        tenantId: currentTenantIdentifier,
        vikingUri: `viking://resources/${currentTenantIdentifier}/`,
      });
      await loadKnowledgeBases();
      setCreateModalOpen(false);
      setDraft(EMPTY_DRAFT);
      toast.success("知识库已创建");
    } catch (error: unknown) {
      if (redirectToSiteLogin(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "知识库创建失败");
    } finally {
      setMutating(false);
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

    setMutating(true);
    try {
      await apiClient.patch(`/knowledge-bases/${renameTarget.id}`, {
        name: nextName,
      });
      await loadKnowledgeBases();
      setRenameTarget(null);
      setRenameName("");
      toast.success("知识库名称已更新");
    } catch (error: unknown) {
      if (redirectToSiteLogin(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "知识库重命名失败");
    } finally {
      setMutating(false);
    }
  }

  async function handleArchive(item: KnowledgeBaseSummary) {
    const approved = await confirm({
      title: "删除空间",
      description: `确定要删除「${item.name}」吗？删除后它将不再显示在首页。`,
      confirmText: "删除",
      cancelText: "取消",
      tone: "danger",
    });

    if (!approved) {
      return;
    }

    setMutating(true);
    try {
      await apiClient.patch(`/knowledge-bases/${item.id}`, {
        status: ARCHIVED_STATUS,
      });
      await loadKnowledgeBases();
      toast.success("空间已删除");
    } catch (error: unknown) {
      if (redirectToSiteLogin(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "空间删除失败");
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden flex flex-col bg-transparent text-[var(--text-primary)] relative">
      {/* 极简网格 - 背景装饰 */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 opacity-[0.05] theme-neo-only"
        style={{
          backgroundImage: `radial-gradient(var(--brand) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* 粒子流明 - 星空主题版动画 */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 opacity-[0.5] theme-starry-only vector-space-bg"
        style={{
          backgroundImage: `linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center gap-3 px-4 md:px-6">
          <div
            className={getShellTileClass(
              shellTheme,
              "flex h-10 w-10 items-center justify-center bg-[var(--brand-muted)] text-[var(--brand)]",
            )}
          >
            <BookOpen size={18} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              知识空间
            </div>
            <div className="text-xs text-[var(--text-muted)]">探索与协作</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 md:flex">
              <Search
                size={15}
                strokeWidth={1.8}
                className="text-[var(--text-muted)]"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索知识空间"
                className="h-10 w-48 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
            <button
              type="button"
              className={getShellButtonClass(
                shellTheme,
                "default",
                "h-10 px-4",
              )}
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={15} strokeWidth={1.8} />
              新建知识库
            </button>
            <ThemeSwitcher align="right" />
            <a
              href="https://github.com/a574676848/openviking-admin"
              target="_blank"
              rel="noopener noreferrer"
              className={getShellButtonClass(
                shellTheme,
                "default",
                "h-10 px-3 group",
              )}
              title="代码仓库 (GitHub)"
            >
              <div
                className={getShellTileClass(
                  shellTheme,
                  "p-1.5 bg-transparent",
                )}
              >
                <GithubIcon size={14} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-bold whitespace-nowrap ml-1 hidden sm:inline-block">
                代码仓库
              </span>
            </a>
            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
            <button
              type="button"
              className={getShellButtonClass(
                shellTheme,
                "default",
                "h-10 px-3",
              )}
              onClick={logout}
              title="退出登录"
            >
              <LogOut size={15} strokeWidth={1.8} className="md:mr-2" />
              <span className="hidden md:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex w-full flex-col gap-6 px-4 py-6 md:px-6">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={getShellPanelClass(shellTheme, "surface", "p-5 md:p-6")}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Welcome Back
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-normal">
                  欢迎回来，{user.username}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] font-medium">
                  在这里快速访问您的知识库，开始今天的沉浸式阅读与协作。
                </p>
              </div>
              <div className="grid min-w-[240px] gap-3 sm:grid-cols-2">
                <div className={getShellTileClass(shellTheme, "px-4 py-4")}>
                  <div className="text-xs text-[var(--text-muted)]">
                    可见知识库
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {knowledgeBases.length}
                  </div>
                </div>
                <div className={getShellTileClass(shellTheme, "px-4 py-4")}>
                  <div className="text-xs text-[var(--text-muted)]">
                    最近访问
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {recentDocuments.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside
            className={getShellPanelClass(shellTheme, "surface", "p-4")}
            aria-label="最近访问的文档"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Clock3
                size={16}
                strokeWidth={1.8}
                className="text-[var(--brand)]"
              />
              最近访问
            </div>
            <div className="mt-4 space-y-2">
              {recentDocuments.length === 0 ? (
                <div className="rounded-[var(--radius-tile)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  还没有访问历史
                </div>
              ) : (
                recentDocuments.slice(0, 8).map((item) => (
                  <Link
                    key={`${item.kbId}-${item.nodeId}`}
                    href={`${buildKnowledgeSiteHomeRoute(item.kbId)}/doc/${encodeURIComponent(item.nodeId)}`}
                    className="block rounded-[var(--radius-tile)] border border-transparent px-4 py-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-elevated)]"
                  >
                    <div className="truncate text-sm font-semibold">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatRecentVisitedAt(item.visitedAt)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </aside>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">全部空间</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)] font-medium">
                查看您有权访问的所有知识库。
              </p>
            </div>
            <div className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">
              共 {filteredKnowledgeBases.length} 个空间
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-44 animate-pulse rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)]"
                />
              ))}
            </div>
          ) : filteredKnowledgeBases.length === 0 ? (
            <div
              className={getShellPanelClass(
                shellTheme,
                "surface",
                "px-6 py-16 text-center",
              )}
            >
              <div className="text-lg font-semibold">暂无匹配知识库</div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                调整搜索词，或者直接新建一个知识库。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {paginatedKbs.map((item) => (
                  <article
                    key={item.id}
                    className={getShellPanelClass(
                      shellTheme,
                      "surface",
                      "flex h-full flex-col p-4",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={getShellTileClass(
                          shellTheme,
                          "flex h-9 w-9 items-center justify-center bg-[var(--brand-muted)] text-[var(--brand)]",
                        )}
                      >
                        <BookOpen size={16} strokeWidth={1.8} />
                      </div>
                      <KnowledgeBaseCardMenu
                        shellTheme={shellTheme}
                        disabled={mutating}
                        onRename={() => {
                          setRenameTarget(item);
                          setRenameName(item.name);
                        }}
                        onArchive={() => {
                          void handleArchive(item);
                        }}
                      />
                    </div>
                    <div className="mt-4">
                      <div className="text-base font-semibold">{item.name}</div>
                      <div className="mt-1.5 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--text-muted)]">
                        {item.description?.trim() ||
                          "该知识库尚未填写空间说明。"}
                      </div>
                    </div>
                    <div className="mt-5 space-y-2 text-xs text-[var(--text-muted)]">
                      <div className="flex items-center gap-2">
                        <UsersRound size={14} strokeWidth={1.8} />
                        <span>创建人：{resolveActorName(item.createdBy)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UsersRound size={14} strokeWidth={1.8} />
                        <span>更新人：{resolveActorName(item.updatedBy)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3 size={14} strokeWidth={1.8} />
                        <span>
                          最近更新时间：
                          {formatKnowledgeBaseTime(
                            item.updatedAt ?? item.createdAt,
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-5 flex gap-2">
                      <Link
                        href={buildKnowledgeSiteHomeRoute(item.id)}
                        className={`${getShellButtonClass(
                          shellTheme,
                          "default",
                          "h-10 w-full",
                        )}`}
                      >
                        进入空间
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    className={getShellButtonClass(
                      shellTheme,
                      "default",
                      "h-10 w-10 p-0 disabled:opacity-30",
                    )}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1;
                      const isActive = currentPage === pageNum;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          className={getShellButtonClass(
                            shellTheme,
                            "default",
                            `h-10 w-10 p-0 ${isActive ? "!bg-[var(--brand)] !text-[var(--brand-text)] border-[var(--brand)]" : ""}`,
                          )}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    className={getShellButtonClass(
                      shellTheme,
                      "default",
                      "h-10 w-10 p-0 disabled:opacity-30",
                    )}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-auto pt-16 pb-12 flex flex-col items-center gap-6 opacity-60 hover:opacity-100 transition-all duration-700">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-black tracking-[0.2em] text-[var(--text-primary)] uppercase">
                OpenViking Admin
              </span>
              <span className="h-3 w-px bg-[var(--border)]"></span>
              <span className="text-[12px] font-bold text-[var(--text-secondary)]">
                v2.3.0
              </span>
            </div>
            <div className="text-[12px] text-[var(--text-secondary)] font-bold tracking-[0.1em]">
              维京企业级高性能知识中台
            </div>
          </div>

          <div className="flex items-center gap-5 text-[11px] font-bold tracking-tight text-[var(--text-muted)]">
            <span className="uppercase">Copyright © 2026 OpenViking Admin</span>
          </div>
        </div>
      </main>

      <FormModal
        isOpen={createModalOpen}
        onClose={() => {
          if (mutating) {
            return;
          }
          setCreateModalOpen(false);
          setDraft(EMPTY_DRAFT);
        }}
        onSubmit={handleCreateSubmit}
        title="新建知识库"
        saving={mutating}
        saveText="创建知识库"
        savingText="创建中..."
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold">
              知识库名称
            </label>
            <input
              autoFocus
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="例如：产品知识库"
              className="h-12 w-full rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-base)] px-4 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">空间说明</label>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="说明这个知识库面向的业务范围与内容来源"
              rows={4}
              className="w-full rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-base)] px-4 py-3 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>
      </FormModal>

      <FormModal
        isOpen={Boolean(renameTarget)}
        onClose={() => {
          if (mutating) {
            return;
          }
          setRenameTarget(null);
          setRenameName("");
        }}
        onSubmit={handleRenameSubmit}
        title="重命名知识库"
        saving={mutating}
        saveText="保存名称"
        savingText="保存中..."
      >
        <div className="space-y-5">
          <div className="rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text-muted)]">
            当前对象：{renameTarget?.name ?? "未选择"}
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">
              新的知识库名称
            </label>
            <input
              autoFocus
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              placeholder="输入新的知识库名称"
              className="h-12 w-full rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-base)] px-4 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}
