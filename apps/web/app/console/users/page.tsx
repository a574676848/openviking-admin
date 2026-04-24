"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Shield, Trash2, UserRoundPlus } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleControlPanel,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleSelect,
  ConsoleStatsGrid,
  ConsoleTableShell,
} from "@/components/console/primitives";

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string;
  active: boolean;
  createdAt: string;
}

const ROLE_MAP: Record<string, { label: string; className: string }> = {
  tenant_admin: { label: "租户管理员", className: "bg-[var(--brand)] text-white" },
  tenant_operator: { label: "业务操作员", className: "bg-[var(--warning)] text-black" },
  tenant_viewer: { label: "只读观察员", className: "bg-black text-white" },
};

export default function UsersPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "tenant_viewer",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<User[]>("/users");
      setUsers(Array.isArray(response) ? response : []);
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
    await apiClient.patch(`/users/${user.id}`, { active: !user.active });
    await load();
  }

  async function handleDelete(id: string, username: string) {
    const approved = await confirm({
      title: "注销成员账号",
      description: `将永久注销「${username}」，该账号会失去当前租户的所有访问能力。`,
      confirmText: "注销账号",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) {
      return;
    }
    await apiClient.delete(`/users/${id}`);
    await load();
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="成员权限管理"
        subtitle="Tenant Members / Roles And Access Control"
        actions={
          <ConsoleButton
            type="button"
            onClick={() => {
              setShowCreate((value) => !value);
              setError("");
            }}
          >
            <Plus size={14} strokeWidth={2.6} className={showCreate ? "rotate-45" : ""} />
            {showCreate ? "收起创建表单" : "新增成员"}
          </ConsoleButton>
        }
      />

      <ConsoleStatsGrid className="lg:grid-cols-4">
        <ConsoleMetricCard label="Members" value={users.length.toLocaleString()} />
        <ConsoleMetricCard label="Active" value={stats.active.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="Disabled" value={stats.disabled.toLocaleString()} tone="danger" />
        <ConsoleMetricCard label="Admins" value={stats.admins.toLocaleString()} tone="brand" />
      </ConsoleStatsGrid>

      {showCreate && (
        <ConsoleControlPanel eyebrow="New Member" title="创建租户内账号">
          <form onSubmit={handleCreate} className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <ConsoleField label="Username">
              <ConsoleInput
                required
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="ops_user"
              />
            </ConsoleField>
            <ConsoleField label="Password">
              <ConsoleInput
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="至少 6 位"
              />
            </ConsoleField>
            <ConsoleField label="Role">
              <ConsoleSelect
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="tenant_admin">租户管理员</option>
                <option value="tenant_operator">业务操作员</option>
                <option value="tenant_viewer">只读观察员</option>
              </ConsoleSelect>
            </ConsoleField>
            {error && (
              <div className="xl:col-span-3 border-[3px] border-[var(--border)] bg-[var(--danger)] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[3px_3px_0px_#000]">
                {error}
              </div>
            )}
            <div className="xl:col-span-3">
              <ConsoleButton type="submit" disabled={submitting}>
                <UserRoundPlus size={14} strokeWidth={2.6} />
                {submitting ? "创建中..." : "创建成员"}
              </ConsoleButton>
            </div>
          </form>
        </ConsoleControlPanel>
      )}

      <ConsoleTableShell
        columns={
          <div className="grid grid-cols-[minmax(0,1fr)_160px_120px_180px_220px]">
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Member
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Role
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Status
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Created
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Actions
          </div>
          </div>
        }
        isLoading={loading}
        hasData={users.length > 0}
        loadingState={<ConsoleEmptyState icon={Shield} title="正在读取成员列表..." description="loading tenant users" />}
        emptyState={<ConsoleEmptyState icon={Shield} title="暂无成员" description="create tenant members to delegate access" />}
      >
            {users.map((user) => {
              const role = ROLE_MAP[user.role] ?? {
                label: user.role,
                className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
              };
              return (
                <div
                  key={user.id}
                  className={`grid gap-px bg-[var(--border)] xl:grid-cols-[minmax(0,1fr)_160px_120px_180px_220px] ${
                    user.active ? "" : "opacity-60"
                  }`}
                >
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
                        <KeyRound size={16} strokeWidth={2.6} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-sans text-xl font-black text-[var(--text-primary)]">{user.username}</p>
                        <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {user.id}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <ConsoleBadge className={role.className}>
                      {role.label}
                    </ConsoleBadge>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <ConsoleBadge tone={user.active ? "success" : "default"}>
                      {user.active ? "active" : "disabled"}
                    </ConsoleBadge>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {new Date(user.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <div className="flex gap-3">
                      <ConsoleButton type="button" tone={user.active ? "warning" : "brand"} onClick={() => void toggleActive(user)} className="h-11 px-4 tracking-[0.16em]">
                        {user.active ? "禁用" : "启用"}
                      </ConsoleButton>
                      <ConsoleButton type="button" tone="danger" onClick={() => void handleDelete(user.id, user.username)} className="h-11 px-4 tracking-[0.16em]">
                        <Trash2 size={14} strokeWidth={2.6} />
                        删除
                      </ConsoleButton>
                    </div>
                  </div>
                </div>
              );
            })
          }
      </ConsoleTableShell>
    </div>
  );
}
