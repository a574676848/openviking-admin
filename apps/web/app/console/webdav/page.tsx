"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { ConsoleButton, ConsoleInput } from "@/components/console/primitives";
import { PlatformPageHeader } from "@/components/ui/platform-primitives";

const DEFAULT_WEBDAV_BASE_URL = "https://viking-engine.local:1933";
const WEBDAV_MULTI_STATUS = 207;
const WEBDAV_CHECK_TIMEOUT_MS = 8000;
const WEBDAV_CHECK_ENDPOINT = "/console/webdav/check";

type ConnectionCheckState = {
  checking: boolean;
  ok: boolean | null;
  message: string;
};

type ClientPreset = {
  id: "obsidian" | "vscode" | "windows" | "mac";
  label: string;
  hint: string;
  blockLabel: string;
  buildSnippet: (input: { url: string; tenantId: string }) => string[];
};

const clientPresets: ClientPreset[] = [
  {
    id: "obsidian",
    label: "OBSIDIAN",
    hint: "使用 Remotely Save 插件",
    blockLabel: "obsidian.json",
    buildSnippet: ({ url, tenantId }) => [
      "{",
      '  "service": "webdav",',
      `  "address": "${url}",`,
      `  "username": "${tenantId}",`,
      '  "password": "<YOUR_API_KEY>",',
      '  "remoteBaseDir": "/",',
      '  "syncConfigDir": true',
      "}",
    ],
  },
  {
    id: "vscode",
    label: "VS CODE",
    hint: "使用 WebDAV 远程同步扩展",
    blockLabel: "settings.json",
    buildSnippet: ({ url, tenantId }) => [
      "{",
      '  "webdav.connection.name": "openviking",',
      `  "webdav.connection.url": "${url}",`,
      `  "webdav.connection.username": "${tenantId}",`,
      '  "webdav.connection.password": "<YOUR_API_KEY>"',
      "}",
    ],
  },
  {
    id: "windows",
    label: "WINDOWS",
    hint: "网络驱动器挂载脚本",
    blockLabel: "explorer.ps1",
    buildSnippet: ({ url, tenantId }) => [
      `$url = "${url}"`,
      `$user = "${tenantId}"`,
      `$pass = "<YOUR_API_KEY>"`,
      "net use Z: $url /user:$user $pass /persistent:yes",
    ],
  },
  {
    id: "mac",
    label: "MAC",
    hint: "Finder 远程连接指令",
    blockLabel: "finder.sh",
    buildSnippet: ({ url, tenantId }) => [
      `open "${url}"`,
      `# 用户名：${tenantId}`,
      "# 密码：<YOUR_API_KEY>",
    ],
  },
];

function CodeBlock({
  lines,
  onCopy,
  copied,
}: {
  lines: string[];
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="ov-card relative flex h-full flex-col overflow-hidden group border-none">
      <div className="absolute right-6 top-6 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onCopy}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-md transition-all hover:bg-white/20 active:scale-95 shadow-2xl"
          title="复制配置"
        >
          {copied ? (
            <Check size={18} strokeWidth={3} />
          ) : (
            <Copy size={18} strokeWidth={3} />
          )}
        </button>
      </div>
      <div className="grid h-full flex-1 grid-cols-[56px_minmax(0,1fr)] bg-black text-[var(--success)]">
        <div className="border-r-[3px] border-[var(--border)] bg-black/80 px-3 py-6 font-sans text-xs font-black text-white/40 select-none">
          {lines.map((_, index) => (
            <div key={index} className="h-7 leading-7 text-right pr-2">
              {index + 1}
            </div>
          ))}
        </div>
        <pre className="overflow-x-auto px-6 py-6 font-sans text-[13px] font-bold leading-7 tracking-wide">
          {lines.join("\n")}
        </pre>
      </div>
    </div>
  );
}

