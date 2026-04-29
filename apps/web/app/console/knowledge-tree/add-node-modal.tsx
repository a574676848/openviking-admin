"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ConsoleSelect } from "@/components/console/primitives";
import type { TreeNode } from "./knowledge-tree.types";

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, parentId: string | null) => void;
  tree: TreeNode[];
  defaultParentId: string | null;
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

export function AddNodeModal({ isOpen, onClose, onSubmit, tree, defaultParentId, submitting }: AddNodeModalProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("__ROOT__");
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setParentId(defaultParentId ?? "__ROOT__");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultParentId]);

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
    onSubmit(name.trim(), parentId === "__ROOT__" ? null : parentId);
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
            <h2 id="add-node-title" className="font-mono text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
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
              <label className="mb-1.5 block font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
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
              <label className="mb-1.5 block font-mono text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                父级节点
              </label>
              <ConsoleSelect
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="__ROOT__" className="bg-[var(--bg-card)] text-[var(--text-primary)] font-bold">根目录</option>
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
              className="px-5 py-2 font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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
