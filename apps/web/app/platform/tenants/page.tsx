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
import {
  DangerAction,
  PlatformButton,
  PlatformInput,
  PlatformPageHeader,
  PlatformPanel,
  PlatformSegmentedControl,
  PlatformSectionTitle,
  PlatformStateBadge,
} from "@/components/ui/platform-primitives";

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
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);



  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const d = await apiClient.get(API_ENDPOINTS.TENANTS);
      setTenants(Array.isArray(d) ? d : []);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "租户目录加载失败");
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
      header: '租户空间',
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
        <PlatformStateBadge
          tone={
            t.isolationLevel === IsolationLevel.SMALL
              ? "default"
              : t.isolationLevel === IsolationLevel.MEDIUM
                ? "brand"
                : "inverse"
          }
        >
          {t.isolationLevel === IsolationLevel.LARGE ? <HardDrive size={10}/> : <Layers size={10}/>}
          {t.isolationLevel.toUpperCase()}
        </PlatformStateBadge>
      )
    },
    {
      key: 'status',
      header: '物理存储状态',
      cell: () => (
        <PlatformStateBadge tone="success">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" />
          就绪
        </PlatformStateBadge>
      )
    },
    {
      key: 'actions',
        header: '操作',
        cell: (t) => (
        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <PlatformButton
            type="button"
            aria-label={`切换到租户 ${t.displayName}`}
            title={`切换到租户 ${t.displayName}`}
            onClick={() => switchToTenant(t)}
            className="h-9 w-9 p-0"
          >
            <ArrowRight size={16}/>
          </PlatformButton>
          <DangerAction
            type="button"
            aria-label={`删除租户 ${t.displayName}`}
            title={`删除租户 ${t.displayName}`}
            onClick={() => remove(t)}
            className="h-9 w-9 p-0"
          >
            <Trash2 size={16}/>
          </DangerAction>
        </div>
      )
    }
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        className="mb-10"
        title={
          <h1 className="mb-2 text-4xl font-black tracking-tighter text-[var(--text-primary)] md:text-6xl">
            <ScrambleText text="多级资源划分_" scrambleDuration={1200} />
          </h1>
        }
        subtitle={"// 管理 Small / Medium / Large 多级隔离租户"}
        actions={
          <PlatformButton
            type="button"
            aria-label={showForm ? "取消新租户分配" : "打开新租户分配表单"}
            title={showForm ? "取消新租户分配" : "打开新租户分配表单"}
            onClick={() => setShowForm(!showForm)}
            className={`ov-button px-6 py-3 ${showForm ? 'bg-[var(--danger)] text-white border-[var(--danger)] hover:bg-[var(--danger)]' : ''}`}
            style={{borderRadius: 0}}
          >
            <Plus size={16} strokeWidth={3} className={showForm ? 'rotate-45' : ''} />
            <span>{showForm ? '取消分配' : '指派新租户'}</span>
          </PlatformButton>
        }
      />

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
            <PlatformSectionTitle
              title="基础身份 & 隔离等级"
              className="mb-0 border-b-2 border-[var(--border)] pb-2"
            />
            <div className="grid grid-cols-1 gap-4">
              <PlatformInput required value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})} placeholder="命名空间 (Namespace ID) *" className="px-4 py-3 font-bold" />
              <PlatformInput required value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} placeholder="显示名称 *" className="px-4 py-3 font-bold" />
              <PlatformSegmentedControl
                value={form.isolationLevel}
                onChange={(lvl) => setForm({ ...form, isolationLevel: lvl })}
                items={[
                  { value: IsolationLevel.SMALL, label: IsolationLevel.SMALL.toUpperCase() },
                  { value: IsolationLevel.MEDIUM, label: IsolationLevel.MEDIUM.toUpperCase() },
                  { value: IsolationLevel.LARGE, label: IsolationLevel.LARGE.toUpperCase() },
                ]}
                buttonClassName="py-2"
              />
            </div>
          </div>

          <div className="space-y-6">
            <PlatformSectionTitle
              title="资源配额上限"
              className="mb-0 border-b-2 border-[var(--border)] pb-2"
            />
            <div className="grid grid-cols-2 gap-4">
              <PlatformInput type="number" value={form.quota_maxDocs} onChange={e => setForm({...form, quota_maxDocs: e.target.value})} placeholder="最大知识库数" className="px-4 py-3 text-sm font-bold" />
              <PlatformInput type="number" value={form.quota_maxVectors} onChange={e => setForm({...form, quota_maxVectors: e.target.value})} placeholder="最大向量数" className="px-4 py-3 text-sm font-bold" />
            </div>
          </div>
        </div>

        {form.isolationLevel === IsolationLevel.LARGE && (
          <PlatformPanel className="mb-10 animate-in zoom-in-95 bg-[var(--bg-elevated)] p-6">
            <PlatformSectionTitle
              title={
                <span className="flex items-center gap-2 text-base">
                  <HardDrive size={14}/> 独立数据库连接配置
                </span>
              }
              className="mb-6"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PlatformInput value={form.db_host} onChange={e => setForm({...form, db_host: e.target.value})} placeholder="主机地址" className="px-3 py-2 text-xs" />
              <PlatformInput value={form.db_port} onChange={e => setForm({...form, db_port: e.target.value})} placeholder="端口" className="px-3 py-2 text-xs" />
              <PlatformInput value={form.db_name} onChange={e => setForm({...form, db_name: e.target.value})} placeholder="数据库名" className="px-3 py-2 text-xs" />
              <PlatformInput value={form.db_user} onChange={e => setForm({...form, db_user: e.target.value})} placeholder="用户名" className="px-3 py-2 text-xs" />
              <PlatformInput type="password" value={form.db_pass} onChange={e => setForm({...form, db_pass: e.target.value})} placeholder="密码" className="px-3 py-2 text-xs" />
            </div>
          </PlatformPanel>
        )}
      </FormModal>

      {/* ─── List ─── */}
      <DataTable 
        data={tenants} 
        columns={columns} 
        loading={loading} 
        loadingMessage="正在同步租户空间目录..."
        errorMessage={loadError ? `租户目录加载失败：${loadError}` : undefined}
        emptyMessage="当前还没有租户空间" 
        tableLabel="平台租户列表"
        rowClassName={(t) => deletingIds.includes(t.id) ? "animate-collapse" : ""}
      />
    </div>
  );
}
