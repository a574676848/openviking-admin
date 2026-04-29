"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ArrowRight, HardDrive, Layers, Pencil, PauseCircle, PlayCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import { API_ENDPOINTS, DB_DEFAULTS, IsolationLevel } from "@/lib/constants";
import { DataTable, ColumnDef } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/FormModal";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { writeSessionTokenToWindow } from "@/lib/session";
import {
  DangerAction,
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPageHeader,
  PlatformPanel,
  PlatformSegmentedControl,
  PlatformSectionTitle,
  PlatformStateBadge,
  PlatformActionMenu,
} from "@/components/ui/platform-primitives";

interface Tenant {
  id: string; tenantId: string; displayName: string; status: string;
  isolationLevel: IsolationLevel;
  quota: Record<string, unknown> | null;
  dbConfig: Record<string, unknown> | null;
  vikingAccount?: string | null;
  ovConfig: Record<string, unknown> | null;
  createdAt: string;
}

interface SwitchRoleResult {
  accessToken: string;
  tenantName: string;
}

const TENANT_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ERROR_INITIALIZING: "error_initializing",
} as const;

const EMPTY_FORM = {
  tenantId: '', displayName: '', description: '',
  isolationLevel: IsolationLevel.SMALL,
  quota_maxDocs: '1000', quota_maxVectors: '100000',
  ov_account: '', ov_baseUrl: '', ov_apiKey: '',
  rerank_endpoint: '', rerank_apiKey: '', rerank_model: '',
  db_host: '', db_port: DB_DEFAULTS.POSTGRES_PORT, db_user: '', db_pass: '', db_name: '',
};

const TENANT_POPUP_NAME = "ov-tenant-console";
const TENANT_POPUP_ROUTE = "/console/dashboard";
const TENANT_POPUP_WIDTH = 1440;
const TENANT_POPUP_HEIGHT = 920;
const TENANT_POPUP_MIN_LEFT = 40;
const TENANT_POPUP_MIN_TOP = 40;
const TENANT_POPUP_BLOCKED_MESSAGE = "浏览器拦截了租户弹窗，请允许弹窗后重试";
const TENANT_POPUP_SWITCH_FAILED_MESSAGE = "视角切换失败";

