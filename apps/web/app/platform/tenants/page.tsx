"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowRight, HardDrive, Layers } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import { API_ENDPOINTS, DB_DEFAULTS, IsolationLevel } from "@/lib/constants";
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/FormModal";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { writeSessionToken } from "@/lib/session";

interface Tenant {
  id: string; tenantId: string; displayName: string; status: string;
  isolationLevel: IsolationLevel;
  quota: Record<string, unknown> | null;
  dbConfig: Record<string, unknown> | null;
  ovConfig: Record<string, unknown> | null;
  createdAt: string;
}

interface SwitchRoleResult {
  accessToken: string;
  tenantName: string;
}

const EMPTY_FORM = {
  tenantId: '', displayName: '', description: '',
  isolationLevel: IsolationLevel.SMALL,
  quota_maxDocs: '1000', quota_maxVectors: '100000',
  ov_baseUrl: '', ov_apiKey: '',
  db_host: '', db_port: DB_DEFAULTS.POSTGRES_PORT, db_user: '', db_pass: '', db_name: '',
};

export default function TenantsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);



  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiClient.get(API_ENDPOINTS.TENANTS);
      setTenants(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        tenantId: form.tenantId,
        displayName: form.displayName,
        isolationLevel: form.isolationLevel,
        quota: { maxDocs: Number(form.quota_maxDocs), maxVectors: Number(form.quota_maxVectors) },
        ovConfig: { baseUrl: form.ov_baseUrl || undefined, apiKey: form.ov_apiKey || undefined },
        dbConfig: form.isolationLevel === IsolationLevel.LARGE ? {
           host: form.db_host, port: Number(form.db_port), 
           username: form.db_user, password: form.db_pass, database: form.db_name
        } : undefined
      };
      await apiClient.post(API_ENDPOINTS.TENANTS, payload);
      setShowForm(false); setForm({ ...EMPTY_FORM }); await load();
      toast.success('租户空间分配成功，物理节点已初始化');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Tenant) => {
    const approved = await confirm({
      title: "删除租户空间",
      description: `将永久删除「${t.displayName}」的租户配置，请确认数据已备份。`,
      confirmText: "删除租户",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) return;
    setDeletingIds((prev) => [...prev, t.id]);
    setTimeout(async () => {
      try {
        await apiClient.delete(`${API_ENDPOINTS.TENANTS}/${t.id}`);
        await load();
      } finally {
        setDeletingIds((prev) => prev.filter((x) => x !== t.id));
      }
    }, 600);
  };

  const switchToTenant = async (t: Tenant) => {
    try {
      const d = await apiClient.post<SwitchRoleResult>(API_ENDPOINTS.AUTH.SWITCH_ROLE, { tenantId: t.id });
      writeSessionToken(d.accessToken);
      toast.success(`视角已切换至: ${d.tenantName}`);
      router.push('/console/dashboard');
    } catch {
      toast.error('视角切换失败');
    }
  };

  const columns: ColumnDef<Tenant>[] = [
    {
      key: 'namespace',
      header: 'Namespace',
      cell: (t) => (
        <>
          <div className="font-sans font-black text-lg">{t.displayName}</div>
          <div className="font-mono text-[10px] text-[var(--text-muted)] font-bold uppercase">{t.tenantId}</div>
        </>
      )
    },
    {
      key: 'isolation',
      header: '隔离模式',
      cell: (t) => (
        <span className={`inline-flex items-center gap-1.5 border border-[var(--border)] px-2 py-1 font-mono text-[9px] font-black tracking-widest ${
          t.isolationLevel === IsolationLevel.SMALL ? 'bg-[var(--bg-card)]' : t.isolationLevel === IsolationLevel.MEDIUM ? 'bg-[var(--brand-muted)] text-[var(--brand)]' : 'bg-[var(--text-primary)] text-[var(--bg-card)]'
        }`}>
          {t.isolationLevel === IsolationLevel.LARGE ? <HardDrive size={10}/> : <Layers size={10}/>}
          {t.isolationLevel.toUpperCase()}
        </span>
      )
    },
    {
      key: 'status',
      header: '物理存储状态',
      cell: () => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
          <span className="font-mono text-[10px] font-black uppercase">Ready</span>
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (t) => (
        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => switchToTenant(t)} className="p-2 border border-[var(--border)] bg-[var(--bg-card)] transition-colors hover:bg-[var(--bg-elevated)]"><ArrowRight size={16}/></button>
          <button onClick={() => remove(t)} className="p-2 border border-[var(--danger)] bg-transparent text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white"><Trash2 size={16}/></button>
        </div>
      )
    }
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full theme-swiss">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b-[var(--border-width)] border-[var(--border)] pb-6 mb-10">
        <div>
           <h1 className="text-5xl md:text-7xl font-black font-sans tracking-tighter uppercase mb-2 text-black">
             <ScrambleText text="多级资源划分_" scrambleDuration={1200} />
           </h1>
           <p className="font-bold font-mono tracking-widest text-[var(--text-secondary)] uppercase text-xs">
             {"// MANAGE HYBRID ISOLATION: SMALL / MEDIUM / LARGE"}
           </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className={`ov-button px-6 py-3 flex items-center gap-2 ${showForm ? 'bg-[var(--danger)] text-white' : ''}`} style={{borderRadius: 0}}>
           <Plus size={16} strokeWidth={3} className={showForm ? 'rotate-45' : ''} />
           <span>{showForm ? '取消分配' : '指派新租户'}</span>
        </button>
      </div>

      <FormModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleCreate}
        title="指派新租户"
        saving={saving}
        saveText=">> 确认分配物理空间"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="space-y-6">
            <h3 className="font-mono font-black text-lg uppercase border-b-2 border-[var(--border)] pb-2">基础身份 & 隔离等级</h3>
            <div className="grid grid-cols-1 gap-4">
              <input required value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})} placeholder="命名空间 (Namespace ID) *" className="ov-input px-4 py-3 font-mono font-bold" />
              <input required value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} placeholder="显示名称 (Display Name) *" className="ov-input px-4 py-3 font-bold" />
              <div className="flex gap-2">
                {[IsolationLevel.SMALL, IsolationLevel.MEDIUM, IsolationLevel.LARGE].map(lvl => (
                  <button key={lvl} type="button" onClick={() => setForm({...form, isolationLevel: lvl})} className={`flex-1 border border-[var(--border)] py-2 font-mono text-[10px] font-black transition-all ${form.isolationLevel === lvl ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-card)]'}`}>
                    {lvl.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="font-mono font-black text-lg uppercase border-b-2 border-[var(--border)] pb-2">资源配额上限</h3>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" value={form.quota_maxDocs} onChange={e => setForm({...form, quota_maxDocs: e.target.value})} placeholder="最大知识库数" className="ov-input px-4 py-3 font-mono text-sm font-bold" />
              <input type="number" value={form.quota_maxVectors} onChange={e => setForm({...form, quota_maxVectors: e.target.value})} placeholder="最大向量数" className="ov-input px-4 py-3 font-mono text-sm font-bold" />
            </div>
          </div>
        </div>

        {form.isolationLevel === IsolationLevel.LARGE && (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] p-6 mb-10 animate-in zoom-in-95">
            <h4 className="font-mono text-xs font-black uppercase mb-6 flex items-center gap-2"><HardDrive size={14}/> 独立数据库连接配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input value={form.db_host} onChange={e => setForm({...form, db_host: e.target.value})} placeholder="Host IP" className="ov-input px-3 py-2 text-xs font-mono" />
              <input value={form.db_port} onChange={e => setForm({...form, db_port: e.target.value})} placeholder="Port" className="ov-input px-3 py-2 text-xs font-mono" />
              <input value={form.db_name} onChange={e => setForm({...form, db_name: e.target.value})} placeholder="Database Name" className="ov-input px-3 py-2 text-xs font-mono" />
              <input value={form.db_user} onChange={e => setForm({...form, db_user: e.target.value})} placeholder="User" className="ov-input px-3 py-2 text-xs font-mono" />
              <input type="password" value={form.db_pass} onChange={e => setForm({...form, db_pass: e.target.value})} placeholder="Password" className="ov-input px-3 py-2 text-xs font-mono" />
            </div>
          </div>
        )}
      </FormModal>

      {/* ─── List ─── */}
      <DataTable 
        data={tenants} 
        columns={columns} 
        loading={loading} 
        emptyMessage="NO TENANTS FOUND" 
        rowClassName={(t) => deletingIds.includes(t.id) ? "animate-collapse" : ""}
      />
    </div>
  );
}
