"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleMetricCard,
  ConsolePageHeader,
} from "@/components/console/primitives";
import {
  CapabilityKeyTable,
  CreateKeyPanel,
  CredentialIssuerPanel,
  IssuedCredentialPanel,
  NewlyCreatedKeyPanel,
} from "./mcp-sections";
import type {
  CapabilityKey,
  ConnectionDiagnostic,
  CreateCapabilityKeyResult,
  CredentialOption,
  CredentialOptionsResponse,
  IssuedCredential,
} from "./mcp.types";

const DEFAULT_DIAGNOSTIC: ConnectionDiagnostic = {
  status: "idle",
  title: "尚未执行连接测试",
  description: "请先生成 Key 或签发 session_key，再执行一次真实 SSE 连通性检查。",
  checkedAt: null,
};

export default function McpPage() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<CapabilityKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [credentialOptions, setCredentialOptions] = useState<CredentialOption[]>([]);
  const [issuingType, setIssuingType] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential | null>(null);
  const [diagnostic, setDiagnostic] = useState<ConnectionDiagnostic>(DEFAULT_DIAGNOSTIC);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiClient.get<CapabilityKey[]>("/mcp/keys");
      setKeys(Array.isArray(response) ? response : []);
      const options = await apiClient.get<CredentialOptionsResponse>("/auth/credential-options");
      setCredentialOptions(Array.isArray(options.data?.capabilities) ? options.data.capabilities : []);
    } catch (error: unknown) {
      setKeys([]);
      setCredentialOptions([]);
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

  const stats = useMemo(() => {
    return {
      used: keys.filter((item) => item.lastUsedAt).length,
      unused: keys.filter((item) => !item.lastUsedAt).length,
    };
  }, [keys]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiClient.post<CreateCapabilityKeyResult>("/mcp/keys", { name });
      setNewlyCreatedKey(result.apiKey);
      setIssuedCredential(null);
      setName("");
      setShowCreate(false);
      toast.success("Capability Key 已创建");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIssueCredential(option: CredentialOption) {
    setIssuingType(option.credentialType);
    try {
      const payload =
        option.credentialType === "api_key"
          ? await apiClient.post<{ data: IssuedCredential }>("/auth/client-credentials", {
              name: `console-${option.channel}`,
            })
          : await apiClient.post<{ data: IssuedCredential }>(option.issueEndpoint, {});
      setIssuedCredential(payload.data);
      setNewlyCreatedKey(null);
      toast.success(`${option.credentialType} 已签发`);
      if (option.credentialType === "api_key") {
        await load();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "签发失败");
    } finally {
      setIssuingType(null);
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
    await apiClient.delete(`/mcp/keys/${id}`);
    toast.success("Capability Key 已吊销");
    await load();
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  const sseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/v1/mcp/sse` : "";
  const liveUrl = newlyCreatedKey ? `${sseUrl}?key=${newlyCreatedKey}` : "";
  const activeConnection = issuedCredential?.sessionKey
    ? {
        credentialType: "session_key",
        label: "当前 session_key",
        url: `${sseUrl}?sessionKey=${issuedCredential.sessionKey}`,
      }
    : newlyCreatedKey
      ? {
          credentialType: "api_key",
          label: "当前 API Key",
          url: liveUrl,
        }
      : null;

  async function handleConnectionTest() {
    if (!activeConnection) {
      setDiagnostic({
        status: "error",
        title: "缺少可测试凭证",
        description: "请先生成 Capability Key 或签发 session_key，再执行连接测试。",
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    setDiagnostic({
      status: "testing",
      title: "正在测试 SSE 连通性",
      description: "控制台正在向 MCP SSE 入口发起真实连接。",
      checkedAt: null,
    });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(activeConnection.url, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      const checkedAt = new Date().toISOString();

      if (!response.ok) {
        setDiagnostic({
          status: "error",
          title: "连接测试失败",
          description: `SSE 入口返回 ${response.status}，请检查当前凭证是否已失效或被吊销。`,
          checkedAt,
        });
        return;
      }

      setDiagnostic({
        status: "success",
        title: "连接测试通过",
        description: `${activeConnection.label} 已可连通，可继续在客户端执行 MCP 初始化。`,
        checkedAt,
      });
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
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function handleCopyClientConfig() {
    if (!activeConnection) {
      toast.error("请先生成 Key 或签发 session_key");
      return;
    }

    copyText(
      JSON.stringify(
        {
          mcpServers: {
            openviking: {
              transport: "sse",
              url: activeConnection.url,
            },
          },
        },
        null,
        2,
      ),
      "config",
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="Capability Key 管理"
        subtitle="统一管理 MCP、HTTP、CLI 与 Skill 的共享调用凭证"
        actions={
          <ConsoleButton
            type="button"
            onClick={() => {
              setShowCreate((value) => !value);
              setNewlyCreatedKey(null);
            }}
          >
            <Plus size={14} strokeWidth={2.6} className={showCreate ? "rotate-45" : ""} />
            {showCreate ? "收起创建表单" : "生成新 Key"}
          </ConsoleButton>
        }
      />

      <section className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
        <ConsoleMetricCard label="Key 数量" value={keys.length.toLocaleString()} />
        <ConsoleMetricCard label="已使用" value={stats.used.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="未使用" value={stats.unused.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="SSE 入口" value={sseUrl ? "已就绪" : "不可用"} tone="brand" />
      </section>

      {newlyCreatedKey && (
        <NewlyCreatedKeyPanel
          newlyCreatedKey={newlyCreatedKey}
          copiedKey={copiedKey}
          liveUrl={liveUrl}
          diagnostic={diagnostic}
          onCopyText={copyText}
          onConnectionTest={handleConnectionTest}
          onCopyClientConfig={handleCopyClientConfig}
        />
      )}

      {issuedCredential && (
        <IssuedCredentialPanel
          issuedCredential={issuedCredential}
          copiedKey={copiedKey}
          onCopyText={copyText}
        />
      )}

      {showCreate && !newlyCreatedKey && (
        <CreateKeyPanel
          name={name}
          submitting={submitting}
          onNameChange={setName}
          onCreate={handleCreate}
        />
      )}

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <CapabilityKeyTable
          keys={keys}
          loading={loading}
          loadError={loadError}
          onReload={load}
          onDelete={handleDelete}
        />

        <CredentialIssuerPanel
          credentialOptions={credentialOptions}
          issuingType={issuingType}
          activeConnectionReady={Boolean(activeConnection)}
          diagnostic={diagnostic}
          onIssueCredential={handleIssueCredential}
          onConnectionTest={handleConnectionTest}
          onCopyClientConfig={handleCopyClientConfig}
        />
      </section>
    </div>
  );
}
