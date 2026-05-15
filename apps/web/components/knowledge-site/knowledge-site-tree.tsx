"use client";

import Link from "next/link";
import React from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, FileText, Folder } from "lucide-react";
import { buildKnowledgeSiteDocRoute, buildKnowledgeSiteFolderRoute } from "@/lib/knowledge-site-routes";
import { useKnowledgeSite, type KnowledgeSiteTreeNode } from "./knowledge-site-shell";
import { NodeActionMenu } from "./knowledge-site-action-menu";

export type KnowledgeSiteNodeAction = "rename" | "permission" | "delete";

export interface KnowledgeSiteTreeProps {
  kbId: string;
  tree: KnowledgeSiteTreeNode[];
  activeNodeId?: string | null;
  onNodeAction?: (node: KnowledgeSiteTreeNode, action: KnowledgeSiteNodeAction) => void;
}

export function KnowledgeSiteTreeItem({
  kbId,
  node,
  depth,
  activeNodeId,
  onNodeAction,
}: {
  kbId: string;
  node: KnowledgeSiteTreeNode;
  depth: number;
  activeNodeId: string | null;
  onNodeAction?: (node: KnowledgeSiteTreeNode, action: KnowledgeSiteNodeAction) => void;
}) {
  const { loadNodeChildren } = useKnowledgeSite();
  const [expanded, setExpanded] = useState(node.children.length > 0);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  // Consider node having children if it has actual children array OR childrenCount > 0
  const hasChildren = node.children.length > 0 || (node.childrenCount ?? 0) > 0;
  
  // If we are currently active or an ancestor of the active node, we might be expanded by default. 
  // However, since we use lineage, ancestors are returned with children loaded.
  // We can default expanded to true if we have loaded children. But wait, if lineage loads them, 
  // we want the lineage path to be expanded. Let's auto-expand if activeNodeId is within our descendants.
  // We'll simplify and expand if children are already loaded via lineage, or we can just default to false and let the lineage pass expand.
  // Wait, `lineage` loads children but doesn't tell us if it should be expanded.
  // Actually, let's keep it simple: expand if children.length > 0.
  // Actually, let's keep it simple: expand if children.length > 0.

  const isDocument = node.kind === "document";
  const isActive = activeNodeId === node.id;
  const href = isDocument
    ? buildKnowledgeSiteDocRoute(kbId, node.id)
    : buildKnowledgeSiteFolderRoute(kbId, node.id);

  const handleToggleExpand = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasChildren) return;
    
    if (!expanded && node.children.length === 0 && (node.childrenCount ?? 0) > 0) {
      setIsLoadingChildren(true);
      await loadNodeChildren(node.id);
      setIsLoadingChildren(false);
    }
    setExpanded((value) => !value);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-2 rounded-[var(--radius-tile)] px-2 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-[var(--brand-muted)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-tile)] text-[var(--text-muted)] hover:bg-[var(--bg-card)] disabled:opacity-50"
          onClick={handleToggleExpand}
          disabled={isLoadingChildren}
          aria-label={hasChildren ? `${expanded ? "收起" : "展开"} ${node.name}` : `${node.name} 无子节点`}
        >
          {isLoadingChildren ? (
            <Loader2 size={12} className="animate-spin" />
          ) : hasChildren ? (
            expanded ? (
              <ChevronDown size={14} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.8} />
            )
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
          )}
        </button>
        <Link href={href} className="min-w-0 flex-1 truncate flex items-center gap-2">
          {isDocument ? (
            <FileText size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--brand)]" />
          ) : (
            <Folder size={14} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--brand)]" />
          )}
          <span className="truncate">{node.name}</span>
        </Link>
        {onNodeAction && (
          <NodeActionMenu
            node={node}
            onRename={() => onNodeAction(node, "rename")}
            onPermission={() => onNodeAction(node, "permission")}
            onDelete={() => onNodeAction(node, "delete")}
          />
        )}
      </div>
      {expanded && node.children.length > 0 ? (
        <div>
          {node.children.map((child) => (
            <KnowledgeSiteTreeItem
              key={child.id}
              kbId={kbId}
              node={child}
              depth={depth + 1}
              activeNodeId={activeNodeId}
              onNodeAction={onNodeAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function KnowledgeSiteTree({
  kbId,
  tree,
  activeNodeId = null,
  onNodeAction,
}: KnowledgeSiteTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="px-2 py-3 text-sm text-[var(--text-muted)]">
        没有匹配的目录或文档。
      </div>
    );
  }

  return (
    <div className="space-y-[2px]">
      {tree.map((node) => (
        <KnowledgeSiteTreeItem
          key={node.id}
          kbId={kbId}
          node={node}
          depth={0}
          activeNodeId={activeNodeId}
          onNodeAction={onNodeAction}
        />
      ))}
    </div>
  );
}
