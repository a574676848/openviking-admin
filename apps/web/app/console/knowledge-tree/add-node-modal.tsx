"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FolderTree, X } from "lucide-react";
import { ConsoleSelect } from "@/components/console/primitives";
import type { TreeNode } from "./knowledge-tree.types";
import {
  type KnowledgeNodeKind,
  KNOWLEDGE_NODE_DEFAULT_KIND,
  KNOWLEDGE_NODE_KIND_COLLECTION,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
  KNOWLEDGE_TREE_ROOT_PARENT_VALUE,
} from "./knowledge-tree.constants";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, parentId: string | null, kind: KnowledgeNodeKind) => void;
  tree: TreeNode[];
  defaultParentId: string | null;
  defaultKind: KnowledgeNodeKind;
  submitting: boolean;
}

function flattenTree(nodes: TreeNode[], depth = 0): { node: TreeNode; depth: number }[] {
  const result: { node: TreeNode; depth: number }[] = [];
  for (const n of nodes) {
    result.push({ node: n, depth });
    if (n.children.length > 0) {
      result.push(...flattenTree(n.children, depth + 1));
    }
  }
  return result;
}

export function AddNodeModal({
  isOpen,
  onClose,
  onSubmit,
  tree,
  defaultParentId,
  defaultKind,
  submitting,
}: AddNodeModalProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(KNOWLEDGE_TREE_ROOT_PARENT_VALUE);
  const [nodeKind, setNodeKind] = useState<KnowledgeNodeKind>(KNOWLEDGE_NODE_DEFAULT_KIND);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setParentId(defaultParentId ?? KNOWLEDGE_TREE_ROOT_PARENT_VALUE);
      setNodeKind(defaultKind);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultParentId, defaultKind]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const flatTree = flattenTree(tree);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(
      name.trim(),
      parentId === KNOWLEDGE_TREE_ROOT_PARENT_VALUE ? null : parentId,
      nodeKind,
    );
  }

  function typeButtonClass(kind: KnowledgeNodeKind) {
    const isActive = nodeKind === kind;
    return `flex min-h-16 items-center gap-3 border-[var(--border-width)] px-4 py-3 text-left font-sans transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${
      isActive
        ? "border-[var(--brand)] bg-[var(--brand-muted)] text-[var(--text-primary)] shadow-[var(--shadow-base)]"
        : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--text-primary)]"
    }`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div className="relative w-full max-w-lg animate-in slide-in-from-bottom-4">
        <form
          onSubmit={handleSubmit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-node-title"
          className="bg-[var(--bg-card)] border border-[var(--border)] shadow-xl rounded-[var(--radius-base)] overflow-hidden"
        >
          {/* 弹窗头部 */}
          <div className="flex items-center justify-between border-b-[var(--border-width)] border-[var(--border)] px-6 py-4">
            <h2 id="add-node-title" className="font-sans text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
              新建知识节点
            </h2>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="关闭弹窗"
              className="p-1.5 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            >
              <X size={16} strokeWidth={3} />
            </button>
          </div>

          {/* 弹窗主体 */}
          <div className="space-y-5 p-6">
            <div>
              <label className="mb-1.5 block font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                节点类型
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={nodeKind === KNOWLEDGE_NODE_KIND_COLLECTION}
                  onClick={() => setNodeKind(KNOWLEDGE_NODE_KIND_COLLECTION)}
                  className={typeButtonClass(KNOWLEDGE_NODE_KIND_COLLECTION)}
                >
                  <FolderTree size={18} strokeWidth={2} />
                  <span className="min-w-0">
                    <span className="block text-xs font-black">目录节点</span>
                    <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      组织层级
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={nodeKind === KNOWLEDGE_NODE_KIND_DOCUMENT}
                  onClick={() => setNodeKind(KNOWLEDGE_NODE_KIND_DOCUMENT)}
                  className={typeButtonClass(KNOWLEDGE_NODE_KIND_DOCUMENT)}
                >
                  <FileText size={18} strokeWidth={2} />
                  <span className="min-w-0">
                    <span className="block text-xs font-black">文档节点</span>
                    <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      协作编辑
                    </span>
                  </span>
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                节点名称
              </label>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入节点名称"
                className="ov-input px-4 py-2.5 text-sm font-bold"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                父级节点
              </label>
              <ConsoleSelect
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value={KNOWLEDGE_TREE_ROOT_PARENT_VALUE} className="bg-[var(--bg-card)] text-[var(--text-primary)] font-bold">根目录</option>
                {flatTree.map(({ node, depth }) => (
                  <option 
                    key={node.id} 
                    value={node.id}
                    className="bg-[var(--bg-card)] text-[var(--text-primary)] font-bold"
                  >
                    {"— ".repeat(depth)}{node.name}
                  </option>
                ))}
              </ConsoleSelect>
            </div>
          </div>

          {/* 弹窗底部操作栏 */}
          <div className="flex justify-end gap-3 border-t-[var(--border-width)] border-[var(--border)] px-6 py-4">
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="px-5 py-2 font-sans text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="ov-button px-6 py-2 text-[11px] uppercase tracking-widest"
            >
              {submitting ? "创建中..." : "确认创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
