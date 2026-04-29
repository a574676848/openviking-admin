"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormModal } from "@/components/ui/FormModal";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  PlatformButton,
  PlatformField,
  PlatformInput,
  PlatformPageHeader,
  PlatformPanel,
  PlatformStateBadge,
  PlatformStatPill,
} from "@/components/ui/platform-primitives";
import { ConsoleSelect } from "@/components/console/primitives";
import { apiClient } from "@/lib/apiClient";
import type {
  CapabilityKey,
  ConnectionDiagnostic,
  CreateCapabilityKeyResult,
  CredentialOption,
  CredentialOptionsResponse,
  CredentialTtlOption,
  TenantUserOption,
} from "./capability.types";

const CLIENT_CONFIG_COPY_KEY = "config";
const COPY_RESET_DELAY_MS = 1600;
const CONNECTION_TEST_TIMEOUT_MS = 2500;
const MCP_SSE_PATH = "/api/v1/mcp/sse";
const CAPABILITY_API_BASE_PATH = "/api/v1";
const FALLBACK_API_KEY_TTL_SECONDS = 30 * 24 * 60 * 60;

const DEFAULT_DIAGNOSTIC: ConnectionDiagnostic = {
  status: "idle",
  title: "尚未执行连接测试",
  description: "请先生成 API Key，再执行真实 SSE 连通性检查。",
  checkedAt: null,
};

type ClientPreset = {
  id: "mcp" | "cli" | "http" | "skill";
  label: string;
  hint: string;
  buildSnippet: (input: { apiBaseUrl: string; mcpUrl: string }) => string[];
};

const clientPresets: ClientPreset[] = [
  {
    id: "mcp",
    label: "MCP",
    hint: "桌面客户端 / MCP Host",
    buildSnippet: ({ mcpUrl }) => [
      "{",
      '  "mcpServers": {',
      '    "openviking": {',
      '      "transport": "sse",',
      `      "url": "${mcpUrl}"`,
      "    }",
      "  }",
      "}",
    ],
  },
  {
    id: "cli",
    label: "CLI",
    hint: "命令行 / Shell 调试",
    buildSnippet: ({ apiBaseUrl }) => [
      `export OPENVIKING_BASE_URL="${apiBaseUrl}"`,
      'export OPENVIKING_API_KEY="<YOUR_API_KEY>"',
      "",
      'curl -X GET "$OPENVIKING_BASE_URL/capabilities" \\',
      '  -H "Authorization: Bearer $OPENVIKING_API_KEY"',
    ],
  },
  {
    id: "http",
    label: "HTTP",
    hint: "服务调用 / API 集成",
    buildSnippet: ({ apiBaseUrl }) => [
      "POST /api/v1/knowledge/search HTTP/1.1",
      'Host: your-openviking-host',
      'Authorization: Bearer <YOUR_API_KEY>',
      "Content-Type: application/json",
      "",
      "{",
      '  "query": "企业知识库检索关键词",',
      '  "limit": 5',
      "}",
      "",
      `# Base URL: ${apiBaseUrl}`,
    ],
  },
  {
    id: "skill",
    label: "SKILL",
    hint: "Skill / Agent 适配层",
    buildSnippet: ({ apiBaseUrl }) => [
      "const response = await fetch(",
      `  "${apiBaseUrl}/resources",`,
      "  {",
      '    headers: { Authorization: "Bearer <YOUR_API_KEY>" },',
      '  },',
      ");",
      "",
      "const data = await response.json();",
    ],
  },
];

function buildTemplateConfigUrl(baseSseUrl: string) {
  return `${baseSseUrl}?key=<YOUR_API_KEY>`;
}

function resolveDefaultTtlValue(
  options: CredentialTtlOption[],
  fallback: number | null,
): string {
  const defaultOption = options.find((option) => option.default) ?? options[0];
  const value = defaultOption?.value ?? fallback;
  return value === null ? "null" : String(value);
}

function parseTtlSelection(value: string | undefined): number | null | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "null") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}