function buildTenantPopupFeatures() {
  if (typeof window === "undefined") {
    return "popup=yes,width=1440,height=920";
  }

  const left = Math.max(
    TENANT_POPUP_MIN_LEFT,
    Math.round((window.screen.width - TENANT_POPUP_WIDTH) / 2),
  );
  const top = Math.max(
    TENANT_POPUP_MIN_TOP,
    Math.round((window.screen.height - TENANT_POPUP_HEIGHT) / 2),
  );

  return [
    "popup=yes",
    "resizable=yes",
    "scrollbars=yes",
    `width=${TENANT_POPUP_WIDTH}`,
    `height=${TENANT_POPUP_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");
}

function renderTenantPopupBootingState(targetWindow: Window, tenantName: string) {
  targetWindow.document.title = `正在进入 ${tenantName}`;
  targetWindow.document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f19;color:#f7f8fa;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;">
      <div style="width:min(420px,88vw);padding:32px;border:1px solid rgba(255,255,255,0.12);border-radius:20px;background:rgba(12,18,31,0.92);box-shadow:0 30px 90px rgba(0,0,0,0.28);">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#00f0ff;margin-bottom:14px;">Tenant Console</div>
        <div style="font-size:28px;font-weight:700;line-height:1.2;margin-bottom:10px;">正在打开租户空间</div>
        <div style="font-size:14px;line-height:1.7;color:rgba(247,248,250,0.72);">当前租户：${tenantName}。平台管理会留在原窗口，弹窗完成鉴权后会自动进入租户控制台。</div>
      </div>
    </div>
  `;
}

export default function TenantsPage() {
  const confirm = useConfirm();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<string[]>([]);
  const [showTenantOVConfig, setShowTenantOVConfig] = useState(false);

  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setEditingTenant(null);
    setShowTenantOVConfig(false);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, [resetForm]);


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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ovConfig = {
        account: form.ov_account || undefined,
        baseUrl: form.ov_baseUrl || undefined,
        apiKey: form.ov_apiKey || undefined,
        rerankEndpoint: form.rerank_endpoint || undefined,
        rerankApiKey: form.rerank_apiKey || undefined,
        rerankModel: form.rerank_model || undefined,
      };
      const payload = {
        displayName: form.displayName,
        quota: { maxDocs: Number(form.quota_maxDocs), maxVectors: Number(form.quota_maxVectors) },
        vikingAccount: form.ov_account || undefined,
        ovConfig,
        dbConfig: form.isolationLevel === IsolationLevel.LARGE ? {
          host: form.db_host || undefined,
          port: Number(form.db_port),
          username: form.db_user || undefined,
          password: form.db_pass || undefined,
          database: form.db_name || undefined,
        } : undefined,
      };

      if (editingTenant) {
        await apiClient.patch(`${API_ENDPOINTS.TENANTS}/${editingTenant.id}`, payload);
        closeForm();
        await load();
        toast.success("租户配置已更新");
        return;
      }

      await apiClient.post(API_ENDPOINTS.TENANTS, {
        tenantId: form.tenantId,
        isolationLevel: form.isolationLevel,
        ...payload,
      });
      closeForm();
      await load();
      toast.success('租户空间分配成功，物理节点已初始化');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "租户初始化失败");
    } finally {
      setSaving(false);
    }
  }, [closeForm, editingTenant, form, load]);

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (tenant: Tenant) => {
    const quota = tenant.quota ?? {};
    const dbConfig = tenant.dbConfig ?? {};
    const ovConfig = tenant.ovConfig ?? {};
    setEditingTenant(tenant);
    setForm({
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
      description: "",
      isolationLevel: tenant.isolationLevel,
      quota_maxDocs: String((quota as { maxDocs?: number }).maxDocs ?? 1000),
      quota_maxVectors: String((quota as { maxVectors?: number }).maxVectors ?? 100000),
      ov_account: String(tenant.vikingAccount ?? (ovConfig as { account?: string }).account ?? ""),
      ov_baseUrl: String((ovConfig as { baseUrl?: string }).baseUrl ?? ""),
      ov_apiKey: "",
      rerank_endpoint: String((ovConfig as { rerankEndpoint?: string }).rerankEndpoint ?? ""),
      rerank_apiKey: "",
      rerank_model: String((ovConfig as { rerankModel?: string }).rerankModel ?? ""),
      db_host: String((dbConfig as { host?: string }).host ?? ""),
      db_port: String((dbConfig as { port?: string | number }).port ?? DB_DEFAULTS.POSTGRES_PORT),
      db_user: String((dbConfig as { username?: string }).username ?? ""),
      db_pass: "",
      db_name: String((dbConfig as { database?: string }).database ?? ""),
    });
    setShowTenantOVConfig(false);
    setShowForm(true);
  };

  const remove = async (t: Tenant) => {
    const approved = await confirm({
      title: "归档租户",
      description: `将归档「${t.displayName}」并从默认列表中隐藏，租户命名空间不会被释放。`,
      confirmText: "确认归档",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) return;
    setDeletingIds((prev) => [...prev, t.id]);
    setTimeout(async () => {
      try {
        await apiClient.delete(`${API_ENDPOINTS.TENANTS}/${t.id}`);
        toast.success(`租户「${t.displayName}」已归档`);
        await load();
      } finally {
        setDeletingIds((prev) => prev.filter((x) => x !== t.id));
      }
    }, 600);
  };

  const toggleTenantStatus = async (tenant: Tenant) => {
    const nextStatus =
      tenant.status.toLowerCase() === TENANT_STATUS.ACTIVE
        ? TENANT_STATUS.DISABLED
        : TENANT_STATUS.ACTIVE;
    const actionText = nextStatus === TENANT_STATUS.ACTIVE ? "启用" : "禁用";
    const approved = await confirm({
      title: `${actionText}租户`,
      description: `${actionText}后将${nextStatus === TENANT_STATUS.ACTIVE ? "恢复" : "暂停"}「${tenant.displayName}」的租户访问能力。`,
      confirmText: `确认${actionText}`,
      cancelText: "取消",
      tone: nextStatus === TENANT_STATUS.ACTIVE ? "default" : "danger",
    });

    if (!approved) {
      return;
    }

    setStatusUpdatingIds((prev) => [...prev, tenant.id]);

    try {
      await apiClient.patch(`${API_ENDPOINTS.TENANTS}/${tenant.id}/status`, {
        status: nextStatus,
      });
      toast.success(`租户「${tenant.displayName}」已${actionText}`);
      await load();
    } finally {
      setStatusUpdatingIds((prev) => prev.filter((item) => item !== tenant.id));
    }
  };

  const switchToTenant = async (t: Tenant) => {
    const popupWindow = window.open("", TENANT_POPUP_NAME, buildTenantPopupFeatures());
    if (!popupWindow) {
      toast.error(TENANT_POPUP_BLOCKED_MESSAGE);
      return;
    }

    renderTenantPopupBootingState(popupWindow, t.displayName);

    try {
      const d = await apiClient.post<SwitchRoleResult>(API_ENDPOINTS.AUTH.SWITCH_ROLE, { tenantId: t.id });
      writeSessionTokenToWindow(popupWindow, d.accessToken);
      popupWindow.location.replace(TENANT_POPUP_ROUTE);
      popupWindow.focus();
      toast.success(`已在新窗口打开: ${d.tenantName}`);
    } catch (error: unknown) {
      popupWindow.close();
      toast.error(error instanceof Error ? error.message : TENANT_POPUP_SWITCH_FAILED_MESSAGE);
    }
  };

  const columns: ColumnDef<Tenant>[] = [
    {
      key: 'namespace',
      header: '租户空间',
      headerClassName: "w-[32%]",
      searchable: true,
      searchValue: (t) => `${t.displayName} ${t.tenantId}`,
      sortable: true,
      sortValue: (t) => t.displayName,
      cell: (t) => (
        <>
          <div className="font-sans font-bold text-lg">{t.displayName}</div>
          <div className="font-sans text-[10px] text-[var(--text-muted)] font-bold uppercase">{t.tenantId}</div>
        </>
      )
    },
    {
      key: 'isolation',
      header: '隔离模式',
      headerClassName: "w-[18%]",
      searchable: true,
      searchValue: (t) => t.isolationLevel,
      sortable: true,
      sortValue: (t) => t.isolationLevel,
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
      header: '租户状态',
      headerClassName: "w-[18%]",
      searchable: true,
      searchValue: (t) => t.status,
      sortable: true,
      sortValue: (t) => t.status.toLowerCase(),
      cell: (t) => (
        <PlatformStateBadge
          tone={
            t.status.toLowerCase() === TENANT_STATUS.ACTIVE
              ? "success"
              : t.status.toLowerCase() === TENANT_STATUS.ERROR_INITIALIZING
                ? "danger"
                : "warning"
          }
        >
          <span
            className={`h-2 w-2 rounded-full ${
              t.status.toLowerCase() === TENANT_STATUS.ACTIVE
                ? "animate-pulse bg-[var(--success)]"
                : t.status.toLowerCase() === TENANT_STATUS.ERROR_INITIALIZING
                  ? "bg-[var(--danger)]"
                  : "bg-[var(--warning)]"
            }`}
          />
          {t.status.toLowerCase() === TENANT_STATUS.ACTIVE
            ? "已启用"
            : t.status.toLowerCase() === TENANT_STATUS.ERROR_INITIALIZING
              ? "初始化失败"
              : "已禁用"}
        </PlatformStateBadge>
      )
    },
    {
      key: 'actions',
      header: '操作',
      headerClassName: "w-[240px] text-right",
      cellClassName: "w-[240px] text-right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-2">
          <PlatformButton
            type="button"
            aria-label={`切换到租户 ${t.displayName}`}
            title={`切换到租户 ${t.displayName}`}
            onClick={() => switchToTenant(t)}
            className="h-9 px-4 bg-[var(--brand)] text-white border-[var(--brand)] hover:bg-[var(--brand)]/90"
          >
            <ArrowRight size={14} strokeWidth={3} />
            <span>进入空间</span>
          </PlatformButton>

          <PlatformActionMenu
            items={[
              {
                label: t.status.toLowerCase() === TENANT_STATUS.ACTIVE ? "禁用状态" : "激活租户",
                icon: t.status.toLowerCase() === TENANT_STATUS.ACTIVE ? <PauseCircle size={14}/> : <PlayCircle size={14}/>,
                onClick: () => toggleTenantStatus(t),
                disabled: statusUpdatingIds.includes(t.id)
              },
              {
                label: "编辑配置",
                icon: <Pencil size={14}/>,
                onClick: () => openEditForm(t)
              },
              {
                label: "归档租户",
                icon: <Trash2 size={14}/>,
                onClick: () => remove(t),
                tone: "danger"
              }
            ]}
          />
        </div>
      )
    }
  ];

  return (
    <div className="w-full flex flex-col pb-10 min-h-full">
      <PlatformPageHeader
        className="mb-10"
        title={
          <h1 className="mb-2 text-4xl font-bold tracking-tighter text-[var(--text-primary)] md:text-6xl">
            <ScrambleText text="多级资源划分_" scrambleDuration={1200} />
          </h1>
        }
        subtitle={"// 管理 Small / Medium / Large 多级隔离租户"}
        actions={
          <PlatformButton
            type="button"
            aria-label={showForm ? "取消当前租户表单" : "打开新租户创建表单"}
            title={showForm ? "取消当前租户表单" : "打开新租户创建表单"}
            onClick={() => (showForm ? closeForm() : openCreateForm())}
            className={`ov-button px-6 py-3 text-[12px] tracking-[0.14em] ${showForm ? 'bg-[var(--danger)] text-white border-[var(--danger)] hover:bg-[var(--danger)]' : 'text-white'}`}
          >
            <Plus size={16} strokeWidth={3} className={showForm ? 'rotate-45' : ''} />
            <span className="font-bold text-white">{showForm ? '取消操作' : '创建新租户'}</span>
          </PlatformButton>
        }
      />

      <FormModal
        isOpen={showForm}
        onClose={closeForm}
        onSubmit={handleSubmit}
        title={editingTenant ? `编辑租户 · ${editingTenant.displayName}` : "创建新租户"}
        saving={saving}
        saveText={editingTenant ? ">> 保存租户配置" : ">> 确认创建租户"}
      >
        <div className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <PlatformPanel className="space-y-6 bg-[var(--bg-elevated)]/60 p-6">
            <PlatformSectionTitle
              title="基础身份 & 隔离等级"
              subtitle="命名空间、显示名称与隔离规格决定租户落位方式"
              className="mb-0 border-b-2 border-[var(--border)] pb-3"
            />
            <div className="grid grid-cols-1 gap-5">
              <PlatformField label="命名空间 ID / Namespace ID">
                <PlatformInput
                  required
                  value={form.tenantId}
                  onChange={e => setForm({...form, tenantId: e.target.value})}
                  placeholder="例如 tenant-alpha"
                  className="px-4 py-3 font-bold"
                  disabled={Boolean(editingTenant)}
                />
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  // 命名空间全局唯一，创建后不可修改
                </p>
              </PlatformField>
              <PlatformField label="租户显示名称 / Display Name">
                <PlatformInput
                  required
                  value={form.displayName}
                  onChange={e => setForm({...form, displayName: e.target.value})}
                  placeholder="用于列表与导航展示"
                  className="px-4 py-3 font-bold"
                />
              </PlatformField>
              <PlatformField label="隔离等级 / Isolation Tier">
                <PlatformSegmentedControl
                  value={form.isolationLevel}
                  onChange={(lvl) => setForm({ ...form, isolationLevel: lvl })}
                  disabled={Boolean(editingTenant)}
                  items={[
                    { value: IsolationLevel.SMALL, label: IsolationLevel.SMALL.toUpperCase() },
                    { value: IsolationLevel.MEDIUM, label: IsolationLevel.MEDIUM.toUpperCase() },
                    { value: IsolationLevel.LARGE, label: IsolationLevel.LARGE.toUpperCase() },
                  ]}
                  buttonClassName="py-2"
                />
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {form.isolationLevel === IsolationLevel.LARGE
                    ? "// 独立数据库实例，适合高隔离高配额租户"
                    : form.isolationLevel === IsolationLevel.MEDIUM
                      ? "// 共享集群隔离，适合团队级租户"
                      : "// 轻量共享空间，适合试运行或低成本场景"}
                </p>
                {editingTenant ? (
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    // 编辑模式下隔离等级与命名空间保持只读
                  </p>
                ) : null}
              </PlatformField>
            </div>
          </PlatformPanel>

          <PlatformPanel className="space-y-6 bg-[var(--bg-elevated)]/60 p-6">
            <PlatformSectionTitle
              title="资源配额上限"
              subtitle="限制知识库规模与向量容量，避免租户超配"
              className="mb-0 border-b-2 border-[var(--border)] pb-3"
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <PlatformField label="最大知识库数 / Max KB Count">
                <PlatformInput
                  type="number"
                  value={form.quota_maxDocs}
                  onChange={e => setForm({...form, quota_maxDocs: e.target.value})}
                  placeholder="1000"
                  className="px-4 py-3 text-sm font-bold"
                />
              </PlatformField>
              <PlatformField label="最大向量数 / Max Vector Count">
                <PlatformInput
                  type="number"
                  value={form.quota_maxVectors}
                  onChange={e => setForm({...form, quota_maxVectors: e.target.value})}
                  placeholder="100000"
                  className="px-4 py-3 text-sm font-bold"
                />
              </PlatformField>
            </div>
          </PlatformPanel>
        </div>

        <PlatformPanel className="mb-6 bg-[var(--bg-elevated)] px-5 py-3">
          <button
            type="button"
            onClick={() => setShowTenantOVConfig((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={showTenantOVConfig}
            aria-controls="tenant-ov-config-panel"
          >
            <div className="min-w-0">
              <div className="font-sans text-[13px] font-bold text-[var(--text-primary)]">
                租户级 OV / Rerank 配置
              </div>
              <div className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">
                默认继承平台全局配置，需要覆盖时再展开填写
              </div>
            </div>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]">
              <ChevronDown
                size={14}
                className={`transition-transform ${showTenantOVConfig ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          {showTenantOVConfig ? (
            <div
              id="tenant-ov-config-panel"
              className="mt-6 grid grid-cols-1 gap-6 border-t-2 border-[var(--border)] pt-6 xl:grid-cols-2"
            >
              <div className="space-y-5 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <PlatformSectionTitle
                  title="OV 配置"
                  subtitle="租户独立的引擎访问入口"
                  className="mb-0 border-b border-[var(--border)] pb-3"
                />
                <PlatformField label="OV 账号 ID">
                  <PlatformInput
                    value={form.ov_account}
                    onChange={e => setForm({ ...form, ov_account: e.target.value })}
                    placeholder="例如 tenant-alpha"
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
                <PlatformField label="OV 引擎地址">
                  <PlatformInput
                    value={form.ov_baseUrl}
                    onChange={e => setForm({ ...form, ov_baseUrl: e.target.value })}
                    placeholder="例如 http://ov.local:8000"
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
                <PlatformField label="OV API Key">
                  <PlatformInput
                    type="password"
                    value={form.ov_apiKey}
                    onChange={e => setForm({ ...form, ov_apiKey: e.target.value })}
                    placeholder={editingTenant ? "留空则保持现有密钥" : "填写租户专属访问令牌"}
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
              </div>
              <div className="space-y-5 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <PlatformSectionTitle
                  title="Rerank 配置"
                  subtitle="租户独立的重排服务入口"
                  className="mb-0 border-b border-[var(--border)] pb-3"
                />
                <PlatformField label="Rerank 接口地址">
                  <PlatformInput
                    value={form.rerank_endpoint}
                    onChange={e => setForm({ ...form, rerank_endpoint: e.target.value })}
                    placeholder="例如 http://rerank.local/v1/rerank"
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
                <PlatformField label="Rerank API Key">
                  <PlatformInput
                    type="password"
                    value={form.rerank_apiKey}
                    onChange={e => setForm({ ...form, rerank_apiKey: e.target.value })}
                    placeholder={editingTenant ? "留空则保持现有密钥" : "填写租户专属访问令牌"}
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
                <PlatformField label="Rerank 模型">
                  <PlatformInput
                    value={form.rerank_model}
                    onChange={e => setForm({ ...form, rerank_model: e.target.value })}
                    placeholder="例如 bge-reranker-v2-m3"
                    className="px-4 py-3 text-sm font-bold"
                  />
                </PlatformField>
              </div>
            </div>
          ) : null}
        </PlatformPanel>

        {form.isolationLevel === IsolationLevel.LARGE && (
          <PlatformPanel className="mb-10 animate-in zoom-in-95 bg-[var(--bg-elevated)] p-6">
            <PlatformSectionTitle
              title={
                <span className="flex items-center gap-2 text-base">
                  <HardDrive size={14}/> 独立数据库连接配置
                </span>
              }
              subtitle="仅 LARGE 隔离等级需要填写专属数据库连接"
              className="mb-6"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <PlatformField label="数据库主机 / Host">
                <PlatformInput value={form.db_host} onChange={e => setForm({...form, db_host: e.target.value})} placeholder="例如 127.0.0.1" className="px-3 py-2 text-xs" />
              </PlatformField>
              <PlatformField label="数据库端口 / Port">
                <PlatformInput value={form.db_port} onChange={e => setForm({...form, db_port: e.target.value})} placeholder="5432" className="px-3 py-2 text-xs" />
              </PlatformField>
              <PlatformField label="数据库名 / Database">
                <PlatformInput value={form.db_name} onChange={e => setForm({...form, db_name: e.target.value})} placeholder="openviking_tenant" className="px-3 py-2 text-xs" />
              </PlatformField>
              <PlatformField label="数据库用户名 / Username">
                <PlatformInput value={form.db_user} onChange={e => setForm({...form, db_user: e.target.value})} placeholder="postgres" className="px-3 py-2 text-xs" />
              </PlatformField>
              <PlatformField label="数据库密码 / Password" className="md:col-span-2">
                <PlatformInput type="password" value={form.db_pass} onChange={e => setForm({...form, db_pass: e.target.value})} placeholder="输入专属实例密码" className="px-3 py-2 text-xs" />
              </PlatformField>
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
        searchConfig={{ placeholder: "搜索租户名称 / Namespace / 隔离模式..." }}
        rowClassName={(t) => deletingIds.includes(t.id) ? "animate-collapse" : ""}
      />
    </div>
  );
}
