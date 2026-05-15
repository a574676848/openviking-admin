"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  FileText,
  Home,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useApp, type ThemeType } from "@/components/app-provider";
import {
  LogOut,
  Moon,
  Sun,
  User as UserIcon,
  Settings,
  MoreVertical,
} from "lucide-react";

function resolveNextLoginRoute(pathname: string) {
  return `/login?mode=site&next=${encodeURIComponent(pathname)}`;
}
import { getShellPanelClass, ShellPanel, ShellButton } from "@/components/ui/shell-primitives";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import {
  buildKnowledgeSiteIndexRoute,
  buildKnowledgeSiteDocumentRoute,
  buildKnowledgeSiteHomeRoute,
  KNOWLEDGE_NODE_KIND_COLLECTION,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
} from "@/app/console/knowledge-tree/knowledge-tree.constants";
import { readRecentKnowledgeDocuments } from "@/lib/knowledge-site-recent";
import { KnowledgeSiteTree } from "./knowledge-site-tree";
import { KnowledgeSiteTreeActions } from "./knowledge-site-tree-actions";
import { NodeRenameDialog, NodePermissionDialog, NodeCreateDialog } from "./knowledge-site-dialogs";
import { toast } from "sonner";
import type { RecentKnowledgeDocument } from "@/lib/knowledge-site-recent";

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  tenantId: string;
}

export interface KnowledgeNodeSummary {
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  vikingUri: string | null;
  contentUri: string | null;
  kind: "collection" | "document";
  indexStatus?: "clean" | "dirty" | "pending" | "indexing" | "failed";
  draftVersion?: number;
  indexedVersion?: number;
  vectorCount?: number | null;
  lastIndexedAt?: string | null;
  indexError?: string | null;
  acl: {
    isPublic: boolean;
    roles: string[];
    users: string[];
  } | null;
  createdAt: string;
  childrenCount?: number;
}

export interface KnowledgeSiteTreeNode extends KnowledgeNodeSummary {
  children: KnowledgeSiteTreeNode[];
}

interface KnowledgeSiteContextValue {
  currentKb: KnowledgeBaseSummary | null;
  nodes: KnowledgeNodeSummary[];
  tree: KnowledgeSiteTreeNode[];
  loading: boolean;
  errorMessage: string;
  activeNodeMetadata?: { updatedAt: string } | null;
  setActiveNodeMetadata: (metadata: { updatedAt: string } | null) => void;
  reload: () => Promise<void>;
  loadNodeChildren: (parentId: string) => Promise<void>;
}

const KnowledgeSiteContext = createContext<KnowledgeSiteContextValue | null>(null);
const KNOWLEDGE_BASES_ENDPOINT = "/knowledge-bases";
const KNOWLEDGE_TREE_ENDPOINT = "/knowledge-tree";

function buildTree(nodes: KnowledgeNodeSummary[]): KnowledgeSiteTreeNode[] {
  const map = new Map<string, KnowledgeSiteTreeNode>();
  nodes.forEach((node) => map.set(node.id, { ...node, children: [] }));

  const roots: KnowledgeSiteTreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  return roots.sort((left, right) => left.sortOrder - right.sortOrder);
}

function filterTree(
  tree: KnowledgeSiteTreeNode[],
  keyword: string,
): KnowledgeSiteTreeNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return tree;
  }

  return tree.flatMap((node) => {
    const nextChildren = filterTree(node.children, keyword);
    if (
      node.name.toLowerCase().includes(normalizedKeyword) ||
      nextChildren.length > 0
    ) {
      return [{ ...node, children: nextChildren }];
    }

    return [];
  });
}

function flattenDocuments(tree: KnowledgeSiteTreeNode[]): KnowledgeSiteTreeNode[] {
  return tree.flatMap((node) => {
    if (node.kind === "document") {
      return [node];
    }

    return flattenDocuments(node.children);
  });
}

