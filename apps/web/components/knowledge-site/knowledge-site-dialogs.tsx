"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormModal } from "@/components/ui/FormModal";
import { apiClient } from "@/lib/apiClient";
import {
  type KnowledgeSiteAcl,
  type TenantUserOption,
  cloneKnowledgeSiteAcl,
  knowledgeSiteRoleLabel,
  KNOWLEDGE_SITE_ACL_ROLES,
} from "./knowledge-site-admin-utils";
import type { KnowledgeSiteTreeNode } from "./knowledge-site-shell";
import { Shield } from "lucide-react";
import { ConsoleMultiSelect } from "../console/forms";

export interface NodeRenameDialogProps {
  node: KnowledgeSiteTreeNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export function NodeRenameDialog({
  node,
  open,
  onOpenChange,
  onSuccess,
}: NodeRenameDialogProps) {
  const [renameName, setRenameName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && node) {
      // 如果是文档，隐藏后缀名进行编辑
      const displayName = node.kind === "document" 
        ? node.name.replace(/\.md$/, "") 
        : node.name;
      setRenameName(displayName);
    }
  }, [open, node]);

  async function handleRenameSubmit() {
    if (!node) return;
    const nextName = renameName.trim();
    if (!nextName) {
      toast.error("名称不能为空");
      return;
    }

    setSaving(true);
    try {
      // 如果是文档，自动补充 .md 后缀
      const finalName = node.kind === "document" && !nextName.endsWith(".md")
        ? `${nextName}.md`
        : nextName;

      await apiClient.patch(`/knowledge-tree/${node.id}`, {
        name: finalName,
      });
      await onSuccess();
      toast.success("基本信息已保存");
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="重命名"
      saveText="保存"
      savingText="保存中..."
      saving={saving || renameName.trim() === node?.name || !renameName.trim()}
      onSubmit={(e) => {
        e.preventDefault();
        void handleRenameSubmit();
      }}
    >
      <div className="space-y-4 pt-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
            显示名称
          </label>
          <input
            value={renameName}
            onChange={(event) => setRenameName(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm outline-none transition-colors focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/50"
            placeholder="请输入名称"
            autoFocus
          />
        </div>
      </div>
    </FormModal>
  );
}

export interface NodePermissionDialogProps {
  node: KnowledgeSiteTreeNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export function NodePermissionDialog({
  node,
  open,
  onOpenChange,
  onSuccess,
}: NodePermissionDialogProps) {
  const [editAcl, setEditAcl] = useState<KnowledgeSiteAcl>(cloneKnowledgeSiteAcl(null));
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && node) {
      setEditAcl(cloneKnowledgeSiteAcl(node.acl));
    }
  }, [open, node]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsersLoading(true);
    apiClient
      .get<TenantUserOption[]>("/users")
      .then((list) => {
        if (!cancelled) setTenantUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleAclSave() {
    if (!node) return;
    setSaving(true);
    try {
      await apiClient.patch(`/knowledge-tree/${node.id}`, {
        acl: editAcl,
      });
      await onSuccess();
      toast.success("权限配置已生效");
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "权限保存失败");
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(role: string) {
    setEditAcl((current) => {
      const roles = current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role];
      return { ...current, roles };
    });
  }

  function toggleUser(userId: string) {
    setEditAcl((current) => {
      const users = current.users.includes(userId)
        ? current.users.filter((id) => id !== userId)
        : [...current.users, userId];
      return { ...current, users };
    });
  }

  return (
    <FormModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="可见范围与权限"
      saveText="保存配置"
      savingText="保存中..."
      saving={saving}
      onSubmit={(e) => {
        e.preventDefault();
        void handleAclSave();
      }}
    >
      <div className="space-y-5 pt-4">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold text-[var(--text-primary)]">全员公开</div>
            <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              开启后，团队所有人均可查阅此内容。若关闭，则需要针对下方指定的角色或具体成员进行授权。
            </div>
          </div>
          <div className="pt-0.5">
            <input
              type="checkbox"
              checked={editAcl.isPublic}
              onChange={(e) =>
                setEditAcl((current) => ({
                  ...current,
                  isPublic: e.target.checked,
                }))
              }
              className="relative h-5 w-9 cursor-pointer appearance-none rounded-full bg-[var(--border)] transition-colors checked:bg-[var(--brand)] before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
            />
          </div>
        </label>

        <div className={`space-y-5 border-t border-[var(--border)] pt-5 transition-opacity ${editAcl.isPublic ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
          <div>
            <div className="mb-3 text-xs font-bold text-[var(--text-secondary)]">按系统角色授权</div>
            <div className="grid grid-cols-2 gap-2">
              {KNOWLEDGE_SITE_ACL_ROLES.map((role) => (
                <label
                  key={role}
                  className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-base)] border px-3 py-2 text-sm transition-colors ${
                    editAcl.roles.includes(role)
                      ? "border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]"
                      : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={editAcl.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  <div className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${editAcl.roles.includes(role) ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--text-muted)]"}`}>
                    {editAcl.roles.includes(role) && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </div>
                  {knowledgeSiteRoleLabel(role)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-xs font-bold text-[var(--text-secondary)]">额外授权给特定成员</div>
            <ConsoleMultiSelect
              disabled={usersLoading}
              placeholder={usersLoading ? "正在加载成员列表..." : "搜索并选择成员..."}
              options={tenantUsers.map((user) => ({
                label: user.username,
                value: user.id,
              }))}
              value={editAcl.users}
              onChange={(next) => setEditAcl((curr) => ({ ...curr, users: next }))}
            />
          </div>
        </div>
      </div>
    </FormModal>
  );
}

export interface NodeCreateDialogProps {
  kbId: string;
  parentId: string | null;
  kind: "collection" | "document" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}

export function NodeCreateDialog({
  kbId,
  parentId,
  kind,
  open,
  onOpenChange,
  onSuccess,
}: NodeCreateDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!kind) return;
    const nextName = name.trim();
    if (!nextName) {
      toast.error("名称不能为空");
      return;
    }

    setSaving(true);
    try {
      await apiClient.post("/knowledge-tree", {
        kbId,
        parentId,
        name: nextName,
        kind,
      });
      await onSuccess();
      toast.success(kind === "document" ? "文档已创建" : "目录已创建");
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  const title = kind === "document" ? "新建文档" : "新增目录";
  const placeholder = kind === "document" ? "例如：版本发布记录" : "例如：研发规范";

  return (
    <FormModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={title}
      saveText="创建"
      savingText="创建中..."
      saving={saving || !name.trim()}
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="space-y-4 pt-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
            名称
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm outline-none transition-colors focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/50"
            placeholder={placeholder}
            autoFocus
          />
        </div>
      </div>
    </FormModal>
  );
}
