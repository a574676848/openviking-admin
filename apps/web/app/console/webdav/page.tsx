"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Link2, Monitor, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/app-provider";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleMetricCard,
  ConsolePageHeader,
  ConsolePanel,
  ConsolePanelHeader,
} from "@/components/console/primitives";

interface HealthResponse {
  openviking?: {
    host?: string;
  };
  resolvedBaseUrl?: string;
}

type ClientPreset = {
  id: "obsidian" | "siyuan" | "vscode" | "cli";
  label: string;
  hint: string;
  blockLabel: string;
  buildSnippet: (input: { url: string; tenantId: string }) => string[];
};

const clientPresets: ClientPreset[] = [
  {
    id: "obsidian",
    label: "Obsidian",
    hint: "适合 Remotely Save / 通用 WebDAV 插件",
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
    id: "siyuan",
    label: "思源笔记",
    hint: "直接填服务器地址与租户凭据",
    blockLabel: "siyuan.conf",
    buildSnippet: ({ url, tenantId }) => [
      "provider=webdav",
      `endpoint=${url}`,
      `username=${tenantId}`,
      "password=<YOUR_API_KEY>",
      "base_path=/",
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    hint: "适合 WebDAV 挂载插件或文件同步扩展",
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
    id: "cli",
    label: "命令行",
    hint: "适合桌面挂载与自动化脚本",
    blockLabel: "mount.sh",
    buildSnippet: ({ url, tenantId }) => [
      `WEBDAV_URL="${url}"`,
      `WEBDAV_USER="${tenantId}"`,
      'WEBDAV_PASSWORD="<YOUR_API_KEY>"',
      "",
      'curl -u "$WEBDAV_USER:$WEBDAV_PASSWORD" \\',
      '  "$WEBDAV_URL" -X PROPFIND',
    ],
  },
];

function CodeBlock({
  title,
  lines,
  onCopy,
  copied,
}: {
  title: string;
  lines: string[];
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="ov-card overflow-hidden">
      <div className="flex items-center justify-between border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
        <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
          {title}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-9 w-9 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[3px_3px_0px_#000] transition-all hover:translate-y-0.5 hover:shadow-none"
        >
          {copied ? <Check size={14} strokeWidth={2.6} /> : <Copy size={14} strokeWidth={2.6} />}
        </button>
      </div>
      <div className="grid grid-cols-[48px_minmax(0,1fr)] bg-black text-[var(--success)]">
        <div className="border-r-[3px] border-[var(--border)] bg-black/80 px-3 py-4 font-mono text-[10px] font-black text-white/50">
          {lines.map((_, index) => (
            <div key={index} className="h-6 leading-6">
              {index + 1}
            </div>
          ))}
        </div>
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] font-bold leading-6">{lines.join("\n")}</pre>
      </div>
    </div>
  );
}

export default function WebdavConfigPage() {
  const [engineBaseUrl, setEngineBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<ClientPreset["id"]>("obsidian");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { user } = useApp();

  const tenantId = user?.tenantId || "default";

  useEffect(() => {
    apiClient
      .get<HealthResponse>("/system/health")
      .then((response) => {
        setEngineBaseUrl(resolveWebdavBaseUrl(response.resolvedBaseUrl, response.openviking?.host));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const webdavUrl = `${engineBaseUrl || resolveWebdavBaseUrl()}/webdav/${tenantId}/`;

  const preset = useMemo(() => {
    return clientPresets.find((item) => item.id === activePreset) ?? clientPresets[0];
  }, [activePreset]);

  const snippetLines = preset.buildSnippet({ url: webdavUrl, tenantId });
  const summaryLines = [
    `URL        ${webdavUrl}`,
    `USERNAME   ${tenantId}`,
    "PASSWORD   <YOUR_API_KEY>",
    "AUTH       Basic Auth",
  ];

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="WebDAV 接入面板" subtitle="Code-First Mounting / Tenant Sync Endpoint" />

      <section className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] lg:grid-cols-3">
        <ConsoleMetricCard label="Endpoint" value={loading ? "..." : "READY"} tone="brand" />
        <ConsoleMetricCard label="Tenant ID" value={tenantId} />
        <ConsoleMetricCard label="Auth Mode" value="BASIC" tone="warning" />
      </section>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col gap-8">
          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Client Presets" title="选择接入客户端" />
            <div className="mt-6 grid grid-cols-1 gap-3">
              {clientPresets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePreset(item.id)}
                  className={`border-[3px] px-4 py-4 text-left transition-all ${
                    activePreset === item.id
                      ? "border-[var(--border)] bg-black text-white shadow-[4px_4px_0px_var(--brand)]"
                      : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[3px_3px_0px_#000]"
                  }`}
                >
                  <div className="font-mono text-[10px] font-black uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">
                    {item.hint}
                  </div>
                </button>
              ))}
            </div>
          </ConsolePanel>

          <ConsolePanel className="p-6">
            <ConsolePanelHeader eyebrow="Mount Summary" title="连接要素" />
            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
                  <Link2 size={14} strokeWidth={2.6} />
                  URL
                </div>
                <p className="mt-3 break-all font-mono text-xs font-bold text-[var(--brand)]">{webdavUrl}</p>
              </div>
              <div className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
                  <KeyRound size={14} strokeWidth={2.6} />
                  Username / Password
                </div>
                <p className="mt-3 font-mono text-xs font-bold text-[var(--text-secondary)]">
                  用户名使用租户 ID，密码使用当前账号 API Key
                </p>
              </div>
              <div className="border-[3px] border-[var(--border)] bg-[var(--warning)] p-4 text-black">
                <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.18em]">
                  <Monitor size={14} strokeWidth={2.6} />
                  注意
                </div>
                <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.12em]">
                  不在浏览器或共享终端保存 API Key。客户端侧只填租户凭据，不混用 Bearer Token。
                </p>
              </div>
            </div>
          </ConsolePanel>
        </div>

        <div className="flex flex-col gap-8">
          <CodeBlock
            title="connection.env"
            lines={summaryLines}
            onCopy={() => copyText(summaryLines.join("\n"), "summary")}
            copied={copiedKey === "summary"}
          />
          <CodeBlock
            title={preset.blockLabel}
            lines={snippetLines}
            onCopy={() => copyText(snippetLines.join("\n"), preset.id)}
            copied={copiedKey === preset.id}
          />
          <div className="ov-card overflow-hidden">
            <div className="border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              诊断提示
            </div>
            <div className="grid grid-cols-1 gap-px bg-[var(--border)]">
              {[
                ["401 Unauthorized", "确认用户名为租户 ID，密码为 API Key，而非 Bearer Token。"],
                ["Connection Timeout", "检查宿主机端口、反向代理与办公网络策略。"],
                ["Folder Missing", "确认 URL 末尾保留 `/webdav/{tenantId}/` 目录前缀。"],
              ].map(([title, desc]) => (
                <div key={title} className="bg-[var(--bg-card)] px-5 py-5">
                  <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-primary)]">
                    <TerminalSquare size={14} strokeWidth={2.6} />
                    {title}
                  </div>
                  <p className="mt-3 font-mono text-xs font-bold text-[var(--text-secondary)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
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