export default function WebdavConfigPage() {
  const [activePreset, setActivePreset] =
    useState<ClientPreset["id"]>("obsidian");
  const [apiKey, setApiKey] = useState("");
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({
    checking: false,
    ok: null,
    message: "粘贴 API key 后可直接验证 WebDAV Basic Auth。",
  });
  const { user } = useApp();

  const tenantId = user?.tenantId || "default";
  const webdavUrl = `${resolveWebdavBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL)}/webdav/${tenantId}/`;

  const preset = useMemo(() => {
    return (
      clientPresets.find((item) => item.id === activePreset) ?? clientPresets[0]
    );
  }, [activePreset]);

  const snippetLines = preset.buildSnippet({ url: webdavUrl, tenantId });

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  async function runConnectionCheck() {
    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      setConnectionCheck({
        checking: false,
        ok: false,
        message: "请输入凭证信息",
      });
      return;
    }

    setConnectionCheck({
      checking: true,
      ok: null,
      message: "正在发起 PROPFIND Depth: 0 自检。",
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, WEBDAV_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(WEBDAV_CHECK_ENDPOINT, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          apiKey: trimmedApiKey,
        }),
      });

      const payload = await safeReadConnectionCheckPayload(response);

      if (!response.ok) {
        setConnectionCheck({
          checking: false,
          ok: false,
          message: payload.message || `连接自检失败：代理返回 ${response.status}。`,
        });
        return;
      }

      if (payload.status === WEBDAV_MULTI_STATUS) {
        setConnectionCheck({
          checking: false,
          ok: true,
          message: "连接自检通过，根目录返回 207 Multi-Status。",
        });
        return;
      }

      setConnectionCheck({
        checking: false,
        ok: false,
        message: buildSelfCheckFailureMessage(payload.status),
      });
    } catch (error) {
      setConnectionCheck({
        checking: false,
        ok: false,
        message:
          error instanceof Error
            ? `连接自检失败：${error.message}`
            : "连接自检失败。",
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <div className="flex min-h-full flex-col pb-10">
      <PlatformPageHeader
        title={
          <h1 className="flex items-center gap-4 font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            WebDAV 接入控制台
          </h1>
        }
        subtitle="为租户客户端生成挂载参数与诊断指引"
        subtitleClassName="mt-2 text-sm font-medium tracking-normal normal-case text-[var(--text-muted)]"
      />

      <div className="mb-6 grid grid-cols-1 gap-6">
        <div className="ov-card p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)] shadow-inner">
                <PlugZap size={24} />
              </div>
              <div className="min-w-0">
                <h3 className="font-sans text-xl font-black text-[var(--text-primary)] tracking-tight">
                  连接自检
                </h3>
                <p className="mt-1 font-sans text-sm font-medium text-[var(--text-muted)]">
                  使用 <code className="text-[var(--brand)]">PROPFIND Depth: 0</code> 验证真实 WebDAV 入口。
                </p>
              </div>
            </div>

            <div className="flex flex-1 max-w-2xl flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <div className="flex-1">
                  <ConsoleInput
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="粘贴 API key，仅用于本次自检"
                    autoComplete="off"
                    className="h-12"
                  />
                </div>
                <ConsoleButton
                  type="button"
                  onClick={() => void runConnectionCheck()}
                  disabled={connectionCheck.checking}
                  className="h-12 min-w-[140px] justify-center shadow-lg transition-all active:scale-95"
                >
                  {connectionCheck.checking ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <KeyRound size={18} />
                  )}
                  {connectionCheck.checking ? "检测中" : "连接自检"}
                </ConsoleButton>
              </div>
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all ${
                  connectionCheck.ok === true
                    ? "border-[var(--success)]/30 bg-[var(--success)]/5 text-[var(--success)]"
                    : connectionCheck.ok === false
                      ? "border-[var(--danger)]/30 bg-[var(--danger)]/5 text-[var(--danger)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    connectionCheck.ok === true
                      ? "bg-[var(--success)] animate-pulse"
                      : connectionCheck.ok === false
                        ? "bg-[var(--danger)]"
                        : "bg-[var(--text-muted)]"
                  }`}
                />
                <span className="truncate">{connectionCheck.message}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 集成配置区 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        {/* 左侧选择器 */}
        <div className="ov-card flex flex-col p-2 h-full">
          <div className="flex flex-1 flex-col gap-1.5">
            {clientPresets.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePreset(item.id)}
                className={`flex flex-col items-start rounded-2xl px-6 py-5 transition-all ${
                  activePreset === item.id
                    ? "bg-[var(--brand)] text-white shadow-xl scale-[1.02] z-10"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="font-sans text-base font-black uppercase tracking-widest">
                  {item.label}
                </span>
                <span
                  className={`mt-1 font-sans text-xs font-medium opacity-80 ${activePreset === item.id ? "text-white" : ""}`}
                >
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧代码块 */}
        <div className="flex h-full flex-col min-h-[400px]">
          <CodeBlock
            lines={snippetLines}
            onCopy={() => void copyText(snippetLines.join("\n"), preset.id)}
            copied={false}
          />
        </div>
      </div>

      {/* 底部双区块布局 */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：凭据管理说明 */}
        <div className="ov-card flex flex-col p-8 h-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
              <ShieldCheck size={20} />
            </div>
            <h4 className="font-sans text-lg font-black text-[var(--text-primary)]">
              鉴权协议与凭据管理
            </h4>
          </div>
          <div className="mt-6 space-y-4 text-sm font-medium leading-relaxed text-[var(--text-secondary)] flex-1">
            <p>
              OpenViking 采用标准 <strong>HTTP Basic Auth</strong>{" "}
              认证。用户名固定为当前租户标识（Tenant ID）， 密码为用户签发的{" "}
              <strong>API Key</strong>。
            </p>
            <p>
              <strong>凭据来源：</strong>API Key 需要在控制台的“
              <strong>凭证中心</strong>
              ”页面进行签发和管理。系统会自动将凭证进行加密落库，并在接入网关层进行实时校验。
            </p>
          </div>
        </div>

        {/* 右侧：常见诊断 */}
        <div className="ov-card flex flex-col p-8 h-full">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--warning)]/10 text-[var(--warning)]">
              <TerminalSquare size={20} />
            </div>
            <h4 className="font-sans text-lg font-black text-[var(--text-primary)]">
              连接诊断建议
            </h4>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-5 flex-1">
            {[
              {
                code: "401 Unauthorized",
                hint: "API Key 已过期或权限不足。请前往 凭证中心 重新签发。",
              },
              {
                code: "TIMEOUT / 504",
                hint: "检查办公网防火墙是否允许访问后端端口，或代理配置是否正确。",
              },
              {
                code: "PATH_ERROR",
                hint: "确认 URL 末尾保留完整路径，例如 /webdav/{tenant_id}/。",
              },
            ].map((item) => (
              <div key={item.code} className="flex items-baseline gap-4">
                <div className="font-sans text-xs font-black text-[var(--brand)] uppercase shrink-0">
                  [{item.code.split(" ")[0]}]
                </div>
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-tight">
                  {item.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveWebdavBaseUrl(resolvedBaseUrl?: string, fallbackHost?: string) {
  if (resolvedBaseUrl) {
    try {
      const parsed = new URL(resolvedBaseUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return resolvedBaseUrl.replace(/\/+$/, "");
    }
  }

  if (typeof window !== "undefined") {
    if (fallbackHost) {
      return `${window.location.protocol}//${fallbackHost}`;
    }
    return window.location.origin;
  }

  return fallbackHost ? `https://${fallbackHost}` : DEFAULT_WEBDAV_BASE_URL;
}

function encodeBasicCredential(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildSelfCheckFailureMessage(statusCode: number) {
  if (statusCode === 401) {
    return "连接自检失败：API key 无效、已过期或租户不匹配。";
  }
  if (statusCode === 403) {
    return "连接自检失败：API key 权限不足。";
  }
  if (statusCode === 404) {
    return "连接自检失败：WebDAV 租户路径不存在。";
  }
  if (statusCode === 405) {
    return "连接自检失败：当前代理未放行 PROPFIND 方法。";
  }
  return `连接自检失败：WebDAV 返回 ${statusCode}。`;
}

async function safeReadConnectionCheckPayload(response: Response) {
  try {
    const payload = (await response.json()) as {
      status?: number;
      message?: string;
    };
    return {
      status: typeof payload.status === "number" ? payload.status : response.status,
      message: payload.message,
    };
  } catch {
    return {
      status: response.status,
      message: undefined,
    };
  }
}
