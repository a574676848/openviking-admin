"use client";
import { useEffect, useState, useCallback } from "react";
import { Users, Plus, ShieldAlert, Key, Trash2, Globe, Building2 } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/FormModal";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
  active: boolean;
  createdAt: string;
}

const ROLE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:     { label: "PLATFORM_OWNER", color: "var(--danger)", bg: "bg-[var(--danger)]/10" },
  tenant_admin:    { label: "TENANT_ADMIN", color: "var(--brand)", bg: "bg-[var(--brand)]/10" },
  tenant_operator: { label: "DATA_OPERATOR", color: "var(--warning)", bg: "bg-[var(--warning)]/10" },
  tenant_viewer:   { label: "READ_ONLY", color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" },
};

export default function UsersPage() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "tenant_viewer", tenantId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/users")
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
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
      setError(err instanceof Error ? err.message : "CREATE_FAIL");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: User) {
    await apiClient.patch(`/users/${user.id}`, { active: !user.active });
    load();
  }

  async function handleDelete(id: string, username: string) {
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

  const columns: ColumnDef<User>[] = [
    {
      key: 'username',
      header: 'Username',
      cell: (u) => {
        const isSuper = u.role === "super_admin";
        return (
          <div className="font-mono font-black text-sm text-[var(--text-primary)] flex items-center">
            <Key size={14} className={`mr-2 ${isSuper ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'} group-hover:scale-110 transition-transform`} />
            {u.username}
            <span title="PLATFORM_SUPER_ADMIN" className="flex items-center">
              {isSuper && <Globe size={12} className="ml-2 text-[var(--danger)] animate-pulse" />}
            </span>
          </div>
        );
      }
    },
    {
      key: 'role',
      header: 'Role_Type',
      cell: (u) => {
        const r = ROLE_MAP[u.role] ?? { label: u.role.toUpperCase(), color: "var(--text-muted)", bg: "bg-[var(--text-muted)]/10" };
        return (
          <span className={`font-mono text-[9px] font-black tracking-widest px-2 py-1 border-[var(--border-width)] inline-block ${r.bg}`} style={{ color: r.color, borderColor: r.color }}>
            [{r.label}]
          </span>
        );
      }
    },
    {
      key: 'tenant',
      header: 'Data_Domain',
      cell: (u) => (
        <div className="font-mono text-[10px] tracking-widest text-[var(--text-secondary)]">
          {u.tenantId ? (
            <span className="flex items-center gap-1.5">
              <Building2 size={12} className="opacity-50" />
              <span className="bg-[var(--bg-elevated)] border border-[var(--border)] px-1.5 py-0.5">{u.tenantId}</span>
            </span>
          ) : (
            <span className="text-[var(--danger)] font-black italic">GLOBAL_ACCESS</span>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => (
        <span className={`font-mono text-[9px] font-black tracking-widest px-2 py-1 border-[var(--border-width)] inline-flex items-center ${u.active ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]' : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]'}`}>
          {u.active ? "ACTIVE" : "SUSPENDED"}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (u) => (
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => toggleActive(u)}
            className={`font-mono text-[9px] font-black tracking-widest uppercase px-2 py-1 border-[var(--border-width)] hover:text-white transition-colors ${u.active ? 'border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)]' : 'border-[var(--success)] text-[var(--success)] hover:bg-[var(--success)]'}`}
          >
            {u.active ? 'SUSPEND' : 'ACTIVATE'}
          </button>
          <button
            onClick={() => handleDelete(u.id, u.username)}
            className="font-mono text-[9px] font-black tracking-widest uppercase px-2 py-1 border-[var(--border-width)] border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors flex items-center"
          >
            <Trash2 size={10} className="mr-1" /> DEL
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full theme-swiss">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-8">
        <div>
           <h1 className="text-5xl md:text-7xl font-black font-sans tracking-tighter uppercase mb-2 text-[var(--text-primary)] flex items-center">
             <Users size={40} strokeWidth={2} className="mr-4 text-[var(--text-primary)]" />
             <ScrambleText text="全局用户治理_" scrambleDuration={1200} />
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-[10px]">
             {"// MANAGE GLOBAL SUPER_ADMINS & TENANT ACCOUNTS"}
           </p>
        </div>
        <div className="flex gap-4 items-center">
           <button
             onClick={() => { setShowCreate(!showCreate); setError(""); }}
             className={`ov-button px-6 py-3 text-xs flex items-center gap-2 ${showCreate ? 'bg-[var(--danger)] text-white' : ''}`}
             style={{ borderRadius: 0 }}
           >
             <Plus size={16} strokeWidth={2} className={showCreate ? 'rotate-45 transition-transform' : 'transition-transform'} />
             <span className="font-mono font-black tracking-widest uppercase">{showCreate ? '取消指派' : '指派新账号'}</span>
           </button>
        </div>
      </div>

      {/* ─── Create Form Modal ─── */}
      <FormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="NEW_ACCOUNT_PROVISION_FORM"
        saving={submitting}
        saveText=">> CONFIRM_PROVISION"
      >
        {error && (
          <div className="flex items-start gap-3 p-4 mb-6 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)] font-mono text-xs font-bold uppercase tracking-widest">
            <ShieldAlert size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
            <span>[PROVISION_FAIL] {error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)] flex items-center">
                <span className="w-1.5 h-1.5 inline-block mr-1.5 bg-[var(--info)]" /> ACCOUNT_ID <span className="text-[var(--danger)] ml-1">*</span>
            </label>
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. platform_root"
              className="ov-input px-4 py-3 font-mono text-xs tracking-widest bg-[var(--bg-input)]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)] flex items-center">
                <span className="w-1.5 h-1.5 inline-block mr-1.5 bg-[var(--danger)]" /> SECURE_SECRET <span className="text-[var(--danger)] ml-1">*</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="MIN 6 CHARACTERS"
              className="ov-input px-4 py-3 font-mono text-xs tracking-widest bg-[var(--bg-input)]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)] flex items-center">
                <span className="w-1.5 h-1.5 inline-block mr-1.5 bg-[var(--brand)]" /> ROLE_SCOPE
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="ov-input px-4 py-3 font-mono text-xs tracking-widest uppercase font-bold bg-[var(--bg-input)]"
            >
              <option value="super_admin">PLATFORM_SUPER_ADMIN</option>
              <option value="tenant_admin">TENANT_ADMIN</option>
              <option value="tenant_operator">TENANT_OPERATOR</option>
              <option value="tenant_viewer">TENANT_VIEWER</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-mono text-[10px] font-black tracking-widest uppercase text-[var(--text-secondary)] flex items-center">
                <span className="w-1.5 h-1.5 inline-block mr-1.5 bg-[var(--warning)]" /> TENANT_ID_MAPPING
            </label>
            <input
              type="text"
              disabled={form.role === "super_admin"}
              value={form.role === "super_admin" ? "PLATFORM_GLOBAL" : form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              placeholder="e.g. demo-space"
              className="ov-input px-4 py-3 font-mono text-xs tracking-widest bg-[var(--bg-input)] disabled:opacity-50 disabled:bg-[var(--bg-elevated)]"
            />
          </div>
        </div>
      </FormModal>

      {/* ─── Data Grid ─── */}
      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        emptyMessage="// ZERO_ACCOUNTS_FOUND"
        className="flex-1 mt-4"
        rowClassName={(u) => deletingIds.includes(u.id) ? "animate-collapse" : ""}
      />
      
      {/* ─── Footer Stats ─── */}
      {!loading && users.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono font-black tracking-widest uppercase">
          <span className="border border-[var(--border)] px-2 py-1 bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            TOTAL_ACCOUNTS: <ScrambleText text={users.length.toString()} scrambleSpeed={50} />
          </span>
          <span className="border border-[var(--brand)] px-2 py-1 text-[var(--brand)] bg-[var(--brand)]/10">
            ADMINS: {users.filter((u) => u.role === "super_admin" || u.role === "tenant_admin").length}
          </span>
          <span className="border border-[var(--warning)] px-2 py-1 text-[var(--warning)] bg-[var(--warning)]/10">
            OPERATORS: {users.filter((u) => u.role === "tenant_operator").length}
          </span>
          <span className="border border-[var(--danger)] px-2 py-1 text-[var(--danger)] bg-[var(--danger)]/10">
            SUSPENDED: {users.filter((u) => !u.active).length}
          </span>
        </div>
      )}
    </div>
  );
}
