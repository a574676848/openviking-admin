"use client";

import { FilePlus2, FolderPlus, RefreshCw } from "lucide-react";
import {
  KNOWLEDGE_NODE_KIND_COLLECTION,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
  type KnowledgeNodeKind,
} from "@/app/console/knowledge-tree/knowledge-tree.constants";

export interface KnowledgeSiteTreeActionsProps {
  loading: boolean;
  onRefresh: () => void;
  onCreateNode: (kind: KnowledgeNodeKind) => void;
}

export function KnowledgeSiteTreeActions({
  loading,
  onRefresh,
  onCreateNode,
}: KnowledgeSiteTreeActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--text-primary)] px-3 text-xs font-semibold text-[var(--bg-base)] shadow-sm transition-all hover:scale-[1.02] hover:bg-[var(--text-primary)]/90 active:scale-[0.98]"
        onClick={() => onCreateNode(KNOWLEDGE_NODE_KIND_DOCUMENT)}
      >
        <FilePlus2 size={14} strokeWidth={2} />
        新文档
      </button>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition-all hover:bg-[var(--bg-elevated)] active:scale-[0.98]"
        onClick={() => onCreateNode(KNOWLEDGE_NODE_KIND_COLLECTION)}
      >
        <FolderPlus size={14} strokeWidth={2} />
        新目录
      </button>
      <button
        type="button"
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        onClick={onRefresh}
        title="刷新目录"
      >
        <RefreshCw size={14} strokeWidth={2} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
