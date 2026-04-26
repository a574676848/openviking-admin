"use client";

import { TerminalSquare, Trash2 } from "lucide-react";
import { ConsoleButton, ConsoleSelectionCard } from "@/components/console/primitives";
import { ACL_ROLES, roleLabel } from "./knowledge-tree.utils";
import type { KnowledgeAcl, KnowledgeNode } from "./knowledge-tree.types";

export function KnowledgeTreeEditor({
  selectedNode,
  editName,
  editUri,
  editAcl,
  moveParentId,
  moveCandidates,
  permissionPreview,
  saving,
  moving,
  onEditNameChange,
  onEditUriChange,
  onEditAclChange,
  onMoveParentChange,
  onToggleRole,
  onMove,
  onSave,
  onDelete,
}: {
  selectedNode: KnowledgeNode;
  editName: string;
  editUri: string;
  editAcl: KnowledgeAcl;
  moveParentId: string;
  moveCandidates: KnowledgeNode[];
  permissionPreview: string[];
  saving: boolean;
  moving: boolean;
  onEditNameChange: (value: string) => void;
  onEditUriChange: (value: string) => void;
  onEditAclChange: (acl: KnowledgeAcl) => void;
  onMoveParentChange: (value: string) => void;
  onToggleRole: (role: string, checked: boolean) => void;
  onMove: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden bg-[var(--bg-card)] p-6">
      <h3 className="mb-8 flex items-center border-b-[var(--border-width)] border-[var(--border)] pb-2 font-mono text-xs font-black uppercase">
        <TerminalSquare size={16} className="mr-2 text-[var(--brand)]" /> 节点属性与权限
      </h3>
      <div className="hidden-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
        <div className="space-y-2">
          <label className="block font-mono text-[10px] font-black uppercase">显示名称</label>
          <input value={editName} onChange={(event) => onEditNameChange(event.target.value)} className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-sm font-bold outline-none" />
        </div>

        <div className="space-y-3 border-t-[var(--border-width)] border-dashed border-[var(--border)] pt-4">
          <label className="block font-mono text-[10px] font-black uppercase text-[var(--text-secondary)]">访问权限控制 ACL</label>
          <div className="flex gap-2">
            <ConsoleSelectionCard
              type="button"
              onClick={() => onEditAclChange({ ...editAcl, isPublic: true })}
              active={editAcl.isPublic}
              className={`flex-1 py-2 text-center text-[10px] shadow-none ${
                editAcl.isPublic ? "bg-[var(--success)] shadow-[var(--shadow-base)]" : ""
              }`}
            >
              公开
            </ConsoleSelectionCard>
            <ConsoleSelectionCard
              type="button"
              onClick={() => onEditAclChange({ ...editAcl, isPublic: false })}
              active={!editAcl.isPublic}
              className="flex-1 py-2 text-center text-[10px] shadow-none"
            >
              私有
            </ConsoleSelectionCard>
          </div>
          {!editAcl.isPublic && (
            <div className="space-y-3 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <label className="block font-mono text-[8px] font-black uppercase">授权角色</label>
              <div className="flex flex-wrap gap-2">
                {ACL_ROLES.map((role) => (
                  <label key={role} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editAcl.roles?.includes(role)}
                      onChange={(event) => onToggleRole(role, event.target.checked)}
                      className="h-3 w-3 appearance-none border-2 border-[var(--border)] checked:bg-[var(--brand)]"
                    />
                    <span className="font-mono text-[9px] font-bold uppercase">{roleLabel(role)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block font-mono text-[10px] font-black uppercase">引擎资源 URI</label>
          <input value={editUri} onChange={(event) => onEditUriChange(event.target.value)} placeholder="viking://..." className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-xs font-bold outline-none" />
        </div>

        <div className="space-y-3 border-t-[var(--border-width)] border-dashed border-[var(--border)] pt-4">
          <label className="block font-mono text-[10px] font-black uppercase text-[var(--text-secondary)]">访问预览</label>
          <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            {permissionPreview.map((line) => (
              <p key={line} className="font-mono text-[10px] font-bold leading-5 text-[var(--text-secondary)]">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t-[var(--border-width)] border-dashed border-[var(--border)] pt-4">
          <label className="block font-mono text-[10px] font-black uppercase text-[var(--text-secondary)]">结构调整</label>
          <select
            value={moveParentId}
            onChange={(event) => onMoveParentChange(event.target.value)}
            className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[10px] font-bold uppercase outline-none"
          >
            <option value="__KEEP__">保持当前位置</option>
            <option value="__ROOT__">移动到根目录</option>
            {moveCandidates.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
          <p className="font-mono text-[10px] font-bold leading-5 text-[var(--text-secondary)]">
            可直接拖拽左侧节点完成调整，提交前会再次确认，避免误操作导致路径和权限继承关系变化。
          </p>
          <ConsoleButton
            type="button"
            onClick={onMove}
            disabled={moving}
            tone="warning"
            className="w-full justify-center py-3 text-[10px]"
          >
            {moving ? "移动中" : "调整节点位置"}
          </ConsoleButton>
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <ConsoleButton
          type="button"
          onClick={onSave}
          disabled={saving}
          tone="dark"
          className="w-full justify-center py-4 text-xs"
        >
          {saving ? "提交中" : "应用变更"}
        </ConsoleButton>
        <ConsoleButton
          type="button"
          onClick={onDelete}
          tone="danger"
          className="w-full justify-center py-3 text-[10px]"
        >
          <Trash2 size={14} strokeWidth={2} /> 删除节点
        </ConsoleButton>
      </div>
    </aside>
  );
}
