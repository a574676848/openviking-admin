"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, ShieldAlert, Edit2, Lock, Trash2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useApp } from "@/components/app-provider";
import { FormModal } from "@/components/ui/FormModal";
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import {
  PlatformActionMenu,
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformSelect,
  PlatformStateBadge,
  PlatformStatPill,
} from "@/components/ui/platform-primitives";

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string;
  active: boolean;
  createdAt: string;
}

const ROLE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  tenant_admin:    { label: "租户管理员", color: "var(--brand)", bg: "bg-[var(--brand)]/10" },
  tenant_operator: { label: "业务操作员", color: "var(--warning)", bg: "bg-[var(--warning)]/10" },
  tenant_viewer:   { label: "只读观察员", color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" },
};

export default function UsersPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { user: currentUser } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "tenant_viewer",
  });

  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // 重置密码弹窗状态
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiClient.get<User[]>("/users");
      setUsers(Array.isArray(response) ? response : []);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "成员列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const stats = useMemo(() => {
    return {
      active: users.filter((user) => user.active).length,
      disabled: users.filter((user) => !user.active).length,
      admins: users.filter((user) => user.role === "tenant_admin").length,
    };
  }, [users]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiClient.post("/users", form);
      setForm({ username: "", password: "", role: "tenant_viewer" });
      setShowCreate(false);
      await load();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "账号创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: User) {
    if (currentUser?.id === user.id) {
      return;
    }
    await apiClient.patch(`/users/${user.id}`, { active: !user.active });
    await load();
  }

  async function handleDelete(id: string, username: string) {
    if (currentUser?.id === id) {
      return;
    }
    const approved = await confirm({
      title: "注销成员账号",
      description: `将永久注销「${username}」，该账号会失去当前租户的所有访问能力。`,
      confirmText: "注销账号",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) return;
    await apiClient.delete(`/users/${id}`);
    await load();
  }

  function openEdit(user: User) {
    setEditTarget(user);
    setEditForm({ role: user.role });
    setEditError("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSubmitting(true);
    setEditError("");

    try {
      await apiClient.patch(`/users/${editTarget.id}`, { role: editForm.role });
      setEditTarget(null);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "更新成员失败");
    } finally {
      setEditSubmitting(false);
    }
  }

  function openResetPassword(user: User) {
    setResetTarget(user);
    setResetPassword("");
    setResetConfirm("");
    setResetError("");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;

    if (resetPassword !== resetConfirm) {
      setResetError("两次输入的密码不一致");
      return;
    }

    setResetSubmitting(true);
    setResetError("");

    try {
      await apiClient.patch(`/users/${resetTarget.id}`, { password: resetPassword });
      setResetTarget(null);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "密码重置失败");
    } finally {
      setResetSubmitting(false);
    }
  }

  const columns: ColumnDef<User>[] = [
    {
      key: "username",
      header: "成员",
      searchable: true,
      searchValue: (u) => u.username,
      sortable: true,
      sortValue: (u) => u.username,
      cell: (u) => (
        <div className="flex items-center font-mono text-sm font-bold text-[var(--text-primary)]">
          <KeyRound size={14} className="mr-2 text-[var(--text-muted)] group-hover:scale-110 transition-transform" />
          {u.username}
        </div>
      ),
    },
    {
      key: "role",
      header: "角色",
      searchable: true,
      searchValue: (u) => ROLE_MAP[u.role]?.label ?? u.role,
      sortable: true,
      sortValue: (u) => ROLE_MAP[u.role]?.label ?? u.role,
      cell: (u) => {
        const r = ROLE_MAP[u.role] ?? { label: u.role, color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" };
        const tone =
          r.color === "var(--brand)"
            ? "brand"
            : r.color === "var(--warning)"
              ? "warning"
              : "muted";
        return (
          <PlatformStateBadge tone={tone} className={r.bg}>
            [{r.label}]
          </PlatformStateBadge>
        );
      },
    },
    {
      key: "status",
      header: "状态",
      searchable: true,
      searchValue: (u) => (u.active ? "启用中" : "已停用"),
      sortable: true,
      sortValue: (u) => u.active,
      cell: (u) => (
        <PlatformStateBadge tone={u.active ? "success" : "danger"}>
          {u.active ? "启用中" : "已停用"}
        </PlatformStateBadge>
      ),
    },
    {
      key: "createdAt",
      header: "创建时间",
      sortable: true,
      sortValue: (u) => u.createdAt,
      cell: (u) => (
        <span className="font-mono text-[10px] tracking-widest text-[var(--text-secondary)]">
          {new Date(u.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      headerClassName: "w-[240px] text-right",
      cellClassName: "w-[240px] text-right",
      cell: (u) => {
        const isSelf = currentUser?.id === u.id;
        return (
          <div className="flex items-center justify-end gap-2">
            <PlatformButton
              type="button"
              disabled={isSelf}
              aria-label={u.active ? `禁用成员 ${u.username}` : `启用成员 ${u.username}`}
              title={isSelf ? "不能停用当前登录账号" : (u.active ? `禁用成员 ${u.username}` : `启用成员 ${u.username}`)}
              onClick={() => void toggleActive(u)}
              className="h-9 px-3"
            >
              {u.active ? "停用账号" : "激活账号"}
            </PlatformButton>

            <PlatformActionMenu
              items={[
                {
                  label: "编辑",
                  icon: <Edit2 size={14} />,
                  onClick: () => openEdit(u),
                },
                {
                  label: "重置密码",
                  icon: <Lock size={14} />,
                  onClick: () => openResetPassword(u),
                },
                {
                  label: "删除成员",
                  icon: <Trash2 size={14} />,
                  onClick: () => handleDelete(u.id, u.username),
                  tone: "danger",
                  disabled: isSelf,
                },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-full flex-col pb-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-6 border-b-[var(--border-width)] border-[var(--border)] pb-6 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-4 font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            成员权限管理
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">统一管理租户成员、角色与访问状态</p>
        </div>
        <div className="flex items-center gap-4">
          <PlatformButton
            type="button"
            onClick={() => router.push("/console/capability")}
            className="px-6 py-3 text-xs"
          >
            <KeyRound size={16} strokeWidth={2} />
            <span className="font-mono font-bold tracking-widest uppercase">前往凭证中心</span>
          </PlatformButton>
          <PlatformButton
            type="button"
            onClick={() => { setShowCreate(true); setError(""); }}
            className="ov-button px-6 py-3 text-xs"
          >
            <Plus size={16} strokeWidth={2} />
            <span className="font-mono font-bold tracking-widest uppercase">新增成员</span>
          </PlatformButton>
        </div>
      </div>

      {/* ─── 新增成员弹窗 ─── */}
      <FormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="新增成员"
        saving={submitting}
        saveText="确认创建"
        savingText="创建中..."
      >
        {error && (
          <div className="mb-6 flex items-start gap-3 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 p-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--danger)]">
            <ShieldAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>[创建失败] {error}</span>
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          <PlatformField label="账号 ID *" className="gap-2">
            <PlatformInput
              required
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="e.g. ops_user"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
          <PlatformField label="登录密钥 *" className="gap-2">
            <PlatformInput
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="至少 6 位字符"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
          <PlatformField label="角色范围" className="gap-2">
            <PlatformSelect
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              className="w-full bg-[var(--bg-input)] px-4 py-3 font-bold tracking-widest"
            >
              <option value="tenant_admin">租户管理员</option>
              <option value="tenant_operator">业务操作员</option>
              <option value="tenant_viewer">只读观察员</option>
            </PlatformSelect>
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── 编辑成员弹窗 ─── */}
      <FormModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        title={editTarget ? `编辑成员「${editTarget.username}」` : "编辑成员"}
        saving={editSubmitting}
        saveText="保存修改"
      >
        {editError && (
          <div className="mb-6 flex items-start gap-3 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 p-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--danger)]">
            <ShieldAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>[更新失败] {editError}</span>
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <PlatformField label="角色范围" className="gap-2">
            <PlatformSelect
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              className="w-full bg-[var(--bg-input)] px-4 py-3 font-bold tracking-widest"
            >
              <option value="tenant_admin">租户管理员</option>
              <option value="tenant_operator">业务操作员</option>
              <option value="tenant_viewer">只读观察员</option>
            </PlatformSelect>
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── 重置密码弹窗 ─── */}
      <FormModal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={handleResetPassword}
        title={resetTarget ? `重置「${resetTarget.username}」密码` : "重置密码"}
        saving={resetSubmitting}
        saveText="确认重置"
      >
        {resetError && (
          <div className="mb-6 flex items-start gap-3 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 p-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--danger)]">
            <ShieldAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>[重置失败] {resetError}</span>
          </div>
        )}

        <div className="mb-6 space-y-4">
          <PlatformField label="新登录密钥 *" className="gap-2">
            <PlatformInput
              type="password"
              required
              minLength={6}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="至少 6 位字符"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
          <PlatformField label="确认新密钥 *" className="gap-2">
            <PlatformInput
              type="password"
              required
              minLength={6}
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="再次输入新密码"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── 成员列表 ─── */}
      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        loadingMessage="正在同步成员列表..."
        errorMessage={loadError ? `成员列表加载失败：${loadError}` : undefined}
        emptyMessage="当前还没有租户成员"
        tableLabel="租户成员列表"
        searchConfig={{ placeholder: "搜索成员 / 角色..." }}
        className="flex-1 mt-4"
      />

      {/* ─── 底部统计 ─── */}
      {!loading && users.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono font-black tracking-widest uppercase">
          <PlatformStatPill label="成员总数" value={users.length} accent="var(--border)" />
          <PlatformStatPill label="管理员" value={stats.admins} accent="var(--brand)" backgroundClassName="bg-[var(--brand)]/10" />
          <PlatformStatPill label="已禁用" value={stats.disabled} accent="var(--danger)" backgroundClassName="bg-[var(--danger)]/10" />
        </div>
      )}
    </div>
  );
}
