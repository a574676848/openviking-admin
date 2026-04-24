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
  ToggleLeft,
  ToggleRight,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleSelect,
  ConsoleIconButton,
} from "@/components/console/primitives";

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

const TYPE_META: Record<
  IntegrationType,
  {
    label: string;
    icon: LucideIcon;
    description: string;
    className: string;
    fields: Array<{ key: string; label: string; placeholder: string }>;
  }
> = {
  github: {
    label: "GitHub",
    icon: GitBranch,
    description: "源码仓库知识同步",
    className: "bg-[var(--brand)] text-white",
    fields: [
      { key: "token", label: "Access Token", placeholder: "ghp_xxx" },
      { key: "baseUrl", label: "Base URL", placeholder: "https://api.github.com" },
    ],
  },
  gitlab: {
    label: "GitLab",
    icon: GitBranch,
    description: "私有或托管 GitLab 仓库",
    className: "bg-[var(--warning)] text-black",
    fields: [
      { key: "token", label: "Access Token", placeholder: "glpat-xxx" },
      { key: "baseUrl", label: "Base URL", placeholder: "https://gitlab.com" },
    ],
  },
  webdav: {
    label: "WebDAV",
    icon: Database,
    description: "个人知识库与文件系统同步",
    className: "bg-[var(--success)] text-white",
    fields: [
      { key: "baseUrl", label: "Endpoint", placeholder: "https://dav.example.com" },
      { key: "username", label: "Username", placeholder: "tenant-id" },
      { key: "password", label: "Password", placeholder: "******" },
    ],
  },
  feishu: {
    label: "飞书 / Lark",
    icon: Share2,
    description: "文档与目录同步",
    className: "bg-[var(--brand)] text-white",
    fields: [
      { key: "appId", label: "App ID", placeholder: "cli_xxx" },
      { key: "appSecret", label: "App Secret", placeholder: "secret" },
    ],
  },
  dingtalk: {
    label: "钉钉",
    icon: MessageCircle,
    description: "钉钉文档与身份集成",
    className: "bg-[var(--brand)] text-white",
    fields: [
      { key: "appId", label: "App ID", placeholder: "dingxxx" },
      { key: "appSecret", label: "App Secret", placeholder: "secret" },
    ],
  },
  oidc: {
    label: "OIDC",
    icon: Globe,
    description: "标准单点登录联邦",
    className: "bg-black text-white",
    fields: [
      { key: "issuer", label: "Issuer", placeholder: "https://sso.example.com" },
      { key: "clientId", label: "Client ID", placeholder: "client_id" },
      { key: "clientSecret", label: "Client Secret", placeholder: "secret" },
    ],
  },
  ldap: {
    label: "LDAP / AD",
    icon: Server,
    description: "企业目录与域控集成",
    className: "bg-[var(--warning)] text-black",
    fields: [
      { key: "url", label: "LDAP URL", placeholder: "ldap://ad.example.com:389" },
      { key: "baseDN", label: "Base DN", placeholder: "dc=corp,dc=local" },
      { key: "bindDN", label: "Bind DN", placeholder: "cn=admin,dc=corp,dc=local" },
      { key: "bindPassword", label: "Bind Password", placeholder: "******" },
    ],
  },
};

