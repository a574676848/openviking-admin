"use client";

import { AlertCircle, Bot, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleIconButton,
  ConsoleInput,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleSurfaceCard,
  ConsoleStatusPanel,
  ConsoleTableShell,
  resolveConsoleTableState,
} from "@/components/console/primitives";
import type { CapabilityKey, ConnectionDiagnostic, CredentialOption, IssuedCredential } from "./mcp.types";

export function NewlyCreatedKeyPanel({
  newlyCreatedKey,
  copiedKey,
  liveUrl,
  diagnostic,
  onCopyText,
  onConnectionTest,
  onCopyClientConfig,
}: {
  newlyCreatedKey: string;
  copiedKey: string | null;
  liveUrl: string;
  diagnostic: ConnectionDiagnostic;
  onCopyText: (text: string, key: string) => void;
  onConnectionTest: () => Promise<void>;
  onCopyClientConfig: () => void;
}) {
  return (
    <ConsolePanel className="p-6">
      <ConsolePanelHeader eyebrow="新凭证" title="仅显示一次，请立即保存" />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <ConsoleSurfaceCard tone="elevated">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
              API Key
            </p>
            <div className="mt-3 flex items-start gap-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs font-black text-[var(--text-primary)]">
                {newlyCreatedKey}
              </code>
              <ConsoleIconButton type="button" aria-label="复制新生成的 API Key" onClick={() => onCopyText(newlyCreatedKey, "raw")}>
                {copiedKey === "raw" ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
              </ConsoleIconButton>
            </div>
          </ConsoleSurfaceCard>
          <ConsoleSurfaceCard tone="warning">
            <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.16em]">
              <AlertCircle size={14} strokeWidth={2.6} />
              安全提示
            </div>
            <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.12em]">
              不在公共 AI 环境保存此 Key。若有泄露怀疑，直接在下方列表吊销。
            </p>
          </ConsoleSurfaceCard>
        </div>
        <div className="space-y-4">
          <ConsoleSurfaceCard tone="inverse">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--brand)]">
              SSE 连接地址
            </p>
            <div className="mt-3 flex items-start gap-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{liveUrl}</code>
              <ConsoleIconButton
                type="button"
                aria-label="复制 SSE 连接地址"
                onClick={() => onCopyText(liveUrl, "url")}
                className="bg-white text-black shadow-[3px_3px_0px_var(--brand)]"
              >
                {copiedKey === "url" ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
              </ConsoleIconButton>
            </div>
          </ConsoleSurfaceCard>
          <ConsoleSurfaceCard>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
              MCP 接入方式
            </p>
            <div className="mt-3 space-y-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
              <p>1. 打开客户端 MCP 配置。</p>
              <p>2. 选择 `SSE` 模式。</p>
              <p>3. 填入上方完整 URL。</p>
              <p>4. 保存后重新连接。</p>
            </div>
          </ConsoleSurfaceCard>
          <ConsoleSurfaceCard>
            <div className="flex flex-wrap gap-3">
              <ConsoleButton type="button" tone="dark" onClick={() => void onConnectionTest()}>
                <Bot size={14} strokeWidth={2.6} />
                {diagnostic.status === "testing" ? "测试中..." : "测试当前连接"}
              </ConsoleButton>
              <ConsoleButton type="button" tone="neutral" onClick={onCopyClientConfig}>
                <Copy size={14} strokeWidth={2.6} />
                复制客户端配置
              </ConsoleButton>
            </div>
            <div className="mt-4 space-y-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
              <p>{diagnostic.title}</p>
              <p>{diagnostic.description}</p>
              {diagnostic.checkedAt ? (
                <p>最近测试：{new Date(diagnostic.checkedAt).toLocaleString("zh-CN", { hour12: false })}</p>
              ) : null}
            </div>
          </ConsoleSurfaceCard>
        </div>
      </div>
    </ConsolePanel>
  );
}

