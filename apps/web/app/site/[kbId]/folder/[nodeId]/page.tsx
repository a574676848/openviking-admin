"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { Folder, FileText, ChevronRight, Lock, Loader2, DatabaseZap } from "lucide-react";
import { motion } from "framer-motion";
import { KnowledgeSiteShell, useKnowledgeSite } from "@/components/knowledge-site/knowledge-site-shell";
import { findKnowledgeSiteNode } from "@/components/knowledge-site/knowledge-site-admin-utils";
import {
  buildKnowledgeSiteFolderRoute,
  buildKnowledgeSiteHomeRoute,
  buildKnowledgeSiteDocRoute,
  buildKnowledgeSiteIndexRoute,
} from "@/lib/knowledge-site-routes";
import { KNOWLEDGE_NODE_KIND_DOCUMENT } from "@/app/console/knowledge-tree/knowledge-tree.constants";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShellPanel } from "@/components/ui/shell-primitives";
import { useApp } from "@/components/app-provider";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";

type DocumentIndexStatus = "clean" | "dirty" | "pending" | "indexing" | "failed";

const INDEX_STATUS_LABELS: Record<DocumentIndexStatus, string> = {
  clean: "已索引",
  dirty: "待索引",
  pending: "待索引",
  indexing: "索引中",
  failed: "索引失败",
};

function resolveIndexStatus(status?: string): DocumentIndexStatus {
  if (status === "dirty" || status === "pending" || status === "indexing" || status === "failed") {
    return status;
  }
  return "clean";
}

function DocumentIndexBadge({ status }: { status?: string }) {
  const normalized = resolveIndexStatus(status);
  const toneClass =
    normalized === "clean"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : normalized === "indexing"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex min-w-[72px] justify-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      {INDEX_STATUS_LABELS[normalized]}
    </span>
  );
}

function KnowledgeSiteFolderContent({ kbId, nodeId }: { kbId: string; nodeId: string }) {
  const { tree, loadNodeChildren, reload } = useKnowledgeSite();
  const { theme } = useApp();
  const router = useRouter();
  const node = useMemo(() => findKnowledgeSiteNode(tree, nodeId), [tree, nodeId]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const [indexingNodeId, setIndexingNodeId] = useState<string | null>(null);

  async function handleIndexDocument(childNodeId: string) {
    setIndexingNodeId(childNodeId);
    try {
      await apiClient.post(`/editor/${encodeURIComponent(childNodeId)}/index`, {});
      toast.success("文档索引已更新");
      await reload();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "文档索引更新失败");
    } finally {
      setIndexingNodeId(null);
    }
  }

  useEffect(() => {
    // 路由回退行为拦截 (Fallback)
    if (node && node.kind === KNOWLEDGE_NODE_KIND_DOCUMENT) {
      router.replace(buildKnowledgeSiteDocRoute(kbId, nodeId));
    }
  }, [node, kbId, nodeId, router]);

  useEffect(() => {
    if (node && node.children.length === 0 && (node.childrenCount ?? 0) > 0) {
      setIsLazyLoading(true);
      loadNodeChildren(node.id).finally(() => setIsLazyLoading(false));
    }
  }, [node, loadNodeChildren]);

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
        <Folder size={32} className="opacity-50 mb-4" />
        <p>找不到该目录或您没有权限访问。</p>
      </div>
    );
  }

  // 面包屑导航路径
  const breadcrumbs = node.path?.split("/").filter(Boolean) ?? [];

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] overflow-hidden">
        <Link href={buildKnowledgeSiteIndexRoute()} className="hover:text-[var(--brand)] transition-colors">
          站点首页
        </Link>
        <ChevronRight size={14} />
        <Link href={buildKnowledgeSiteHomeRoute(kbId)} className="hover:text-[var(--brand)] transition-colors">
          空间主页
        </Link>
        {breadcrumbs.map((crumb, idx) => (
          <span key={idx} className="flex items-center gap-2 overflow-hidden">
            <ChevronRight size={14} />
            <span className="truncate max-w-[120px] sm:max-w-[200px]">{crumb}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-[var(--border)] pb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Folder className="text-[var(--text-muted)]" size={24} />
            {node.name}
            {node.acl?.isPublic === false && (
               <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--bg-base)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] border border-[var(--border)]">
                 <Lock size={12} strokeWidth={1.8} /> 内部
               </span>
            )}
          </h1>
        </div>
      </div>

      <ShellPanel theme={theme} variant="surface">
        <div className="grid grid-cols-[1fr_120px_110px] gap-4 border-b border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">
          <div>名称</div>
          <div>索引</div>
          <div>类型</div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {isLazyLoading ? (
            <div className="py-12 flex justify-center text-[var(--text-muted)]">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : node.children.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-muted)]">
              此目录为空
            </div>
          ) : (
            node.children.map((child) => {
              const isDoc = child.kind === KNOWLEDGE_NODE_KIND_DOCUMENT;
              const indexStatus = resolveIndexStatus(child.indexStatus);
              const showIndexButton = isDoc && indexStatus !== "clean";
              const isIndexing = indexingNodeId === child.id || indexStatus === "indexing";
              const href = isDoc
                ? buildKnowledgeSiteDocRoute(kbId, child.id)
                : buildKnowledgeSiteFolderRoute(kbId, child.id);
              
              return (
                <div
                  key={child.id}
                  className="group grid grid-cols-[1fr_120px_110px] items-center gap-4 px-6 py-4 transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  <Link href={href} className="flex min-w-0 items-center gap-3">
                    {isDoc ? (
                      <FileText size={18} className="text-[var(--brand)] shrink-0" />
                    ) : (
                      <Folder size={18} className="text-[var(--text-muted)] shrink-0" />
                    )}
                    <span className="truncate font-medium text-[var(--text-primary)] group-hover:text-[var(--brand)] transition-colors">
                      {child.name}
                    </span>
                    {child.acl?.isPublic === false && (
                      <Lock size={12} className="text-[var(--text-muted)] shrink-0" />
                    )}
                  </Link>
                  <div className="flex items-center gap-2">
                    {isDoc ? (
                      <>
                        <DocumentIndexBadge status={child.indexStatus} />
                        {showIndexButton && (
                          <button
                            type="button"
                            onClick={() => void handleIndexDocument(child.id)}
                            disabled={isIndexing}
                            title="更新索引"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] transition-all hover:border-[var(--brand)] hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isIndexing ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <DatabaseZap size={15} />
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-[var(--text-muted)]">-</span>
                    )}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {isDoc ? "文档" : "目录"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ShellPanel>
    </div>
  );
}

export default function KnowledgeSiteFolderPage({
  params,
}: {
  params: Promise<{ kbId: string; nodeId: string }>;
}) {
  const { kbId, nodeId } = use(params);
  
  return (
    <KnowledgeSiteShell kbId={kbId} activeNodeId={nodeId}>
      <KnowledgeSiteFolderContent kbId={kbId} nodeId={nodeId} />
    </KnowledgeSiteShell>
  );
}