export default function IntegrationsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<IntegrationForm>({
    name: "",
    type: "github",
    credentials: {},
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<Integration[]>("/integrations");
      setItems(Array.isArray(response) ? response : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const activeMeta = TYPE_META[form.type];

  const stats = useMemo(() => {
    return {
      active: items.filter((item) => item.active).length,
      inactive: items.filter((item) => !item.active).length,
      source: items.filter((item) => ["github", "gitlab", "webdav", "feishu", "dingtalk"].includes(item.type)).length,
      identity: items.filter((item) => ["oidc", "ldap"].includes(item.type)).length,
    };
  }, [items]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.post("/integrations", {
        name: form.name,
        type: form.type,
        credentials: form.credentials,
      });
      toast.success("集成已创建");
      setForm({ name: "", type: "github", credentials: {} });
      setShowForm(false);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    const approved = await confirm({
      title: "移除集成",
      description: `将删除「${name}」，关联导入或 SSO 流程会立即失效。`,
      confirmText: "移除",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) {
      return;
    }
    await apiClient.delete(`/integrations/${id}`);
    toast.success("集成已移除");
    await load();
  }

  async function handleToggle(item: Integration) {
    await apiClient.patch(`/integrations/${item.id}`, { active: !item.active });
    toast.success(item.active ? "已停用集成" : "已启用集成");
    await load();
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="集成中心"
        subtitle="Integration Registry / Credentials Vault"
        actions={
          <ConsoleButton type="button" onClick={() => setShowForm((value) => !value)}>
            <Plus size={14} strokeWidth={2.6} className={showForm ? "rotate-45" : ""} />
            {showForm ? "收起创建表单" : "新增集成"}
          </ConsoleButton>
        }
      />

      <section className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
        <ConsoleMetricCard label="Total" value={items.length.toLocaleString()} />
        <ConsoleMetricCard label="Active" value={stats.active.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="Data Sources" value={stats.source.toLocaleString()} tone="brand" />
        <ConsoleMetricCard label="Identity" value={stats.identity.toLocaleString()} tone="warning" />
      </section>

      {showForm && (
        <ConsolePanel className="p-6">
          <ConsolePanelHeader eyebrow="New Integration" title="录入凭据与接入协议" />

          <form onSubmit={handleCreate} className="mt-6 grid grid-cols-1 gap-8 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <ConsoleField label="Integration Name">
                <ConsoleInput
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如：研发 GitHub / 企业域控"
                />
              </ConsoleField>

              <ConsoleField label="Type">
                <ConsoleSelect
                  value={form.type}
                  onChange={(event) =>
                    setForm({
                      name: form.name,
                      type: event.target.value as IntegrationType,
                      credentials: {},
                    })
                  }
                >
                  {Object.entries(TYPE_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </ConsoleSelect>
              </ConsoleField>

              <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                <div className="flex items-center gap-3">
                  <activeMeta.icon size={16} strokeWidth={2.6} />
                  <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
                    {activeMeta.label}
                  </span>
                </div>
                <p className="mt-3 font-mono text-xs font-bold text-[var(--text-secondary)]">{activeMeta.description}</p>
              </div>
            </div>

            <div className="space-y-5">
              {activeMeta.fields.map((field) => (
                <ConsoleField key={field.key} label={field.label}>
                  <ConsoleInput
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
                  />
                </ConsoleField>
              ))}

              <ConsoleButton type="submit" disabled={submitting} className="mt-2">
                <KeyRound size={14} strokeWidth={2.6} />
                {submitting ? "正在提交..." : "创建集成"}
              </ConsoleButton>
            </div>
          </form>
        </ConsolePanel>
      )}

      <ConsolePanel className="overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_140px_120px_180px_160px] border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Integration
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            Type
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

        <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
          {loading ? (
            <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              正在读取集成注册表...
            </div>
          ) : items.length === 0 ? (
              <ConsoleEmptyState icon={Link2} title="暂无集成" description="create a source or identity connector first" />
            ) : (
            items.map((item) => {
              const meta = TYPE_META[item.type as IntegrationType] ?? {
                label: item.type,
                icon: Link2,
                description: "未知类型",
                className: "bg-[var(--bg-card)] text-[var(--text-primary)]",
                fields: [],
              };
              const Icon = meta.icon;

              return (
                <div
                  key={item.id}
                  className="grid gap-px bg-[var(--border)] xl:grid-cols-[minmax(0,1fr)_140px_120px_180px_160px]"
                >
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
                        <Icon size={16} strokeWidth={2.6} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-xl font-black text-[var(--text-primary)]">{item.name}</p>
                        <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                          {meta.description}
                        </p>
                        <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {item.id}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <ConsoleBadge className={meta.className}>
                      {meta.label}
                    </ConsoleBadge>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <ConsoleBadge tone={item.active ? "success" : "default"}>
                      {item.active ? "active" : "disabled"}
                    </ConsoleBadge>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <div className="flex gap-3">
                      <ConsoleIconButton
                        type="button"
                        onClick={() => void handleToggle(item)}
                        title={item.active ? "停用" : "启用"}
                      >
                        {item.active ? <ToggleRight size={16} strokeWidth={2.6} /> : <ToggleLeft size={16} strokeWidth={2.6} />}
                      </ConsoleIconButton>
                      <ConsoleButton type="button" tone="danger" onClick={() => void handleDelete(item.id, item.name)} className="h-11 px-4 tracking-[0.16em]">
                        <Trash2 size={14} strokeWidth={2.6} />
                        删除
                      </ConsoleButton>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ConsolePanel>
    </div>
  );
}
