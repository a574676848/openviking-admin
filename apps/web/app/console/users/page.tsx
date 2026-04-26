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
  ConsoleIconTile,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsoleSelect,
  ConsoleSurfaceCard,
  ConsoleStatsGrid,
  ConsoleTableShell,
  resolveConsoleTableState,
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
  const [loadError, setLoadError] = useState("");
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

  const tableState = resolveConsoleTableState({
    loading,
    hasError: Boolean(loadError),
    hasData: users.length > 0,
  });

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
        subtitle="统一管理租户成员、角色与访问状态"
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
        <ConsoleMetricCard label="成员总数" value={users.length.toLocaleString()} />
        <ConsoleMetricCard label="启用中" value={stats.active.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="已禁用" value={stats.disabled.toLocaleString()} tone="danger" />
        <ConsoleMetricCard label="管理员" value={stats.admins.toLocaleString()} tone="brand" />
      </ConsoleStatsGrid>

      {showCreate && (
        <ConsoleControlPanel eyebrow="新增成员" title="创建租户内账号">
          <form onSubmit={handleCreate} className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <ConsoleField label="用户名">
              <ConsoleInput
                required
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="ops_user"
              />
            </ConsoleField>
            <ConsoleField label="密码">
              <ConsoleInput
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="至少 6 位"
              />
            </ConsoleField>
            <ConsoleField label="角色">
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
              <ConsoleSurfaceCard tone="danger" className="xl:col-span-3 px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.16em] shadow-[3px_3px_0px_#000]">
                {error}
              </ConsoleSurfaceCard>
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
            成员
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            角色
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            状态
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            创建时间
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            操作
          </div>
          </div>
        }
        state={tableState}
        stateContent={{
          loading: <ConsoleEmptyState icon={Shield} title="正在读取成员列表..." description="系统正在同步当前租户成员信息。" />,
          error: (
            <ConsoleEmptyState
              icon={Shield}
              title="成员列表加载失败"
              description={loadError}
              action={
                <ConsoleButton type="button" onClick={() => void load()}>
                  重新加载
                </ConsoleButton>
              }
            />
          ),
          empty: <ConsoleEmptyState icon={Shield} title="暂无成员" description="请先创建租户成员，再分配访问权限。" />,
        }}
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
                      <ConsoleIconTile>
                        <KeyRound size={16} strokeWidth={2.6} />
                      </ConsoleIconTile>
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
                      {user.active ? "已启用" : "已禁用"}
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
