"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleIconButton,
  ConsoleInput,
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
} from "@/components/console/primitives";

interface McpKey {
  id: string;
  name: string;
  apiKey: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateMcpKeyResult {
  apiKey: string;
}

export default function McpPage() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<McpKey[]>("/mcp/keys");
      setKeys(Array.isArray(response) ? response : []);
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
      const result = await apiClient.post<CreateMcpKeyResult>("/mcp/keys", { name });
      setNewlyCreatedKey(result.apiKey);
      setName("");
      setShowCreate(false);
      toast.success("MCP Key 已创建");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, keyName: string) {
    const approved = await confirm({
      title: "吊销 MCP Key",
      description: `将吊销「${keyName}」，所有已接入客户端会立即失去连接权限。`,
      confirmText: "吊销",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) {
      return;
    }
    await apiClient.delete(`/mcp/keys/${id}`);
    toast.success("MCP Key 已吊销");
    await load();
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  const sseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp/sse` : "";
  const liveUrl = newlyCreatedKey ? `${sseUrl}?key=${newlyCreatedKey}` : "";

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader
        title="MCP 智能助手"
        subtitle="MCP Access / Tooling Bridge Endpoint"
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
        <ConsoleMetricCard label="Keys" value={keys.length.toLocaleString()} />
        <ConsoleMetricCard label="Used" value={stats.used.toLocaleString()} tone="success" />
        <ConsoleMetricCard label="Unused" value={stats.unused.toLocaleString()} tone="warning" />
        <ConsoleMetricCard label="Endpoint" value={sseUrl ? "LIVE" : "N/A"} tone="brand" />
      </section>

      {newlyCreatedKey && (
        <ConsolePanel className="p-6">
          <ConsolePanelHeader eyebrow="New Key" title="仅显示一次，请立即保存" />
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  API Key
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs font-black text-[var(--text-primary)]">
                    {newlyCreatedKey}
                  </code>
                  <ConsoleIconButton type="button" onClick={() => copyText(newlyCreatedKey, "raw")}>
                    {copiedKey === "raw" ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
                  </ConsoleIconButton>
                </div>
              </div>
              <div className="border-[3px] border-[var(--border)] bg-[var(--warning)] p-5 text-black">
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.16em]">
                  <AlertCircle size={14} strokeWidth={2.6} />
                  安全提示
                </div>
                <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.12em]">
                  不在公共 AI 环境保存此 Key。若有泄露怀疑，直接在下方列表吊销。
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="border-[3px] border-[var(--border)] bg-black p-5 text-white">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--brand)]">
                  Cursor SSE URL
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{liveUrl}</code>
                  <ConsoleIconButton type="button" onClick={() => copyText(liveUrl, "url")} className="bg-white text-black shadow-[3px_3px_0px_var(--brand)]">
                    {copiedKey === "url" ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
                  </ConsoleIconButton>
                </div>
              </div>
              <div className="border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-5">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  接入方式
                </p>
                <div className="mt-3 space-y-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
                  <p>1. 打开客户端 MCP 配置。</p>
                  <p>2. 选择 `SSE` 模式。</p>
                  <p>3. 填入上方完整 URL。</p>
                  <p>4. 保存后重新连接。</p>
                </div>
              </div>
            </div>
          </div>
        </ConsolePanel>
      )}

      {showCreate && !newlyCreatedKey && (
        <ConsolePanel className="p-6">
          <ConsolePanelHeader eyebrow="Create Key" title="为终端或 IDE 生成独立凭据" />
          <form onSubmit={handleCreate} className="mt-6 max-w-xl space-y-5">
            <ConsoleField label="Key Name">
              <ConsoleInput
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：Cursor-Office / Claude-Local"
              />
            </ConsoleField>
            <ConsoleButton type="submit" disabled={submitting}>
              <KeyRound size={14} strokeWidth={2.6} />
              {submitting ? "生成中..." : "生成 Key"}
            </ConsoleButton>
          </form>
        </ConsolePanel>
      )}

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <ConsolePanel className="overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_180px_180px_120px] border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)]">
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Key Registry
            </div>
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Last Used
            </div>
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Created
            </div>
            <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Action
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
            {loading ? (
              <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                正在读取 Key 列表...
              </div>
            ) : keys.length === 0 ? (
              <ConsoleEmptyState icon={Bot} title="暂无 MCP Key" description="generate a key before connecting clients" />
            ) : (
              keys.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-px bg-[var(--border)] xl:grid-cols-[minmax(0,1fr)_180px_180px_120px]"
                >
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <p className="font-sans text-xl font-black text-[var(--text-primary)]">{item.name}</p>
                    <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {item.id}
                    </p>
                    <p className="mt-3 inline-flex border-[3px] border-[var(--border)] bg-black px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[3px_3px_0px_var(--brand)]">
                      {`${item.apiKey.substring(0, 8)}***${item.apiKey.substring(item.apiKey.length - 4)}`}
                    </p>
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("zh-CN", { hour12: false }) : "never"}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                  <div className="bg-[var(--bg-card)] px-5 py-5">
                    <ConsoleButton type="button" tone="danger" onClick={() => void handleDelete(item.id, item.name)} className="h-11 px-4 tracking-[0.16em]">
                      <Trash2 size={14} strokeWidth={2.6} />
                      吊销
                    </ConsoleButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </ConsolePanel>

        <ConsolePanel className="p-6">
          <ConsolePanelHeader eyebrow="Connection Guide" title="接入纪律" />
          <div className="mt-6 space-y-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
            <p>仅使用租户内生成的 MCP Key，不复用登录 Bearer Token。</p>
            <p>每个客户端单独生成一把 Key，便于审计与吊销。</p>
            <p>优先使用 SSE 模式接入支持 MCP 的桌面 IDE。</p>
            <p>若怀疑泄露，直接吊销，不做“继续观望”。</p>
          </div>
        </ConsolePanel>
      </section>
    </div>
  );
}
