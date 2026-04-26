"use client";

import { ChevronDown, ChevronRight, FolderTree, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ConsoleButton, ConsoleSelectionCard } from "@/components/console/primitives";
import type { KnowledgeBase, TreeNode } from "./knowledge-tree.types";

function TreeItem({
  node,
  depth,
  selected,
  draggingNodeId,
  dragOverNodeId,
  onSelect,
  onDragStart,
  onDragHover,
  onDragEnd,
  onDropToNode,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  draggingNodeId: string | null;
  dragOverNodeId: string | null;
  onSelect: (node: TreeNode) => void;
  onDragStart: (node: TreeNode) => void;
  onDragHover: (node: TreeNode) => void;
  onDragEnd: () => void;
  onDropToNode: (targetNode: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selected === node.id;
  const isDragging = draggingNodeId === node.id;
  const isDragOver = dragOverNodeId === node.id;

  return (
    <div className="font-mono text-[11px] tracking-widest">
      <div
        draggable
        className={`mb-1 flex w-full items-center gap-2 border-[var(--border-width)] px-3 py-2.5 transition-all ${
          isSelected
            ? "translate-x-2 border-[var(--border)] bg-[var(--text-primary)] text-[var(--bg-card)] shadow-[var(--shadow-base)]"
            : "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)] hover:translate-x-1 hover:border-[var(--border)]"
        } ${isDragOver ? "border-[var(--brand)] bg-[var(--brand-muted)]" : ""} ${
          isDragging ? "opacity-40" : ""
        }`}
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
          onClick={(event) => {
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
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          <FolderTree size={14} className={isSelected ? "text-[var(--brand)]" : "text-[var(--text-primary)]"} />
          <span className="min-w-0 flex-1 truncate font-black uppercase">{node.name}</span>
        </button>
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
              onDragStart={onDragStart}
              onDragHover={onDragHover}
              onDragEnd={onDragEnd}
              onDropToNode={onDropToNode}
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
  loading,
  showForm,
  newName,
  submitting,
  draggingNodeId,
  dragOverNodeId,
  dragOverRoot,
  onKbChange,
  onToggleForm,
  onNewNameChange,
  onCreate,
  onCancelCreate,
  onRefresh,
  onSelectNode,
  onDragStart,
  onDragHover,
  onDragEnd,
  onDropToNode,
  onRootDragOver,
  onRootDragLeave,
  onDropRoot,
}: {
  kbs: KnowledgeBase[];
  selectedKb: string;
  tree: TreeNode[];
  selectedNodeId: string | null;
  loading: boolean;
  showForm: boolean;
  newName: string;
  submitting: boolean;
  draggingNodeId: string | null;
  dragOverNodeId: string | null;
  dragOverRoot: boolean;
  onKbChange: (value: string) => void;
  onToggleForm: () => void;
  onNewNameChange: (value: string) => void;
  onCreate: (event: React.FormEvent) => void;
  onCancelCreate: () => void;
  onRefresh: () => void;
  onSelectNode: (node: TreeNode) => void;
  onDragStart: (node: TreeNode) => void;
  onDragHover: (node: TreeNode) => void;
  onDragEnd: () => void;
  onDropToNode: (targetNode: TreeNode) => void;
  onRootDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onRootDragLeave: () => void;
  onDropRoot: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col bg-[var(--bg-card)]">
      <div className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <label className="mb-2 block font-mono text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
          目标知识库
        </label>
        <select
          value={selectedKb}
          onChange={(event) => onKbChange(event.target.value)}
          className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs font-bold uppercase outline-none"
        >
          {kbs.map((kb) => (
            <option key={kb.id} value={kb.id}>{kb.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-3">
        <ConsoleButton
          type="button"
          aria-label={showForm ? "收起新建节点表单" : "打开新建节点表单"}
          onClick={onToggleForm}
          className="flex-1 justify-center px-3 py-2 text-[10px]"
        >
          <Plus size={12} strokeWidth={3} /> 新建节点
        </ConsoleButton>
      </div>

      {showForm && (
        <form onSubmit={onCreate} className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--warning)] p-3">
          <input
            autoFocus
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
            placeholder="输入节点名称"
            className="mb-2 w-full border-[var(--border-width)] border-[var(--border)] px-3 py-2 font-mono text-[10px] font-bold outline-none"
          />
          <div className="flex gap-2">
            <ConsoleButton
              type="submit"
              disabled={submitting}
              tone="dark"
              className="flex-1 justify-center px-3 py-1.5 text-[9px]"
            >
              {submitting ? "创建中" : "提交创建"}
            </ConsoleButton>
            <ConsoleSelectionCard
              type="button"
              aria-label="取消新建节点"
              onClick={onCancelCreate}
              className="px-3 py-1.5 text-[9px] shadow-none"
            >
              取消
            </ConsoleSelectionCard>
          </div>
        </form>
      )}

      <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div
          className={`mb-3 border-[var(--border-width)] border-dashed px-3 py-2 text-center font-mono text-[10px] font-black uppercase transition-all ${
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
            <p className="font-mono text-xs font-black uppercase tracking-widest">暂无节点数据</p>
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
              onDragStart={onDragStart}
              onDragHover={onDragHover}
              onDragEnd={onDragEnd}
              onDropToNode={onDropToNode}
            />
          ))
        )}
      </div>
    </section>
  );
}