function UserMenu({ user, theme, setTheme, onLogout }: { 
  user: any; 
  theme: ThemeType; 
  setTheme: (t: ThemeType) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-all hover:border-[var(--brand)] hover:ring-2 hover:ring-[var(--brand)]/20"
      >
        <UserIcon size={18} strokeWidth={1.8} />
      </button>

      {open && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setOpen(false)} 
          />
          <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)]/95 p-1 shadow-[var(--shadow-base)] backdrop-blur-md z-40 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {user?.username || "未知用户"}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                {user?.role || "USER"}
              </div>
            </div>

            <button
              onClick={() => {
                setTheme(theme === "starry" ? "neo" : "starry");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-3 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] focus:bg-[var(--brand-muted)] focus:text-[var(--brand)] outline-none group"
            >
              {theme === "starry" ? (
                <>
                  <Sun size={15} strokeWidth={1.8} className="text-amber-500 group-hover:text-[var(--brand)]" />
                  <span>切换至新颖主题</span>
                </>
              ) : (
                <>
                  <Moon size={15} strokeWidth={1.8} className="text-blue-400 group-hover:text-[var(--brand)]" />
                  <span>切换至星空主题</span>
                </>
              )}
            </button>

            <Link
              href="/console/dashboard"
              className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-3 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] focus:bg-[var(--brand-muted)] focus:text-[var(--brand)] outline-none"
            >
              <Settings size={15} strokeWidth={1.8} />
              <span>管理后台</span>
            </Link>

            <div className="h-px bg-[var(--border)] my-1" />

            <button
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-3 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
            >
              <LogOut size={15} strokeWidth={1.8} />
              <span>退出登录</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function KnowledgeSiteShell({
  kbId,
  activeNodeId = null,
  children,
}: {
  kbId: string;
  activeNodeId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const { user, isLoading, logout, theme, setTheme } = useApp();
  const [hydrated, setHydrated] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBaseSummary[]>([]);
  const [nodes, setNodes] = useState<KnowledgeNodeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [recentDocuments, setRecentDocuments] = useState<RecentKnowledgeDocument[]>([]);
  const [activeNodeMetadata, setActiveNodeMetadata] = useState<{ updatedAt: string } | null>(null);

  // Dialog states
  const [actionNode, setActionNode] = useState<KnowledgeSiteTreeNode | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<"collection" | "document" | null>(null);

  const loadSiteData = useMemo(
    () => async () => {
      if (!kbId) {
        setKbs([]);
        setNodes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const kbList = await apiClient.get<KnowledgeBaseSummary[]>(KNOWLEDGE_BASES_ENDPOINT);
        setKbs(Array.isArray(kbList) ? kbList : []);

        if (activeNodeId) {
          const lineageNodes = await apiClient.get<KnowledgeNodeSummary[]>(
            `${KNOWLEDGE_TREE_ENDPOINT}/${encodeURIComponent(activeNodeId)}/lineage?kbId=${encodeURIComponent(kbId)}`
          );
          setNodes(Array.isArray(lineageNodes) ? lineageNodes : []);
        } else {
          const rootNodes = await apiClient.get<KnowledgeNodeSummary[]>(
            `${KNOWLEDGE_TREE_ENDPOINT}?kbId=${encodeURIComponent(kbId)}&parentId=root`
          );
          setNodes(Array.isArray(rootNodes) ? rootNodes : []);
        }
      } catch (err: unknown) {
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [kbId, activeNodeId],
  );

  const loadNodeChildren = async (parentId: string) => {
    if (nodes.some((n) => n.parentId === parentId)) return;
    try {
      const children = await apiClient.get<KnowledgeNodeSummary[]>(
        `${KNOWLEDGE_TREE_ENDPOINT}?kbId=${encodeURIComponent(kbId)}&parentId=${encodeURIComponent(parentId)}`
      );
      if (Array.isArray(children)) {
        setNodes((prev) => {
          const next = [...prev];
          children.forEach((c) => {
            if (!next.find((n) => n.id === c.id)) next.push(c);
          });
          return next;
        });
      }
    } catch (e) {
      console.error("Failed to load children", e);
    }
  };

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setRecentDocuments(readRecentKnowledgeDocuments());
  }, [hydrated, pathname]);

  useEffect(() => {
    if (!hydrated || isLoading) {
      return;
    }
    if (!user) {
      router.replace(resolveNextLoginRoute(pathname));
    }
  }, [hydrated, isLoading, pathname, router, user]);

  useEffect(() => {
    if (!hydrated || isLoading || !user || !kbId) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      void loadSiteData()
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          setErrorMessage(
            error instanceof Error ? error.message : "站点数据加载失败。",
          );
          setKbs([]);
          setNodes([]);
          setLoading(false);
        })
        .finally(() => {
          if (cancelled) {
            return;
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isLoading, kbId, loadSiteData, user]);

  const currentKb = useMemo(
    () => kbs.find((kb) => kb.id === kbId) ?? null,
    [kbId, kbs],
  );
  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) ?? null,
    [activeNodeId, nodes],
  );
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const filteredTree = useMemo(
    () => filterTree(tree, searchKeyword),
    [searchKeyword, tree],
  );
  const visibleRecentDocuments = useMemo(
    () => recentDocuments.filter((item) => item.kbId === kbId).slice(0, 5),
    [kbId, recentDocuments],
  );

  const contextValue = useMemo<KnowledgeSiteContextValue>(
    () => ({
      currentKb,
      nodes,
      tree: filteredTree,
      loading,
      errorMessage,
      activeNodeMetadata,
      setActiveNodeMetadata,
      reload: loadSiteData,
      loadNodeChildren,
    }),
    [currentKb, errorMessage, loadSiteData, loading, nodes, filteredTree, loadNodeChildren, activeNodeMetadata],
  );

  async function handleNodeAction(node: KnowledgeSiteTreeNode, action: "rename" | "permission" | "delete") {
    if (action === "rename") {
      setActionNode(node);
      setRenameOpen(true);
    } else if (action === "permission") {
      setActionNode(node);
      setPermissionOpen(true);
    } else if (action === "delete") {
      const approved = await confirm({
        title: node.kind === KNOWLEDGE_NODE_KIND_DOCUMENT ? "删除文档" : "删除目录",
        description: `确定要删除「${node.name}」吗？${node.kind === KNOWLEDGE_NODE_KIND_COLLECTION ? "目录下的所有内容也将被彻底清除。" : "删除后将无法恢复。"}`,
        confirmText: "确认删除",
        cancelText: "取消",
        tone: "danger",
      });
      if (!approved) return;
      
      try {
        await apiClient.delete(`/knowledge-tree/${node.id}`);
        await loadSiteData();
        toast.success(node.kind === KNOWLEDGE_NODE_KIND_DOCUMENT ? "文档已删除" : "目录已删除");
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "删除操作失败");
      }
    }
  }

  if (!hydrated || isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--editor-bg)] text-sm text-[var(--text-muted)]">
        正在连接知识站点…
      </div>
    );
  }

  return (
    <KnowledgeSiteContext.Provider
      value={{
        currentKb,
        nodes,
        tree: filteredTree,
        loading,
        errorMessage,
        activeNodeMetadata,
        setActiveNodeMetadata,
        reload: loadSiteData,
        loadNodeChildren,
      }}
    >
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-card)]/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-3 md:px-5">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-tile)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] md:hidden"
              onClick={() => setNavOpen((value) => !value)}
              aria-label="切换站点导航"
            >
              <Menu size={18} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius-tile)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] md:flex"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? "展开目录" : "收起目录"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={18} strokeWidth={1.8} />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.8} />
              )}
            </button>
            <Link
              href={buildKnowledgeSiteIndexRoute()}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-tile)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              aria-label="返回站点首页"
            >
              <Home size={18} strokeWidth={1.8} />
            </Link>
            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
            <Link
              href={buildKnowledgeSiteHomeRoute(kbId)}
              className="min-w-0 shrink-0 font-semibold text-[var(--text-primary)] hover:text-[var(--brand)] hidden md:block"
            >
              {currentKb?.name ?? "知识站点"}
            </Link>

            <div className="relative ml-2 flex items-center">
              <div 
                className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out rounded-full ${
                  searchExpanded ? "w-40 md:w-64 border border-[var(--brand)] bg-[var(--bg-card)] shadow-[0_0_0_2px_var(--brand-alpha)]" : "w-9 border border-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSearchExpanded(true)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${
                    searchExpanded ? "pointer-events-none" : ""
                  }`}
                >
                  <Search size={17} strokeWidth={2} />
                </button>
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  onFocus={() => setSearchExpanded(true)}
                  onBlur={() => !searchKeyword && setSearchExpanded(false)}
                  placeholder="搜索..."
                  autoFocus={searchExpanded}
                  className={`h-9 w-full bg-transparent text-sm outline-none transition-opacity duration-300 ${
                    searchExpanded ? "opacity-100 pl-1 pr-3" : "opacity-0 w-0"
                  }`}
                />
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <UserMenu 
                user={user} 
                theme={theme} 
                setTheme={setTheme} 
                onLogout={logout} 
              />
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
          {/* 侧边栏 Overlay (仅在移动端起作用) */}
          {navOpen && (
            <button
              type="button"
              aria-label="关闭导航遮罩"
              className="fixed inset-0 z-[5] bg-black/20 md:hidden"
              onClick={() => setNavOpen(false)}
            />
          )}
          <aside
            className={getShellPanelClass(
              theme,
              "sidebar",
              `absolute bottom-0 top-[49px] z-[10] flex w-64 flex-col transition-transform duration-300 md:static md:top-0 md:h-[calc(100vh-3.5rem)] md:translate-x-0 ${
                navOpen ? "translate-x-0" : "-translate-x-full"
              } ${sidebarCollapsed ? "md:hidden" : "md:flex"}`
            )}
          >
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <div className="mb-4 px-2">
                <KnowledgeSiteTreeActions
                  loading={loading}
                  onRefresh={loadSiteData}
                  onCreateNode={(kind) => {
                    setCreateKind(kind);
                    setCreateOpen(true);
                  }}
                />
              </div>
              <KnowledgeSiteTree
                kbId={kbId}
                tree={filteredTree}
                activeNodeId={activeNodeId}
                onNodeAction={handleNodeAction}
              />
            </div>
          </aside>

          <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
            <div className="relative z-[6] flex-1 min-h-0 px-4 py-6 md:px-8 flex flex-col">
              {children}
            </div>
          </main>
        </div>
      </div>
      
      <NodeRenameDialog
        node={actionNode}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onSuccess={loadSiteData}
      />
      <NodePermissionDialog
        node={actionNode}
        open={permissionOpen}
        onOpenChange={setPermissionOpen}
        onSuccess={loadSiteData}
      />
      <NodeCreateDialog
        kbId={kbId}
        parentId={activeNodeId}
        kind={createKind}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={loadSiteData}
      />
    </KnowledgeSiteContext.Provider>
  );
}

export function useKnowledgeSite() {
  const context = useContext(KnowledgeSiteContext);
  if (!context) {
    throw new Error("useKnowledgeSite 必须在 KnowledgeSiteShell 内使用。");
  }
  return context;
}

export function flattenKnowledgeSiteDocumentsFromContext(
  tree: KnowledgeSiteTreeNode[],
) {
  return flattenDocuments(tree);
}
