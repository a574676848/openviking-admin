"use client";

import { AlertTriangle } from "lucide-react";
import { KnowledgeTreeEditor } from "./knowledge-tree-editor";
import { PIPELINE_STEPS } from "./knowledge-tree.utils";
import type { KnowledgeAcl, TenantUserOption, TreeNode } from "./knowledge-tree.types";

export function KnowledgeTreeInspector({
  selectedNode,
  detailCards,
  editAcl,
  tenantUsers,
  tenantUsersLoading,
  tenantUsersError,
  saving,
  onEditAclChange,
  onSave,
  onDelete,
}: {
  selectedNode: TreeNode | null;
  detailCards: Array<{ label: string; value?: string; lines?: string[]; className: string; full?: boolean }>;
  editAcl: KnowledgeAcl;
  tenantUsers: TenantUserOption[];
  tenantUsersLoading: boolean;
  tenantUsersError: string;
  saving: boolean;
  onEditAclChange: (acl: KnowledgeAcl) => void;
  onSave: () => void;
  onDelete: () => void;
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
            左侧知识树用于定位节点，当前工作区会在这里显示节点详情、权限与资源挂载。
          </p>
        </div>
      ) : (
        <div>
          <div className="ov-card p-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {detailCards.map((item) => (
                <div
                  key={item.label}
                  className={`border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-base)] ${item.full ? "md:col-span-2" : ""}`}
                >
                  <div className="mb-1 font-mono text-[9px] font-black uppercase text-[var(--text-muted)]">{item.label}</div>
                  {item.lines ? (
                    <div className="space-y-1">
                      {item.lines.map((line) => (
                        <p key={line} className={`font-mono text-xs font-black leading-5 ${item.className}`}>
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className={`truncate font-mono text-xs font-black ${item.className}`}>{item.value}</div>
                  )}
                </div>
              ))}
              <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-base)] md:col-span-2">
                <div className="mb-4 font-mono text-[9px] font-black uppercase text-[var(--text-muted)]">访问权限控制 ACL</div>

                <KnowledgeTreeEditor
                  editAcl={editAcl}
                  tenantUsers={tenantUsers}
                  tenantUsersLoading={tenantUsersLoading}
                  tenantUsersError={tenantUsersError}
                  saving={saving}
                  onEditAclChange={onEditAclChange}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
