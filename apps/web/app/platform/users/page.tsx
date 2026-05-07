"use client";
import { useEffect, useState, useCallback } from "react";
import { Users, Plus, ShieldAlert, Key, Trash2, Globe, Building2, Edit2, Lock } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/FormModal";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { apiClient } from "@/lib/apiClient";
import { API_ENDPOINTS } from "@/lib/constants";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useApp } from "@/components/app-provider";
import {
  DangerAction,
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPageHeader,
  PlatformSelect,
  PlatformStateBadge,
  PlatformStatPill,
  PlatformActionMenu,
} from "@/components/ui/platform-primitives";

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
  active: boolean;
  createdAt: string;
}

const ROLE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:     { label: "平台所有者", color: "var(--danger)", bg: "bg-[var(--danger)]/10" },
  tenant_admin:    { label: "租户管理员", color: "var(--brand)", bg: "bg-[var(--brand)]/10" },
  tenant_operator: { label: "数据运营", color: "var(--warning)", bg: "bg-[var(--warning)]/10" },
  tenant_viewer:   { label: "只读成员", color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" },
};

const WARNING_BUTTON_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]";
const SUCCESS_BUTTON_FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]";

export default function UsersPage() {
  const confirm = useConfirm();
  const { user: currentUser } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "tenant_viewer", tenantId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [tenants, setTenants] = useState<{ id: string; tenantId: string; displayName: string }[]>([]);

  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "", tenantId: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // 重置密码弹窗状态
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    apiClient.get("/users")
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "平台用户列表加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    apiClient.get(API_ENDPOINTS.TENANTS)
      .then((data) => setTenants(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    
    const payload = {
      ...form,
      tenantId: form.role === "super_admin" ? null : (form.tenantId || null)
    };

    try {
      await apiClient.post("/users", payload);
      setForm({ username: "", password: "", role: "tenant_viewer", tenantId: "" });
      setShowCreate(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建用户失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: User) {
    if (currentUser?.id === user.id) {
      return;
    }
    await apiClient.patch(`/users/${user.id}`, { active: !user.active });
    load();
  }

  async function handleDelete(id: string, username: string) {
    if (currentUser?.id === id) {
      return;
    }
    const approved = await confirm({
      title: "删除平台用户",
      description: `将永久删除「${username}」，该操作不可逆。`,
      confirmText: "删除用户",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) return;
    setDeletingIds((prev) => [...prev, id]);
    setTimeout(async () => {
      try {
        await apiClient.delete(`/users/${id}`);
        load();
      } finally {
        setDeletingIds((prev) => prev.filter((x) => x !== id));
      }
    }, 600);
  }

  function openEdit(user: User) {
    setEditTarget(user);
    setEditForm({ role: user.role, tenantId: user.tenantId ?? "" });
    setEditError("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSubmitting(true);
    setEditError("");

    try {
      await apiClient.patch(`/users/${editTarget.id}`, {
        role: editForm.role,
        tenantId: editForm.role === "super_admin" ? null : (editForm.tenantId || null),
      });
      setEditTarget(null);
      load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "更新用户失败");
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
      key: 'username',
      header: '账号',
      searchable: true,
      searchValue: (u) => u.username,
      sortable: true,
      sortValue: (u) => u.username,
      cell: (u) => {
        const isSuper = u.role === "super_admin";
        return (
          <div className="font-sans font-bold text-sm text-[var(--text-primary)] flex items-center">
            <Key size={14} className={`mr-2 ${isSuper ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'} group-hover:scale-110 transition-transform`} />
            {u.username}
            <span title="平台超级管理员" className="flex items-center">
              {isSuper && <Globe size={12} className="ml-2 text-[var(--danger)] animate-theme-pulse" />}
            </span>
          </div>
        );
      }
    },
    {
      key: 'role',
      header: '角色',
      searchable: true,
      searchValue: (u) => ROLE_MAP[u.role]?.label ?? u.role,
      sortable: true,
      sortValue: (u) => ROLE_MAP[u.role]?.label ?? u.role,
      cell: (u) => {
        const r = ROLE_MAP[u.role] ?? { label: u.role.toUpperCase(), color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" };
        const tone =
          r.color === "var(--danger)"
            ? "danger"
            : r.color === "var(--brand)"
              ? "brand"
              : r.color === "var(--warning)"
                ? "warning"
                : "muted";
        return (
          <PlatformStateBadge tone={tone} className={r.bg}>
            [{r.label}]
          </PlatformStateBadge>
        );
      }
    },
    {
      key: 'tenant',
      header: '租户域',
      searchable: true,
      searchValue: (u) => u.tenantId ?? "全局访问",
      sortable: true,
      sortValue: (u) => u.tenantId ?? "",
      cell: (u) => {
        const tenant = tenants.find(t => t.id === u.tenantId);
        return (
          <div className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
            {u.tenantId ? (
              <span className="flex items-start gap-1.5">
                <Building2 size={12} className="opacity-50 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-bold text-[var(--text-primary)]">{tenant?.tenantId ?? u.tenantId}</span>
                  {tenant?.displayName && (
                    <span className="text-[9px] opacity-60 truncate">{tenant.displayName}</span>
                  )}
                </div>
              </span>
            ) : (
              <PlatformStateBadge tone="danger" className="italic">全局访问</PlatformStateBadge>
            )}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: '状态',
      searchable: true,
      searchValue: (u) => (u.active ? "启用中" : "已停用"),
      sortable: true,
      sortValue: (u) => u.active,
      cell: (u) => (
        <PlatformStateBadge tone={u.active ? "success" : "danger"}>
          {u.active ? "启用中" : "已停用"}
        </PlatformStateBadge>
      )
    },
    {
      key: 'actions',
      header: '操作',
      headerClassName: "w-[240px] text-right",
      cellClassName: "w-[240px] text-right",
      cell: (u) => {
        const isSelf = currentUser?.id === u.id;
        return (
          <div className="flex items-center justify-end gap-2">
            <PlatformButton
              type="button"
              disabled={isSelf}
              aria-label={u.active ? `禁用用户 ${u.username}` : `启用用户 ${u.username}`}
              title={isSelf ? "不能停用自身账号" : (u.active ? `禁用用户 ${u.username}` : `启用用户 ${u.username}`)}
              onClick={() => toggleActive(u)}
              className="h-9 px-3"
            >
              {u.active ? '停用账号' : '激活账号'}
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
                  label: "删除用户",
                  icon: <Trash2 size={14} />,
                  onClick: () => handleDelete(u.id, u.username),
                  tone: "danger",
                  disabled: isSelf,
                }
              ]}
            />
          </div>
        );
      }
    }
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        title={
          <h1 className="mb-2 flex items-center text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-6xl">
            <Users size={34} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
            <ScrambleText text="全局用户治理_" scrambleDuration={1200} />
          </h1>
        }
        subtitle={"// 管理平台超级管理员与租户成员账号"}
        subtitleClassName="text-[10px]"
        actions={
          <PlatformButton
            type="button"
            onClick={() => { setShowCreate(!showCreate); setError(""); }}
            className={`ov-button px-6 py-3 text-xs ${showCreate ? 'bg-[var(--danger)] text-white border-[var(--danger)] hover:bg-[var(--danger)]' : ''}`}
          >
            <Plus size={16} strokeWidth={2} className={showCreate ? 'rotate-45 transition-transform' : 'transition-transform'} />
            <span className="font-sans font-bold tracking-widest uppercase">{showCreate ? '取消创建' : '创建新账号'}</span>
          </PlatformButton>
        }
      />

      {/* ─── Create Form Modal ─── */}
      <FormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="新账号分配"
        saving={submitting}
        saveText="确认分配"
      >
        {error && (
          <div className="flex items-start gap-3 p-4 mb-6 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-sans text-xs font-bold uppercase tracking-widest">
            <ShieldAlert size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
            <span>[分配失败] {error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <PlatformField label="账号 ID *" className="gap-2">
            <PlatformInput
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. platform_root"
              className="bg-[var(--bg-input)]"
            />
          </PlatformField>
          <PlatformField label="登录密钥 *" className="gap-2">
            <PlatformInput
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 6 位字符"
              className="bg-[var(--bg-input)]"
            />
          </PlatformField>
          <PlatformField label="角色范围" className="gap-2">
            <PlatformSelect
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              triggerClassName="bg-[var(--bg-input)] font-bold tracking-widest"
            >
              <option value="super_admin">平台超级管理员</option>
              <option value="tenant_admin">租户管理员</option>
              <option value="tenant_operator">租户运营</option>
              <option value="tenant_viewer">租户只读成员</option>
            </PlatformSelect>
          </PlatformField>
          <PlatformField label="租户绑定" className="gap-2">
            <PlatformSelect
              disabled={form.role === "super_admin"}
              value={form.role === "super_admin" ? "" : form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              triggerClassName="bg-[var(--bg-input)] font-bold tracking-widest disabled:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              <option value="">{form.role === "super_admin" ? "平台全局" : "选择租户..."}</option>
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.displayName} ({t.tenantId})
                </option>
              ))}
            </PlatformSelect>
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── Edit Form Modal ─── */}
      <FormModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        title={editTarget ? `编辑用户「${editTarget.username}」` : "编辑用户"}
        saving={editSubmitting}
        saveText="保存修改"
      >
        {editError && (
          <div className="flex items-start gap-3 p-4 mb-6 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-sans text-xs font-bold uppercase tracking-widest">
            <ShieldAlert size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
            <span>[更新失败] {editError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <PlatformField label="角色范围" className="gap-2">
            <PlatformSelect
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              triggerClassName="bg-[var(--bg-input)] font-bold tracking-widest"
            >
              {editTarget?.role === "super_admin" ? (
                <option value="super_admin">平台超级管理员</option>
              ) : (
                <option value="tenant_admin">租户管理员</option>
              )}
              {editTarget?.role !== "super_admin" && (
                <option value="tenant_operator">租户运营</option>
              )}
              {editTarget?.role !== "super_admin" && (
                <option value="tenant_viewer">租户只读成员</option>
              )}
            </PlatformSelect>
          </PlatformField>
          <PlatformField label="租户绑定" className="gap-2">
            <PlatformSelect
              disabled
              value={editForm.tenantId}
              triggerClassName="bg-[var(--bg-input)] font-bold tracking-widest disabled:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              <option value="">平台全局</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.tenantId})
                </option>
              ))}
            </PlatformSelect>
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── Reset Password Modal ─── */}
      <FormModal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={handleResetPassword}
        title={resetTarget ? `重置「${resetTarget.username}」密码` : "重置密码"}
        saving={resetSubmitting}
        saveText="确认重置"
      >
        {resetError && (
          <div className="flex items-start gap-3 p-4 mb-6 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-sans text-xs font-bold uppercase tracking-widest">
            <ShieldAlert size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
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
              className="bg-[var(--bg-input)]"
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
              className="bg-[var(--bg-input)]"
            />
          </PlatformField>
        </div>
      </FormModal>

      {/* ─── Data Grid ─── */}
      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        loadingMessage="正在同步平台用户列表..."
        errorMessage={loadError ? `用户列表加载失败：${loadError}` : undefined}
        emptyMessage="当前还没有平台账号"
        tableLabel="平台用户列表"
        searchConfig={{ placeholder: "搜索账号 / 角色 / 租户域..." }}
        className="flex-1 mt-4"
        rowClassName={(u) => deletingIds.includes(u.id) ? "animate-collapse" : ""}
      />
      
      {/* ─── Footer Stats ─── */}
      {!loading && users.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-sans font-black tracking-widest uppercase">
          <PlatformStatPill label="账号总数" value={<ScrambleText text={users.length.toString()} scrambleSpeed={50} />} accent="var(--border)" />
          <PlatformStatPill label="管理员" value={users.filter((u) => u.role === "super_admin" || u.role === "tenant_admin").length} accent="var(--brand)" backgroundClassName="bg-[var(--brand)]/10" />
          <PlatformStatPill label="运营成员" value={users.filter((u) => u.role === "tenant_operator").length} accent="var(--warning)" backgroundClassName="bg-[var(--warning)]/10" />
          <PlatformStatPill label="停用账号" value={users.filter((u) => !u.active).length} accent="var(--danger)" backgroundClassName="bg-[var(--danger)]/10" />
        </div>
      )}
    </div>
  );
}
