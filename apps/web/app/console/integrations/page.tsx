"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  GitBranch,
  Globe,
  KeyRound,
  Link2,
  MessageCircle,
  Plus,
  Server,
  Share2,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { FormModal } from "@/components/ui/FormModal";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { apiClient } from "@/lib/apiClient";
import {
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPageHeader,
  PlatformSelect,
  PlatformStateBadge,
  PlatformStatPill,
} from "@/components/ui/platform-primitives";

interface Integration {
  id: string;
  name: string;
  type: string;
  credentials: Record<string, unknown>;
  active: boolean;
  createdAt: string;
}

type IntegrationType =
  | "github"
  | "gitlab"
  | "webdav"
  | "feishu"
  | "dingtalk"
  | "oidc"
  | "ldap";

type IntegrationForm = {
  name: string;
  type: IntegrationType;
  credentials: Record<string, string>;
};

type IntegrationTone = "brand" | "warning" | "success" | "info";

const DEFAULT_FORM: IntegrationForm = {
  name: "",
  type: "github",
  credentials: {},
};

const TYPE_META: Record<
  IntegrationType,
  {
    label: string;
    icon: LucideIcon;
    description: string;
    tone: IntegrationTone;
    fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  }
> = {
  github: {
    label: "GitHub",
    icon: GitBranch,
    description: "源码仓库知识同步",
    tone: "brand",
    fields: [
      { key: "token", label: "Access Token", placeholder: "ghp_xxx", secret: true },
      { key: "baseUrl", label: "Base URL", placeholder: "https://api.github.com" },
    ],
  },
  gitlab: {
    label: "GitLab",
    icon: GitBranch,
    description: "私有或托管 GitLab 仓库",
    tone: "warning",
    fields: [
      { key: "token", label: "Access Token", placeholder: "glpat-xxx", secret: true },
      { key: "baseUrl", label: "Base URL", placeholder: "https://gitlab.com" },
    ],
  },
  webdav: {
    label: "WebDAV",
    icon: Database,
    description: "个人知识库与文件系统同步",
    tone: "success",
    fields: [
      { key: "baseUrl", label: "Endpoint", placeholder: "https://dav.example.com" },
      { key: "username", label: "Username", placeholder: "tenant-id" },
      { key: "password", label: "Password", placeholder: "******", secret: true },
    ],
  },
  feishu: {
    label: "飞书 / Lark",
    icon: Share2,
    description: "文档与目录同步",
    tone: "brand",
    fields: [
      { key: "appId", label: "App ID", placeholder: "cli_xxx" },
      { key: "appSecret", label: "App Secret", placeholder: "secret", secret: true },
    ],
  },
  dingtalk: {
    label: "钉钉",
    icon: MessageCircle,
    description: "钉钉文档与身份集成",
    tone: "brand",
    fields: [
      { key: "appId", label: "App ID", placeholder: "dingxxx" },
      { key: "appSecret", label: "App Secret", placeholder: "secret", secret: true },
    ],
  },
  oidc: {
    label: "OIDC",
    icon: Globe,
    description: "标准单点登录联邦",
    tone: "info",
    fields: [
      { key: "issuer", label: "Issuer", placeholder: "https://sso.example.com" },
      { key: "clientId", label: "Client ID", placeholder: "client_id" },
      { key: "clientSecret", label: "Client Secret", placeholder: "secret", secret: true },
    ],
  },
  ldap: {
    label: "LDAP / AD",
    icon: Server,
    description: "企业目录与域控集成",
    tone: "warning",
    fields: [
      { key: "url", label: "LDAP URL", placeholder: "ldap://ad.example.com:389" },
      { key: "baseDN", label: "Base DN", placeholder: "dc=corp,dc=local" },
      { key: "bindDN", label: "Bind DN", placeholder: "cn=admin,dc=corp,dc=local" },
      { key: "bindPassword", label: "Bind Password", placeholder: "******", secret: true },
    ],
  },
};

function getTypeTone(type: IntegrationType): IntegrationTone {
  return TYPE_META[type].tone;
}

