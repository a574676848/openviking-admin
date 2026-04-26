"use client";

import { AlertTriangle, DatabaseZap } from "lucide-react";
import { PIPELINE_STEPS } from "./knowledge-tree.utils";
import type { TreeNode } from "./knowledge-tree.types";

export function KnowledgeTreeInspector({
  selectedNode,
  detailCards,
  onSelectNode,
}: {
  selectedNode: TreeNode | null;
  detailCards: Array<{ label: string; value: string; className: string; full?: boolean }>;
  onSelectNode: (node: TreeNode) => void;
}) {
  return (
    <section className="hidden-scrollbar min-h-0 overflow-y-auto bg-[var(--bg-base)] p-6">
      <div className="mb-6 flex items-center justify-between border-b-[var(--border-width)] border-[var(--border)] pb-4">
        <h2 className="font-mono text-sm font-black uppercase tracking-[0.2em] text-[var(--text-primary)]">
          {selectedNode ? `节点观察器 [${selectedNode.name}]` : "// 等待选择节点"}
        </h2>
        {selectedNode && (
          <div className="flex gap-2">
            {PIPELINE_STEPS.map((step) => (
              <div key={step} className="flex items-center gap-1.5 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5">
                <div className="h-2 w-2 animate-pulse bg-[var(--success)]" />
                <span className="font-mono text-[9px] font-black">{step}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selectedNode ? (
        <div className="flex h-[60vh] flex-col items-center justify-center border-[var(--border-width)] border-dashed border-[var(--border)] bg-[var(--bg-card)] text-center">
          <AlertTriangle size={72} strokeWidth={1.5} className="mb-6 text-[var(--text-muted)]" />
          <h3 className="font-sans text-3xl font-black tracking-tighter">选择一个知识节点</h3>
          <p className="mt-3 max-w-md font-mono text-xs font-bold leading-6 text-[var(--text-secondary)]">
            左侧知识树用于定位节点，右侧面板用于调整权限与资源挂载。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-base)]">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-[var(--brand)]">
                  {selectedNode.path || "/"}
                </div>
                <h3 className="font-sans text-5xl font-black tracking-tighter text-[var(--text-primary)]">
                  {selectedNode.name}
                </h3>
              </div>
              <DatabaseZap size={48} strokeWidth={1.5} className="text-[var(--brand)]" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {detailCards.map((item) => (
                <div key={item.label} className={`border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-base)] ${item.full ? "md:col-span-2" : ""}`}>
                  <div className="mb-1 font-mono text-[9px] font-black uppercase text-[var(--text-muted)]">{item.label}</div>
                  <div className={`truncate font-mono text-xs font-black ${item.className}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {selectedNode.children.length > 0 && (
            <div className="overflow-hidden border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)]">
              <div className="flex justify-between bg-[var(--text-primary)] p-3 font-mono text-[10px] font-black uppercase text-[var(--bg-card)]">
                <span>子节点列表</span>
                <span>COUNT: {selectedNode.children.length}</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {selectedNode.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    aria-label={`查看子节点 ${child.name}`}
                    title={`查看子节点 ${child.name}`}
                    onClick={() => onSelectNode(child)}
                    className="group flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--brand-muted)]"
                  >
                    <span className="font-black text-[var(--brand)] transition-transform group-hover:translate-x-1">&gt;&gt;</span>
                    <span className="font-mono text-sm font-black uppercase">{child.name}</span>
                    <span className="ml-auto font-mono text-[10px] opacity-40">ID: {child.id.substring(0, 8)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