export default function CapabilityPage() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<CapabilityKey[]>([]);
  const [users, setUsers] = useState<TenantUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activePreset, setActivePreset] = useState<ClientPreset["id"]>("mcp");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [activeCredentialId, setActiveCredentialId] = useState<string>("");
  const [visibleRawKeyId, setVisibleRawKeyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [apiKeyOption, setApiKeyOption] = useState<CredentialOption | null>(null);
  const [selectedTtl, setSelectedTtl] = useState<string>(String(FALLBACK_API_KEY_TTL_SECONDS));
  const [diagnostic, setDiagnostic] = useState<ConnectionDiagnostic>(DEFAULT_DIAGNOSTIC);

  const sseUrl = typeof window !== "undefined" ? `${window.location.origin}${MCP_SSE_PATH}` : "";
  const apiBaseUrl = typeof window !== "undefined" ? `${window.location.origin}${CAPABILITY_API_BASE_PATH}` : CAPABILITY_API_BASE_PATH;

  const activeConnection = useMemo(() => {
    if (activeCredentialId === "__new__" && newlyCreatedKey) {
      return {
        credentialType: "api_key",
        label: "新生成的 API Key",
        url: `${sseUrl}?key=${newlyCreatedKey}`,
        rawKey: newlyCreatedKey,
      };
    }

    const selectedKey = keys.find((item) => item.id === activeCredentialId);
    if (selectedKey) {
      return {
        credentialType: "api_key",
        label: selectedKey.name,
        url: `${sseUrl}?key=${selectedKey.apiKey}`,
        rawKey: selectedKey.apiKey,
      };
    }

    if (newlyCreatedKey) {
      return {
        credentialType: "api_key",
        label: "新生成的 API Key",
        url: `${sseUrl}?key=${newlyCreatedKey}`,
        rawKey: newlyCreatedKey,
      };
    }

    if (keys[0]) {
      return {
        credentialType: "api_key",
        label: keys[0].name,
        url: `${sseUrl}?key=${keys[0].apiKey}`,
        rawKey: keys[0].apiKey,
      };
    }

    return null;
  }, [activeCredentialId, keys, newlyCreatedKey, sseUrl]);

  const activeClientPreset = useMemo(
    () => clientPresets.find((item) => item.id === activePreset) ?? clientPresets[0],
    [activePreset],
  );

  const snippetLines = useMemo(
    () =>
      activeClientPreset.buildSnippet({
        apiBaseUrl,
        mcpUrl: buildTemplateConfigUrl(sseUrl),
      }),
    [activeClientPreset, apiBaseUrl, sseUrl],
  );

  const stats = useMemo(
    () => ({
      used: keys.filter((item) => item.lastUsedAt).length,
      unused: keys.filter((item) => !item.lastUsedAt).length,
      expiring: keys.filter((item) => item.expiresAt).length,
    }),
    [keys],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiClient.get<CapabilityKey[]>("/capability/keys");
      setKeys(Array.isArray(response) ? response : []);

      const userList = await apiClient.get<TenantUserOption[]>("/users");
      const activeUsers = Array.isArray(userList) ? userList.filter((user) => user.active) : [];
      setUsers(activeUsers);
      setSelectedUserId((current) => (activeUsers.some((user) => user.id === current) ? current : activeUsers[0]?.id ?? ""));

      const options = await apiClient.get<CredentialOptionsResponse>("/auth/credential-options");
      const capabilityOptions = Array.isArray(options.capabilities) ? options.capabilities : [];
      const nextApiKeyOption =
        capabilityOptions.find((option) => option.credentialType === "api_key") ?? null;
      setApiKeyOption(nextApiKeyOption);
      setSelectedTtl(
        resolveDefaultTtlValue(
          nextApiKeyOption?.ttlOptions ?? [],
          nextApiKeyOption?.ttlSeconds ?? FALLBACK_API_KEY_TTL_SECONDS,
        ),
      );
    } catch (error: unknown) {
      setKeys([]);
      setUsers([]);
      setSelectedUserId("");
      setApiKeyOption(null);
      setLoadError(error instanceof Error ? error.message : "Capability Key 列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (newlyCreatedKey) {
      setActiveCredentialId("__new__");
      return;
    }

    if (keys.length === 0) {
      setActiveCredentialId("");
      return;
    }

    if (!keys.some((item) => item.id === activeCredentialId)) {
      setActiveCredentialId(keys[0].id);
    }
  }, [activeCredentialId, keys, newlyCreatedKey]);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    window.setTimeout(() => setCopiedKey(null), COPY_RESET_DELAY_MS);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      if (!apiKeyOption) {
        toast.error("当前没有可用的 API Key 配置");
        return;
      }

      if (!selectedUserId) {
        toast.error("请选择凭证绑定用户");
        return;
      }

      const selectedTtlSeconds = parseTtlSelection(selectedTtl);
      const result = await apiClient.post<CreateCapabilityKeyResult>("/capability/keys", {
        userId: selectedUserId,
        name,
        ttlSeconds: selectedTtlSeconds,
      });
      setNewlyCreatedKey(result.apiKey);
      setDiagnostic(DEFAULT_DIAGNOSTIC);
      setName("");
      setShowCreate(false);
      setActiveCredentialId("__new__");
      toast.success("Capability Key 已创建");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, keyName: string) {
    const approved = await confirm({
      title: "吊销 Capability Key",
      description: `将吊销「${keyName}」，所有依赖该凭证的客户端会立即失去连接权限。`,
      confirmText: "吊销",
      cancelText: "保留",
      tone: "danger",
    });

    if (!approved) {
      return;
    }

    try {
      await apiClient.delete(`/capability/keys/${id}`);
      toast.success("凭证已吊销");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "吊销失败");
    }
  }

  async function handleConnectionTestByKey(key: CapabilityKey) {
    setActiveCredentialId(key.id);
    setDiagnostic(DEFAULT_DIAGNOSTIC);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);
    const url = `${sseUrl}?key=${key.apiKey}`;

    setDiagnostic({
      status: "testing",
      title: "正在测试 SSE 连通性",
      description: `控制台正在使用「${key.name}」发起真实连接。`,
      checkedAt: null,
    });

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      const checkedAt = new Date().toISOString();

      if (!response.ok) {
        setDiagnostic({
          status: "error",
          title: "连接测试失败",
          description: `SSE 入口返回 ${response.status}，请检查凭证状态或代理配置。`,
          checkedAt,
        });
        toast.error(`连接测试失败：SSE 入口返回 ${response.status}`);
        return;
      }

      setDiagnostic({
        status: "success",
        title: "连接测试通过",
        description: `凭证「${key.name}」已可连通，可继续用于 MCP 客户端接入。`,
        checkedAt,
      });
      toast.success("连接测试通过");
    } catch (error: unknown) {
      const description =
        error instanceof Error && error.name === "AbortError"
          ? "连接已发出，但在超时时间内未完成握手。请检查网络、反向代理或 SSE 转发配置。"
          : error instanceof Error
            ? error.message
            : "无法连接 MCP SSE 入口";

      setDiagnostic({
        status: "error",
        title: "连接测试失败",
        description,
        checkedAt: new Date().toISOString(),
      });
      toast.error(`连接测试失败：${description}`);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function handleCopyClientConfig() {
    copyText(snippetLines.join("\n"), CLIENT_CONFIG_COPY_KEY);
  }

  const columns: ColumnDef<CapabilityKey>[] = [
    {
      key: "name",
      header: "凭证",
      searchable: true,
      searchValue: (item) => item.name,
      sortable: true,
      sortValue: (item) => item.name,
      cell: (item) => (
        <div className="space-y-2">
          <div className="flex items-center font-sans text-sm font-bold text-[var(--text-primary)]">
            <KeyRound size={14} className="mr-2 text-[var(--text-muted)] transition-transform group-hover:scale-110" />
            {item.name}
          </div>
          <code className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">{item.id}</code>
        </div>
      ),
    },
    {
      key: "userId",
      header: "绑定用户",
      searchable: true,
      searchValue: (item) => users.find((user) => user.id === item.userId)?.username ?? item.userId,
      sortable: true,
      sortValue: (item) => users.find((user) => user.id === item.userId)?.username ?? item.userId,
      cell: (item) => {
        const user = users.find((candidate) => candidate.id === item.userId);
        return (
          <div className="space-y-1">
            <div className="text-sm font-bold text-[var(--text-primary)]">{user?.username ?? item.userId}</div>
            <div className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">{item.userId}</div>
          </div>
        );
      },
    },
    {
      key: "usage",
      header: "使用状态",
      searchable: true,
      searchValue: (item) => (item.lastUsedAt ? "已使用" : "未使用"),
      sortable: true,
      sortValue: (item) => Boolean(item.lastUsedAt),
      cell: (item) => (
        <div className="space-y-2">
          <PlatformStateBadge tone={item.lastUsedAt ? "success" : "warning"}>
            {item.lastUsedAt ? "已使用" : "未使用"}
          </PlatformStateBadge>
          <div className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
            {item.lastUsedAt
              ? new Date(item.lastUsedAt).toLocaleString("zh-CN", { hour12: false })
              : "尚未产生调用记录"}
          </div>
        </div>
      ),
    },
    {
      key: "expiresAt",
      header: "有效期",
      searchable: true,
      searchValue: (item) => (item.expiresAt ? "有限期" : "长期有效"),
      sortable: true,
      sortValue: (item) => item.expiresAt ?? "9999-12-31T00:00:00.000Z",
      cell: (item) => {
        if (!item.expiresAt) {
          return <PlatformStateBadge tone="brand">长期有效</PlatformStateBadge>;
        }

        const isExpired = new Date(item.expiresAt).getTime() <= Date.now();
        return (
          <div className="space-y-2">
            <PlatformStateBadge tone={isExpired ? "danger" : "info"}>
              {isExpired ? "已过期" : "有效中"}
            </PlatformStateBadge>
            <div className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
              {new Date(item.expiresAt).toLocaleString("zh-CN", { hour12: false })}
            </div>
          </div>
        );
      },
    },
    {
      key: "rawValue",
      header: "原始值",
      cell: (item) => {
        const isVisible = visibleRawKeyId === item.id;
        const maskedValue = `${item.apiKey.substring(0, 8)}***${item.apiKey.substring(item.apiKey.length - 4)}`;
        return (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
              {isVisible ? item.apiKey : maskedValue}
            </code>
            <div className="flex items-center gap-1">
              <PlatformButton
                type="button"
                onClick={() => setVisibleRawKeyId((current) => (current === item.id ? null : item.id))}
                className="h-8 px-2"
              >
                {isVisible ? <EyeOff size={14} strokeWidth={2.2} /> : <Eye size={14} strokeWidth={2.2} />}
              </PlatformButton>
              <PlatformButton
                type="button"
                onClick={() => copyText(item.apiKey, `list-${item.id}`)}
                className="h-8 px-2"
              >
                {copiedKey === `list-${item.id}` ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2.4} />}
              </PlatformButton>
            </div>
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "创建时间",
      sortable: true,
      sortValue: (item) => item.createdAt,
      cell: (item) => (
        <span className="font-sans text-[10px] tracking-widest text-[var(--text-secondary)]">
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
            onClick={() => void handleConnectionTestByKey(item)}
            className="h-9 px-3"
          >
            <Bot size={14} strokeWidth={2.2} />
            测试连接
          </PlatformButton>
          <PlatformButton
            type="button"
            tone="danger"
            onClick={() => void handleDelete(item.id, item.name)}
            className="h-9 px-3"
          >
            <Trash2 size={14} strokeWidth={2.2} />
            吊销
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
            凭证中心
          </h1>
        }
        subtitle="统一管理 MCP、CLI、HTTP 与 Skill 共享调用凭证"
        subtitleClassName="mt-2 text-sm font-medium tracking-normal normal-case text-[var(--text-muted)]"
        actions={
          <>
            <PlatformButton
              type="button"
              onClick={() => setShowCreate(true)}
              className="ov-button px-6 py-3 text-xs"
            >
              <Plus size={16} strokeWidth={2} />
              <span className="font-sans font-bold uppercase tracking-widest">新增凭证</span>
            </PlatformButton>
          </>
        }
      />

      <FormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="新增凭证"
        saving={submitting}
        saveText="确认创建"
        savingText="创建中..."
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <PlatformField label="凭证名称 *" className="gap-2">
            <PlatformInput
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：Cursor-Office / Claude-Local"
              className="bg-[var(--bg-input)] px-4 py-3"
            />
          </PlatformField>
          <PlatformField label="绑定用户 *" className="gap-2">
            <ConsoleSelect
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={users.length === 0}
            >
              {users.length === 0 ? <option value="">暂无可绑定用户</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </ConsoleSelect>
          </PlatformField>
          <PlatformField label="有效期" className="gap-2">
            <ConsoleSelect
              value={selectedTtl}
              onChange={(event) => setSelectedTtl(event.target.value)}
            >
              {(apiKeyOption?.ttlOptions ?? [
                { label: "30 天", value: FALLBACK_API_KEY_TTL_SECONDS, default: true },
              ]).map((option) => (
                <option key={`${option.label}-${String(option.value)}`} value={option.value === null ? "null" : String(option.value)}>
                  {option.label}
                </option>
              ))}
            </ConsoleSelect>
          </PlatformField>
        </div>
        <p className="mt-4 text-xs font-medium text-[var(--text-muted)]">
          凭证权限继承所选用户的租户上下文，推荐使用 30 天到 90 天的可轮换周期。
        </p>
      </FormModal>

      <PlatformPanel className="overflow-hidden p-0">
        <div className="px-6 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">客户端配置</p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr] px-4 pb-4">
          <div className="ov-card flex h-full flex-col p-2">
            <div className="flex flex-1 flex-col gap-1.5">
              {clientPresets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePreset(item.id)}
                  className={`flex flex-col items-start rounded-2xl px-6 py-5 text-left transition-all ${
                    activePreset === item.id
                      ? "bg-[var(--brand)] text-white shadow-xl scale-[1.02] z-10"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="font-sans text-base font-black uppercase tracking-widest">{item.label}</span>
                  <span className={`mt-1 font-sans text-xs font-medium opacity-80 ${activePreset === item.id ? "text-white" : ""}`}>
                    {item.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="group relative flex min-h-[360px] flex-col">
            <div className="absolute right-6 top-6 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={handleCopyClientConfig}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95 shadow-2xl"
                  title="复制配置"
                >
                  {copiedKey === CLIENT_CONFIG_COPY_KEY ? <Check size={18} strokeWidth={3} /> : <Copy size={18} strokeWidth={3} />}
                </button>
            </div>
            <div className="grid h-full flex-1 grid-cols-[56px_minmax(0,1fr)] bg-black text-[var(--success)]">
              <div className="border-r-[3px] border-[var(--border)] bg-black/80 px-3 py-6 font-sans text-xs font-black text-white/40 select-none">
                {snippetLines.map((_, index) => (
                  <div key={index} className="h-7 leading-7 text-right pr-2">
                    {index + 1}
                  </div>
                ))}
              </div>
              <pre className="overflow-x-auto px-6 py-6 font-sans text-[13px] font-bold leading-7 tracking-wide">
                {snippetLines.join("\n")}
              </pre>
            </div>
          </div>
        </div>
      </PlatformPanel>

      <DataTable
        data={keys}
        columns={columns}
        loading={loading}
        loadingMessage="正在同步凭证列表..."
        errorMessage={loadError ? `Capability Key 列表加载失败：${loadError}` : undefined}
        emptyMessage="暂无凭证"
        tableLabel="租户凭证列表"
        searchConfig={{ placeholder: "搜索凭证 / 状态..." }}
        className="mt-6 flex-1"
      />

      {!loading && !loadError ? (
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-sans font-black uppercase tracking-widest">
          <PlatformStatPill label="凭证总数" value={keys.length} accent="var(--border)" />
          <PlatformStatPill
            label="已使用"
            value={stats.used}
            accent="var(--success)"
            backgroundClassName="bg-[var(--success)]/10"
          />
          <PlatformStatPill
            label="未使用"
            value={stats.unused}
            accent="var(--warning)"
            backgroundClassName="bg-[var(--warning)]/10"
          />
          <PlatformStatPill
            label="有限期"
            value={stats.expiring}
            accent="var(--info)"
            backgroundClassName="bg-[var(--info)]/10"
          />
        </div>
      ) : null}

      {loadError ? (
        <PlatformPanel className="mt-6 border-[var(--danger)] bg-[var(--danger)]/10 p-5">
          <div className="flex items-start gap-3 text-[var(--danger)]">
            <AlertCircle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-sans text-sm font-bold">凭证中心暂不可用</p>
              <p className="mt-1 text-sm font-medium">{loadError}</p>
            </div>
          </div>
        </PlatformPanel>
      ) : null}
    </div>
  );
}