export default function IntegrationsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<IntegrationForm>(DEFAULT_FORM);

  const activeMeta = TYPE_META[form.type];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiClient.get<Integration[]>("/integrations");
      setItems(Array.isArray(response) ? response : []);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "集成列表加载失败");
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
      active: items.filter((item) => item.active).length,
      inactive: items.filter((item) => !item.active).length,
      source: items.filter((item) =>
        ["github", "gitlab", "webdav", "feishu", "dingtalk"].includes(item.type),
      ).length,
      identity: items.filter((item) => ["oidc", "ldap"].includes(item.type)).length,
    };
  }, [items]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");

    try {
      await apiClient.post("/integrations", {
        name: form.name,
        type: form.type,
        credentials: form.credentials,
      });
      toast.success("集成已创建");
      setForm(DEFAULT_FORM);
      setShowCreate(false);
      await load();
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "集成创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(item: Integration) {
    try {
      await apiClient.patch(`/integrations/${item.id}`, { active: !item.active });
      toast.success(item.active ? "已停用集成" : "已启用集成");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "集成状态更新失败");
    }
  }

  async function handleDelete(id: string, name: string) {
    const approved = await confirm({
      title: "移除集成",
      description: `将删除「${name}」，关联导入或 SSO 流程会立即失效。`,
      confirmText: "移除集成",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) {
      return;
    }

    try {
      await apiClient.delete(`/integrations/${id}`);
      toast.success("集成已移除");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "集成删除失败");
    }
  }

  const columns: ColumnDef<Integration>[] = [
    {
      key: "name",
      header: "集成",
      searchable: true,
      searchValue: (item) => item.name,
      sortable: true,
      sortValue: (item) => item.name,
      cell: (item) => {
        const meta = TYPE_META[item.type as IntegrationType];
        const Icon = meta?.icon ?? Link2;

        return (
          <div className="flex items-center font-mono text-sm font-bold text-[var(--text-primary)]">
            <Icon
              size={14}
              className="mr-2 text-[var(--text-muted)] transition-transform group-hover:scale-110"
            />
            {item.name}
          </div>
        );
      },
    },
    {
      key: "type",
      header: "类型",
      searchable: true,
      searchValue: (item) => TYPE_META[item.type as IntegrationType]?.label ?? item.type,
      sortable: true,
      sortValue: (item) => TYPE_META[item.type as IntegrationType]?.label ?? item.type,
      cell: (item) => {
        const meta = TYPE_META[item.type as IntegrationType];
        return (
          <PlatformStateBadge tone={meta ? getTypeTone(item.type as IntegrationType) : "muted"}>
            {meta?.label ?? item.type}
          </PlatformStateBadge>
        );
      },
    },
    {
      key: "status",
      header: "状态",
      searchable: true,
      searchValue: (item) => (item.active ? "启用中" : "已停用"),
      sortable: true,
      sortValue: (item) => item.active,
      cell: (item) => (
        <PlatformStateBadge tone={item.active ? "success" : "danger"}>
          {item.active ? "启用中" : "已停用"}
        </PlatformStateBadge>
      ),
    },
    {
      key: "createdAt",
      header: "创建时间",
      sortable: true,
      sortValue: (item) => item.createdAt,
      cell: (item) => (
        <span className="font-mono text-[10px] tracking-widest text-[var(--text-secondary)]">
          {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      headerClassName: "w-[240px] text-right",
      cellClassName: "w-[240px] text-right",
      cell: (item) => (
        <div className="flex items-center justify-end gap-2">
          <PlatformButton
            type="button"
            onClick={() => void handleToggle(item)}
            className="h-9 px-3"
            aria-label={item.active ? `停用集成 ${item.name}` : `启用集成 ${item.name}`}
            title={item.active ? `停用集成 ${item.name}` : `启用集成 ${item.name}`}
          >
            {item.active ? <ToggleRight size={14} strokeWidth={2.2} /> : <ToggleLeft size={14} strokeWidth={2.2} />}
            {item.active ? "停用" : "启用"}
          </PlatformButton>
          <PlatformButton
            type="button"
            tone="danger"
            onClick={() => void handleDelete(item.id, item.name)}
            className="h-9 px-3"
          >
            <Trash2 size={14} strokeWidth={2.2} />
            删除
          </PlatformButton>
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-full flex-col pb-10">
      <PlatformPageHeader
        title={
          <h1 className="flex items-center gap-4 font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            集成中心
          </h1>
        }
        subtitle="统一管理数据源凭证、身份接入与启停状态"
        subtitleClassName="mt-2 text-sm font-medium tracking-normal normal-case text-[var(--text-muted)]"
        actions={
          <PlatformButton
            type="button"
            onClick={() => {
              setShowCreate(true);
              setFormError("");
            }}
            className="ov-button px-6 py-3 text-xs"
          >
            <Plus size={16} strokeWidth={2} />
            <span className="font-mono font-bold uppercase tracking-widest">新增集成</span>
          </PlatformButton>
        }
      />

      <FormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="新增集成"
        saving={submitting}
        saveText="确认创建"
        savingText="创建中..."
      >
        {formError ? (
          <div className="mb-6 flex items-start gap-3 border-[var(--border-width)] border-[var(--danger)] bg-[var(--danger)]/10 p-4 font-mono text-xs font-bold uppercase tracking-widest text-[var(--danger)]">
            <ShieldAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>[创建失败] {formError}</span>
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <PlatformField label="集成名称 *" className="gap-2">
            <PlatformInput
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="例如：研发 GitHub / 企业域控"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
          <PlatformField label="集成类型" className="gap-2">
            <PlatformSelect
              value={form.type}
              onChange={(event) =>
                setForm({
                  name: form.name,
                  type: event.target.value as IntegrationType,
                  credentials: {},
                })
              }
              className="w-full bg-[var(--bg-input)] px-4 py-3 font-bold tracking-widest"
            >
              {Object.entries(TYPE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </PlatformSelect>
          </PlatformField>
        </div>

        <div className="mb-6 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
          <div className="flex items-center gap-3">
            <activeMeta.icon size={16} strokeWidth={2.2} className="text-[var(--brand)]" />
            <PlatformStateBadge tone={activeMeta.tone}>{activeMeta.label}</PlatformStateBadge>
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--text-muted)]">
            {activeMeta.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {activeMeta.fields.map((field) => (
            <PlatformField key={field.key} label={field.label} className="gap-2">
              <PlatformInput
                type={field.secret ? "password" : "text"}
                value={form.credentials[field.key] ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    credentials: {
                      ...current.credentials,
                      [field.key]: event.target.value,
                    },
                  }))
                }
                placeholder={field.placeholder}
                className="bg-[var(--bg-input)] px-4 py-3"
              />
            </PlatformField>
          ))}
        </div>
      </FormModal>

      <DataTable
        data={items}
        columns={columns}
        loading={loading}
        loadingMessage="正在同步集成列表..."
        errorMessage={loadError ? `集成列表加载失败：${loadError}` : undefined}
        emptyMessage="当前还没有可用集成"
        tableLabel="租户集成列表"
        searchConfig={{ placeholder: "搜索集成 / 类型 / 状态..." }}
        className="mt-4 flex-1"
      />

      {!loading && items.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono font-black uppercase tracking-widest">
          <PlatformStatPill label="集成总数" value={items.length} accent="var(--border)" />
          <PlatformStatPill
            label="启用中"
            value={stats.active}
            accent="var(--success)"
            backgroundClassName="bg-[var(--success)]/10"
          />
          <PlatformStatPill
            label="数据源"
            value={stats.source}
            accent="var(--brand)"
            backgroundClassName="bg-[var(--brand)]/10"
          />
          <PlatformStatPill
            label="身份接入"
            value={stats.identity}
            accent="var(--warning)"
            backgroundClassName="bg-[var(--warning)]/10"
          />
          <PlatformStatPill
            label="已停用"
            value={stats.inactive}
            accent="var(--danger)"
            backgroundClassName="bg-[var(--danger)]/10"
          />
        </div>
      ) : null}
    </div>
  );
}
