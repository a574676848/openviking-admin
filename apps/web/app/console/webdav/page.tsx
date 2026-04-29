"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, TerminalSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleStatusPanel,
} from "@/components/console/primitives";
import { PlatformPageHeader } from "@/components/ui/platform-primitives";

interface DashboardData {
  health?: {
    ok: boolean;
    message?: string;
  };
}

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
      `open "https://${tenantId}:<YOUR_API_KEY>@${url.replace('https://', '')}"`,
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
          {copied ? <Check size={18} strokeWidth={3} /> : <Copy size={18} strokeWidth={3} />}
        </button>
      </div>
      <div className="grid h-full flex-1 grid-cols-[56px_minmax(0,1fr)] bg-black text-[var(--success)]">
        <div className="border-r-[3px] border-[var(--border)] bg-black/80 px-3 py-6 font-mono text-xs font-black text-white/40 select-none">
          {lines.map((_, index) => (
            <div key={index} className="h-7 leading-7 text-right pr-2">
              {index + 1}
            </div>
          ))}
        </div>
        <pre className="overflow-x-auto px-6 py-6 font-mono text-[13px] font-bold leading-7 tracking-wide">{lines.join("\n")}</pre>
      </div>
    </div>
  );
}

export default function WebdavConfigPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<DashboardData["health"] | null>(null);
  const [activePreset, setActivePreset] = useState<ClientPreset["id"]>("obsidian");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { user } = useApp();

  const tenantId = user?.tenantId || "default";
  const isHealthy = Boolean(health?.ok);
  const healthMessage = health?.message ?? "核心引擎状态正常";

  useEffect(() => {
    apiClient
      .get<DashboardData>("/system/dashboard")
      .then((response) => {
        setHealth(response.health ?? { ok: false, message: "核心引擎状态未知" });
      })
      .catch((error: unknown) => {
        setHealth({ ok: false, message: error instanceof Error ? error.message : "核心健康度检测失败" });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const webdavUrl = `${resolveWebdavBaseUrl()}/webdav/${tenantId}/`;

  const preset = useMemo(() => {
    return clientPresets.find((item) => item.id === activePreset) ?? clientPresets[0];
  }, [activePreset]);

  const snippetLines = preset.buildSnippet({ url: webdavUrl, tenantId });

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    window.setTimeout(() => setCopiedKey(null), 1600);
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
        actions={
          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5">
            <div className={`h-2 w-2 rounded-full ${isHealthy ? "bg-[var(--success)] shadow-[0_0_8px_var(--success)]" : "bg-[var(--danger)]"}`} />
            <span className="font-mono text-[9px] font-black uppercase tracking-widest opacity-60">
              {loading ? "CHECKING" : isHealthy ? "ONLINE" : "DEGRADED"}
            </span>
          </div>
        }
      />

      {!loading && !isHealthy && (
        <ConsoleStatusPanel
          icon={Link2}
          title="核心健康度降级"
          description={healthMessage}
          action={<ConsoleButton onClick={() => window.location.reload()}>重新检测</ConsoleButton>}
          panelClassName="mb-6"
        />
      )}

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
                <span className="font-sans text-base font-black uppercase tracking-widest">{item.label}</span>
                <span className={`mt-1 font-sans text-xs font-medium opacity-80 ${activePreset === item.id ? "text-white" : ""}`}>
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
            onCopy={() => copyText(snippetLines.join("\n"), preset.id)}
            copied={copiedKey === preset.id}
          />
        </div>
      </div>

      {/* 底部双区块布局 */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左侧：凭据管理说明 */}
        <div className="ov-card p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
              <ShieldCheck size={20} />
            </div>
            <h4 className="font-sans text-lg font-black text-[var(--text-primary)]">鉴权协议与凭据管理</h4>
          </div>
          <div className="mt-4 space-y-4 text-sm font-medium leading-relaxed text-[var(--text-secondary)]">
            <p>
              OpenViking 采用标准 <strong>HTTP Basic Auth</strong> 认证。用户名固定为当前租户标识（Tenant ID），
              密码为用户签发的 <strong>API Key</strong>。
            </p>
            <p>
              <strong>凭据来源：</strong>API Key 需要在控制台的“<strong>凭证中心</strong>”页面进行签发和管理。系统会自动将凭证进行加密落库，并在接入网关层进行实时校验。
            </p>
          </div>
        </div>

        {/* 右侧：常见诊断 */}
        <div className="ov-card p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--warning)]/10 text-[var(--warning)]">
              <TerminalSquare size={20} />
            </div>
            <h4 className="font-sans text-lg font-black text-[var(--text-primary)]">连接诊断建议</h4>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-5">
            {[
              { code: "401 Unauthorized", hint: "API Key 已过期或权限不足。请前往 凭证中心 重新签发。" },
              { code: "TIMEOUT / 504", hint: "检查办公网防火墙是否允许访问后端端口，或代理配置是否正确。" },
              { code: "PATH_ERROR", hint: "确认 URL 末尾保留完整路径，例如 /webdav/{tenant_id}/。" },
            ].map((item) => (
              <div key={item.code} className="flex items-start gap-4">
                <div className="mt-1 font-mono text-xs font-black text-[var(--brand)] uppercase shrink-0">[{item.code.split(' ')[0]}]</div>
                <p className="font-sans text-sm font-medium text-[var(--text-secondary)] leading-tight">{item.hint}</p>
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
      return resolvedBaseUrl.replace(/\/+$/, '');
    }
  }

  if (typeof window !== "undefined") {
    if (fallbackHost) {
      return `${window.location.protocol}//${fallbackHost}`;
    }
    return window.location.origin;
  }

  return fallbackHost ? `https://${fallbackHost}` : "https://viking-engine.local:1933";
}