export function IssuedCredentialPanel({
  issuedCredential,
  copiedKey,
  onCopyText,
}: {
  issuedCredential: IssuedCredential;
  copiedKey: string | null;
  onCopyText: (text: string, key: string) => void;
}) {
  const rawCredential =
    issuedCredential.accessToken ?? issuedCredential.sessionKey ?? issuedCredential.apiKey ?? "";

  return (
    <ConsolePanel className="p-6">
      <ConsolePanelHeader eyebrow="即时凭证" title="控制台即时签发结果" />
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <ConsoleSurfaceCard tone="elevated">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {issuedCredential.credentialType}
            </p>
            <div className="mt-3 flex items-start gap-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs font-black text-[var(--text-primary)]">
                {rawCredential}
              </code>
              <ConsoleIconButton type="button" aria-label="复制即时签发凭证" onClick={() => onCopyText(rawCredential, "issued")}>
                {copiedKey === "issued" ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
              </ConsoleIconButton>
            </div>
          </ConsoleSurfaceCard>
        </div>
        <ConsoleSurfaceCard>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
            生命周期
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
            <p>凭证类型：{issuedCredential.credentialType}</p>
            <p>TTL：{issuedCredential.expiresInSeconds ? `${issuedCredential.expiresInSeconds}s` : "长期 / 由平台显式吊销"}</p>
          </div>
        </ConsoleSurfaceCard>
      </div>
    </ConsolePanel>
  );
}

export function CreateKeyPanel({
  name,
  submitting,
  onNameChange,
  onCreate,
}: {
  name: string;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onCreate: (event: React.FormEvent) => void;
}) {
  return (
    <ConsolePanel className="p-6">
      <ConsolePanelHeader eyebrow="创建凭证" title="为 MCP / HTTP / CLI / Skill 生成共享凭据" />
      <form onSubmit={onCreate} className="mt-6 max-w-xl space-y-5">
        <ConsoleField label="凭证名称">
          <ConsoleInput
            required
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="例如：Cursor-Office / Claude-Local"
          />
        </ConsoleField>
        <ConsoleButton type="submit" disabled={submitting}>
          <KeyRound size={14} strokeWidth={2.6} />
          {submitting ? "生成中..." : "生成 Key"}
        </ConsoleButton>
      </form>
    </ConsolePanel>
  );
}

export function CapabilityKeyTable({
  keys,
  loading,
  loadError,
  onReload,
  onDelete,
}: {
  keys: CapabilityKey[];
  loading: boolean;
  loadError: string;
  onReload: () => Promise<void>;
  onDelete: (id: string, keyName: string) => Promise<void>;
}) {
  return (
    <ConsoleTableShell
      columns={
        <div className="grid grid-cols-[minmax(0,1fr)_180px_180px_120px]">
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            凭证列表
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            最近使用
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            创建时间
          </div>
          <div className="px-5 py-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
            操作
          </div>
        </div>
      }
      state={resolveConsoleTableState({
        loading,
        hasError: Boolean(loadError),
        hasData: keys.length > 0,
      })}
      stateContent={{
        loading: (
          <div className="bg-[var(--bg-card)] px-6 py-16 text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            正在读取 Capability Key 列表...
          </div>
        ),
        error: (
          <ConsoleEmptyState
            icon={AlertCircle}
            title="Capability Key 列表加载失败"
            description={loadError}
            action={
              <ConsoleButton type="button" onClick={() => void onReload()} disabled={loading}>
                {loading ? "重试中..." : "重新加载"}
              </ConsoleButton>
            }
          />
        ),
        empty: (
          <ConsoleEmptyState
            icon={Bot}
            title="暂无 Capability Key"
            description="请先生成调用凭证，再让客户端或 IDE 发起连接。"
          />
        ),
      }}
    >
      {keys.map((item) => (
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
            {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("zh-CN", { hour12: false }) : "从未使用"}
          </div>
          <div className="bg-[var(--bg-card)] px-5 py-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
          </div>
          <div className="bg-[var(--bg-card)] px-5 py-5">
            <ConsoleButton type="button" tone="danger" onClick={() => void onDelete(item.id, item.name)} className="h-11 px-4 tracking-[0.16em]">
              <Trash2 size={14} strokeWidth={2.6} />
              吊销
            </ConsoleButton>
          </div>
        </div>
      ))}
    </ConsoleTableShell>
  );
}

export function CredentialIssuerPanel({
  credentialOptions,
  issuingType,
  activeConnectionReady,
  diagnostic,
  onIssueCredential,
  onConnectionTest,
  onCopyClientConfig,
}: {
  credentialOptions: CredentialOption[];
  issuingType: string | null;
  activeConnectionReady: boolean;
  diagnostic: ConnectionDiagnostic;
  onIssueCredential: (option: CredentialOption) => Promise<void>;
  onConnectionTest: () => Promise<void>;
  onCopyClientConfig: () => void;
}) {
  return (
    <div className="space-y-8">
      <ConsolePanel className="p-6">
        <ConsolePanelHeader eyebrow="凭证签发" title="显式签发调用凭证" />
        <div className="mt-6 space-y-4">
          {credentialOptions.map((option) => (
            <ConsoleSurfaceCard
              key={option.credentialType}
              className="p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {option.channel}
                  </p>
                  <h3 className="mt-2 font-sans text-xl font-black text-[var(--text-primary)]">
                    {option.credentialType}
                  </h3>
                  <p className="mt-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
                    推荐给 {option.recommendedFor.join(" / ")}
                  </p>
                  <p className="mt-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
                    TTL: {option.ttlSeconds ? `${option.ttlSeconds}s` : "长期 / 需手动吊销"}
                  </p>
                </div>
                <ConsoleButton
                  type="button"
                  onClick={() => void onIssueCredential(option)}
                  disabled={issuingType === option.credentialType}
                >
                  <KeyRound size={14} strokeWidth={2.6} />
                  {issuingType === option.credentialType ? "签发中..." : "立即签发"}
                </ConsoleButton>
              </div>
            </ConsoleSurfaceCard>
          ))}
        </div>
      </ConsolePanel>

      <ConsolePanel className="p-6">
        <ConsolePanelHeader eyebrow="接入说明" title="接入纪律" />
        <div className="mt-6 space-y-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
          <p>仅使用租户内生成的 Capability Key，不复用登录 Bearer Token。</p>
          <p>浏览器或 CLI 优先走 access token + refresh token，再按需换 capability token。</p>
          <p>支持 MCP 的桌面 IDE 优先使用 session key 或 SSE 模式接入。</p>
          <p>生产环境接 Prometheus 时，优先抓取 `/api/v1/observability/capabilities/prometheus`。</p>
          <p>若怀疑泄露，直接吊销，不做“继续观望”。</p>
        </div>
      </ConsolePanel>

      <ConsoleStatusPanel
        icon={KeyRound}
        title="保持凭证短寿命、可替换、可追踪"
        description={
          activeConnectionReady
            ? "当前测试凭证已就绪。完成测试后，请只把当前凭证分发给单一客户端，避免多人共用。"
            : "当前还没有可测试凭证。建议优先签发 session_key 做桌面调试，自动化任务再使用 API Key。"
        }
        action={
          <>
            <div className="flex flex-wrap gap-3">
              <ConsoleButton type="button" tone="dark" onClick={() => void onConnectionTest()}>
                <Bot size={14} strokeWidth={2.6} />
                {diagnostic.status === "testing" ? "测试中..." : "测试当前连接"}
              </ConsoleButton>
              <ConsoleButton type="button" tone="neutral" onClick={onCopyClientConfig}>
                <Copy size={14} strokeWidth={2.6} />
                复制客户端配置
              </ConsoleButton>
            </div>
            <div className="space-y-2 font-mono text-xs font-bold text-[var(--text-secondary)]">
              <p>{diagnostic.title}</p>
              <p>{diagnostic.description}</p>
              {diagnostic.checkedAt ? (
                <p>最近测试：{new Date(diagnostic.checkedAt).toLocaleString("zh-CN", { hour12: false })}</p>
              ) : null}
              <p>1. 调试完成后优先吊销不再使用的 Key。</p>
              <p>2. 长期自动化凭证建议按固定周期重新签发并替换。</p>
              <p>3. 已吊销凭证对应的客户端需删除本地缓存后重新接入。</p>
            </div>
          </>
        }
      />
    </div>
  );
}
