"use client";

import { ChevronDown, ChevronRight, FileText, FolderTree, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConsoleButton, ConsoleSelect } from "@/components/console/primitives";
import type { KnowledgeBase, TreeNode } from "./knowledge-tree.types";
import { isDocumentNode } from "./knowledge-tree.utils";
import {
  DOCUMENT_INDEX_STATUS_LABELS,
  DOCUMENT_INDEX_STATUS_TONES,
} from "./knowledge-tree.constants";

function resolveIndexStatus(node: TreeNode) {
  return node.indexStatus ?? "clean";
}

function TreeItem({
  node,
  depth,
  selected,
  draggingNodeId,
  dragOverNodeId,
  onSelect,
  onRenameNode,
  onDragStart,
  onDragHover,
  onDragEnd,
  onDropToNode,
  onRebuildIndex,
  rebuildingNodeId,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  draggingNodeId: string | null;
  dragOverNodeId: string | null;
  onSelect: (node: TreeNode) => void;
  onRenameNode: (node: TreeNode, nextName: string) => Promise<void>;
  onDragStart: (node: TreeNode) => void;
  onDragHover: (node: TreeNode) => void;
  onDragEnd: () => void;
  onDropToNode: (targetNode: TreeNode) => void;
  onRebuildIndex: (node: TreeNode) => void;
  rebuildingNodeId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(node.name);
  const [renaming, setRenaming] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selected === node.id;
  const isDragging = draggingNodeId === node.id;
  const isDragOver = dragOverNodeId === node.id;
  const isDoc = isDocumentNode(node);
  const indexStatus = resolveIndexStatus(node);
  const isIndexing = rebuildingNodeId === node.id || indexStatus === "indexing";
  const NodeIcon = isDocumentNode(node) ? FileText : FolderTree;

  async function commitRename() {
    const trimmedName = draftName.trim();
    setIsRenaming(false);
    if (!trimmedName || trimmedName === node.name) {
      setDraftName(node.name);
      return;
    }

    setRenaming(true);
    try {
      await onRenameNode(node, trimmedName);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="font-sans text-[11px] tracking-widest">
      <div
        draggable={!isRenaming}
        className={`mb-1 flex w-full items-center gap-2 rounded-[var(--radius-tile)] border-[var(--border-width)] px-3 py-2.5 transition-all ${
          isSelected
            ? "border-[var(--border)] bg-[var(--brand-muted)] text-[var(--text-primary)] shadow-[var(--shadow-base)]"
            : "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border)] hover:bg-[var(--bg-elevated)] hover:shadow-[var(--shadow-base)]"
        } ${isDragOver ? "border-[var(--brand)] bg-[var(--brand-muted)]" : ""} ${
          isDragging ? "opacity-40" : ""
        }`}
        data-node-id={node.id}
        style={{ marginLeft: `${depth * 12}px` }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          onDragStart(node);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDragHover(node);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropToNode(node);
        }}
      >
        <button
          type="button"
          aria-label={hasChildren ? `${expanded ? "收起" : "展开"}节点 ${node.name}` : `节点 ${node.name} 无子节点`}
          title={hasChildren ? `${expanded ? "收起" : "展开"}节点 ${node.name}` : `节点 ${node.name} 无子节点`}
          aria-expanded={hasChildren ? expanded : undefined}
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center focus-visible:outline-none"
          onClick={() => {
            if (hasChildren) {
              setExpanded((value) => !value);
            }
          }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />
          ) : (
            <span className="h-1.5 w-1.5 bg-current" />
          )}
        </button>
        <button
          type="button"
          aria-label={`选中节点 ${node.name}`}
          title={`选中节点 ${node.name}`}
          onClick={() => onSelect(node)}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraftName(node.name);
            setIsRenaming(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          <NodeIcon size={14} className={isSelected ? "text-[var(--brand)]" : "text-[var(--text-primary)]"} />
          {isRenaming ? (
            <input
              autoFocus
              value={draftName}
              disabled={renaming}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                void commitRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftName(node.name);
                  setIsRenaming(false);
                }
              }}
              className="min-w-0 flex-1 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 font-sans text-sm font-black tracking-tight text-[var(--text-primary)] outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate font-black uppercase">{node.name}</span>
          )}
          {node.children.length > 0 && (
            <span className="rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--brand-muted)] px-2 py-0.5 text-[9px] font-black text-[var(--brand)]">
              {node.children.length}
            </span>
          )}
        </button>
        {isDoc && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <span className={`rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[9px] font-black ${DOCUMENT_INDEX_STATUS_TONES[indexStatus]}`}>
              {DOCUMENT_INDEX_STATUS_LABELS[indexStatus]}
            </span>
            {indexStatus !== "clean" && (
              <button
                type="button"
                aria-label={`重建索引 ${node.name}`}
                title="重建索引"
                disabled={isIndexing}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRebuildIndex(node);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-all hover:-translate-y-px hover:bg-[var(--brand-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={12} strokeWidth={3} className={isIndexing ? "animate-spin" : ""} />
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="mb-2 ml-4 border-l-[var(--border-width)] border-dashed border-[var(--border)] pl-2">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              draggingNodeId={draggingNodeId}
              dragOverNodeId={dragOverNodeId}
              onSelect={onSelect}
              onRenameNode={onRenameNode}
              onDragStart={onDragStart}
              onDragHover={onDragHover}
              onDragEnd={onDragEnd}
              onDropToNode={onDropToNode}
              onRebuildIndex={onRebuildIndex}
              rebuildingNodeId={rebuildingNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeTreeBrowser({
  kbs,
  selectedKb,
  tree,
  selectedNodeId,
  draggingNodeId,
  dragOverNodeId,
  dragOverRoot,
  onKbChange,
  onAddNode,
  onAddDocument,
  onSelectNode,
  onRenameNode,
  onDragStart,
  onDragHover,
  onDragEnd,
  onDropToNode,
  onRebuildIndex,
  rebuildingNodeId,
  onRootDragOver,
  onRootDragLeave,
  onDropRoot,
}: {
  kbs: KnowledgeBase[];
  selectedKb: string;
  tree: TreeNode[];
  selectedNodeId: string | null;
  draggingNodeId: string | null;
  dragOverNodeId: string | null;
  dragOverRoot: boolean;
  onKbChange: (value: string) => void;
  onAddNode: () => void;
  onAddDocument: () => void;
  onSelectNode: (node: TreeNode) => void;
  onRenameNode: (node: TreeNode, nextName: string) => Promise<void>;
  onDragStart: (node: TreeNode) => void;
  onDragHover: (node: TreeNode) => void;
  onDragEnd: () => void;
  onDropToNode: (targetNode: TreeNode) => void;
  onRebuildIndex: (node: TreeNode) => void;
  rebuildingNodeId: string | null;
  onRootDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onRootDragLeave: () => void;
  onDropRoot: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const treeContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const container = treeContainerRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-node-id="${selectedNodeId}"]`);
    if (!container || !target) {
      return;
    }

    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;
    const targetTop = target.offsetTop;
    const targetBottom = targetTop + target.offsetHeight;

    if (targetTop < visibleTop) {
      container.scrollTop = targetTop;
      return;
    }
    if (targetBottom > visibleBottom) {
      container.scrollTop = targetBottom - container.clientHeight;
    }
  }, [selectedNodeId]);

  return (
    <section className="flex min-h-0 flex-col bg-[var(--bg-card)]">
      <div className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <label className="mb-2 block font-sans text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
          目标知识库
        </label>
        <ConsoleSelect
          value={selectedKb}
          onChange={(event) => onKbChange(event.target.value)}
        >
          {kbs.map((kb) => (
            <option 
              key={kb.id} 
              value={kb.id}
              className="bg-[var(--bg-card)] text-[var(--text-primary)] font-bold"
            >
              {kb.name}
            </option>
          ))}
        </ConsoleSelect>
      </div>

      <div className="flex gap-2 border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-3">
        <ConsoleButton
          type="button"
          aria-label="打开新建节点弹窗"
          onClick={onAddNode}
          className="flex-1 justify-center px-3 py-2 text-[10px]"
        >
          <Plus size={12} strokeWidth={3} /> 新建节点
        </ConsoleButton>
        <ConsoleButton
          type="button"
          aria-label="打开新建文档弹窗"
          onClick={onAddDocument}
          className="flex-1 justify-center px-3 py-2 text-[10px]"
          tone="neutral"
        >
          <FileText size={12} strokeWidth={3} /> 新建文档
        </ConsoleButton>
      </div>

      <div ref={treeContainerRef} className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div
          className={`mb-3 border-[var(--border-width)] border-dashed px-3 py-2 text-center font-sans text-[10px] font-black uppercase transition-all ${
            dragOverRoot
              ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--text-primary)]"
              : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
          }`}
          onDragOver={onRootDragOver}
          onDragLeave={onRootDragLeave}
          onDrop={onDropRoot}
        >
          将节点拖到此处可移动到根目录
        </div>
        {tree.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[var(--text-muted)]">
            <Search size={42} strokeWidth={1.5} className="mb-4" />
            <p className="font-sans text-xs font-black uppercase tracking-widest">暂无节点数据</p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={0}
              selected={selectedNodeId}
              draggingNodeId={draggingNodeId}
              dragOverNodeId={dragOverNodeId}
              onSelect={onSelectNode}
              onRenameNode={onRenameNode}
              onDragStart={onDragStart}
              onDragHover={onDragHover}
              onDragEnd={onDragEnd}
              onDropToNode={onDropToNode}
              onRebuildIndex={onRebuildIndex}
              rebuildingNodeId={rebuildingNodeId}
            />
          ))
        )}
      </div>
    </section>
  );
}
