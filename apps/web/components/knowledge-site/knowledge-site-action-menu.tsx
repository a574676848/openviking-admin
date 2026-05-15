"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, PencilLine, Shield, Trash2 } from "lucide-react";
import type { KnowledgeSiteTreeNode } from "./knowledge-site-shell";
import { ShellPanel } from "@/components/ui/shell-primitives";
import { useApp } from "@/components/app-provider";

export interface NodeActionMenuProps {
  node: KnowledgeSiteTreeNode;
  onRename: () => void;
  onPermission: () => void;
  onDelete: () => void;
}

export function NodeActionMenu({
  node,
  onRename,
  onPermission,
  onDelete,
}: NodeActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useApp();

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        type="button"
        className={`flex h-6 w-6 items-center justify-center rounded-[var(--radius-tile)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${
          open ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="更多操作"
      >
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>

      {open && (
        <ShellPanel
          theme={theme}
          variant="popover"
          className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden p-1"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            <PencilLine size={14} />
            重命名
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onPermission();
            }}
          >
            <Shield size={14} />
            权限设置
          </button>
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[var(--radius-tile)] px-2 py-1.5 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={14} />
            删除
          </button>
        </ShellPanel>
      )}
    </div>
  );
}
