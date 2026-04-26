"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, FileUp, Globe, Layers, Share2, Terminal } from "lucide-react";
import { VikingWatcher } from "@/components/watcher";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { ConsoleButton, ConsoleSelectionCard, ConsoleSurfaceCard } from "@/components/console/primitives";

type SourceType = "git" | "webdav" | "local" | "url" | "enterprise";
type Integration = { id: string; name: string; type: string };
type KnowledgeBase = { id: string; name: string };

const sourceOptions = [
  {
    id: "git" as const,
    label: "Git Repository",
    icon: Globe,
    desc: "GitHub / GitLab 私有仓库",
    color: "var(--brand)",
    supportsBatchUrls: true,
    sourceListLabel: "[02] 来源路径列表",
    sourceListPlaceholder: "https://github.com/org/repo1.git\nhttps://github.com/org/repo2.git",
    supportsSubType: false,
    credentialLabel: "[03] 集成凭证",
    credentialEmptyLabel: "公开库 (NO_AUTH)",
    resolveSourceType: () => "git",
    filterIntegrations: (integrations: Integration[]) =>
      integrations.filter((integration) => ["github", "gitlab"].includes(integration.type)),
  },
  {
    id: "enterprise" as const,
    label: "Enterprise Docs",
    icon: Share2,
    desc: "飞书 / 钉钉在线文档",
    color: "#FF5733",
    supportsBatchUrls: true,
    sourceListLabel: "[02] 来源路径列表",
    sourceListPlaceholder: "https://docs.example.com/page1\nhttps://docs.example.com/page2",
    supportsSubType: true,
    credentialLabel: "[04] 集成凭证",
    credentialEmptyLabel: "请选择已存储的凭证",
    resolveSourceType: (subType: string) => subType,
    filterIntegrations: (integrations: Integration[], subType: string) =>
      integrations.filter((integration) => integration.type === subType),
  },
  {
    id: "webdav" as const,
    label: "WebDAV Sync",
    icon: Database,
    desc: "Obsidian / 思源同步",
    color: "var(--info)",
    supportsBatchUrls: false,
    sourceListLabel: "",
    sourceListPlaceholder: "",
    supportsSubType: false,
    credentialLabel: "[03] 集成凭证",
    credentialEmptyLabel: "请选择已存储的凭证",
    resolveSourceType: () => "webdav",
    filterIntegrations: (integrations: Integration[]) =>
      integrations.filter((integration) => integration.type === "webdav"),
  },
  {
    id: "local" as const,
    label: "Local Upload",
    icon: FileUp,
    desc: "PDF / MD / Word 注入",
    color: "var(--warning)",
    supportsBatchUrls: false,
    sourceListLabel: "",
    sourceListPlaceholder: "",
    supportsSubType: false,
    credentialLabel: "",
    credentialEmptyLabel: "",
    resolveSourceType: () => "local",
    filterIntegrations: () => [],
  },
  {
    id: "url" as const,
    label: "Web Extractor",
    icon: Globe,
    desc: "公开网页 / Wiki 提取",
    color: "var(--success)",
    supportsBatchUrls: true,
    sourceListLabel: "[02] 来源路径列表",
    sourceListPlaceholder: "https://docs.example.com/page1\nhttps://docs.example.com/page2",
    supportsSubType: false,
    credentialLabel: "",
    credentialEmptyLabel: "",
    resolveSourceType: () => "url",
    filterIntegrations: () => [],
  },
] as const;

export default function IngestionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSource, setActiveSource] = useState<SourceType>("git");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    kbId: "",
    rawSourceUrls: "",
    targetUri: "",
    integrationId: "",
    subType: "feishu",
  });

  useEffect(() => {
    void apiClient.get<Integration[]>("/integrations").then(setIntegrations);
    void apiClient.get<KnowledgeBase[]>("/knowledge-bases").then(setKbs);
  }, []);

  const urls = useMemo(
    () =>
      form.rawSourceUrls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
    [form.rawSourceUrls]
  );

  const selectedSource = sourceOptions.find((option) => option.id === activeSource) ?? sourceOptions[0];
  const filteredIntegrations = selectedSource.filterIntegrations(integrations, form.subType);
  const suggestedTopic = searchParams.get("q") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kbId || urls.length === 0 || !form.targetUri) {
      toast.error("请完善注入参数信息，并至少输入一个来源地址");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/import-tasks", {
        kbId: form.kbId,
        sourceUrls: urls,
        targetUri: form.targetUri,
        integrationId: form.integrationId || undefined,
        sourceType: selectedSource.resolveSourceType(form.subType),
      });
      toast.success(`成功开启批量注入：已创建 ${urls.length} 个异步任务`);
      router.push("/console/documents");
    } catch (err) {
      toast.error(`注入失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <section className="flex items-end justify-between border-b-[3px] border-[var(--border)] pb-6">
        <div>
          <h1 className="font-sans text-5xl font-black tracking-tight text-[var(--text-primary)]">注入航站楼</h1>
          <p className="mt-3 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
            多来源批量注入控制台
          </p>
        </div>
        <VikingWatcher isThinking={loading} size="md" />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="grid grid-cols-1 gap-4">
          {sourceOptions.map((source) => (
            <ConsoleSelectionCard
              key={source.id}
              type="button"
              aria-label={`选择导入来源 ${source.label}`}
              title={source.desc}
              onClick={() => setActiveSource(source.id)}
              active={activeSource === source.id}
              className={`p-5 ${activeSource !== source.id ? "text-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none" : "translate-x-1 translate-y-1"}`}
            >
              <div className="mb-2 flex items-center gap-4">
                <source.icon size={22} strokeWidth={2.4} style={{ color: activeSource === source.id ? "#FFF" : source.color }} />
                <span className="font-mono text-sm font-black uppercase tracking-[0.16em]">{source.label}</span>
              </div>
              <p className={`font-mono text-[9px] font-bold uppercase tracking-[0.14em] ${activeSource === source.id ? "text-white/75" : "text-[var(--text-secondary)]"}`}>
                {source.desc}
              </p>
            </ConsoleSelectionCard>
          ))}
        </section>

        <section className="overflow-hidden border-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[12px_12px_0px_#000]">
          <div className="flex items-center justify-between border-b-[3px] border-[var(--border)] bg-black px-5 py-4 text-white">
            <span className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.22em]">
              <Terminal size={14} /> {">>"} 批量流水线部署: {activeSource.toUpperCase()}
            </span>
            {urls.length > 0 && (
              <span className="bg-[var(--brand)] px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white">
                {urls.length} 项
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 p-8">
            {suggestedTopic ? (
              <ConsoleSurfaceCard tone="warning" className="px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.14em]">
                建议优先补录主题：{suggestedTopic}
              </ConsoleSurfaceCard>
            ) : null}
            <div className="space-y-3">
              <label className="block font-mono text-[11px] font-black uppercase tracking-[0.18em]">
                [01] 目标知识集群
              </label>
              <select
                value={form.kbId}
                onChange={(e) => setForm({ ...form, kbId: e.target.value })}
                className="w-full border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4 font-mono text-sm font-bold outline-none"
              >
                <option value="">-- 选择存储集群 --</option>
                {kbs.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSource.supportsBatchUrls && (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <label className="block font-mono text-[11px] font-black uppercase tracking-[0.18em]">
                    {selectedSource.sourceListLabel}
                  </label>
                  <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    每行一个地址
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={form.rawSourceUrls}
                  onChange={(e) => setForm({ ...form, rawSourceUrls: e.target.value })}
                  placeholder={selectedSource.sourceListPlaceholder}
                  className="w-full resize-none border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4 font-mono text-sm font-bold outline-none shadow-inner"
                />
              </div>
            )}

            {selectedSource.supportsSubType && (
              <div className="space-y-3">
                <label className="block font-mono text-[11px] font-black uppercase tracking-[0.18em]">
                  [03] 企业平台选择
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {["feishu", "dingtalk"].map((platform) => (
                    <ConsoleSelectionCard
                      key={platform}
                      type="button"
                      aria-label={`选择企业平台 ${platform === "feishu" ? "飞书" : "钉钉"}`}
                      title={platform === "feishu" ? "飞书 / Lark 文档接入" : "钉钉 / DingTalk 文档接入"}
                      onClick={() => setForm({ ...form, subType: platform })}
                      active={form.subType === platform}
                      className={`px-4 py-4 text-center font-mono text-xs font-black uppercase tracking-[0.18em] ${
                        form.subType !== platform ? "text-black hover:translate-y-0.5 hover:shadow-none" : ""
                      }`}
                    >
                      {platform === "feishu" ? "飞书 / Lark" : "钉钉 / DingTalk"}
                    </ConsoleSelectionCard>
                  ))}
                </div>
              </div>
            )}

            {selectedSource.credentialLabel && (
              <div className="space-y-3">
                <label className="block font-mono text-[11px] font-black uppercase tracking-[0.18em]">
                  {selectedSource.credentialLabel}
                </label>
                <select
                  value={form.integrationId}
                  onChange={(e) => setForm({ ...form, integrationId: e.target.value })}
                  className="w-full border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4 font-mono text-sm font-bold outline-none"
                >
                  <option value="">-- {selectedSource.credentialEmptyLabel} --</option>
                  {filteredIntegrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} (ID: {integration.id.substring(0, 6)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <label className="block font-mono text-[11px] font-black uppercase tracking-[0.18em]">
                [05] 引擎目标根路径
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 font-mono text-xs font-bold opacity-40">
                  viking://
                </div>
                <input
                  value={form.targetUri}
                  onChange={(e) => setForm({ ...form, targetUri: e.target.value })}
                  placeholder="batch-ingest/project-alpha"
                  className="w-full border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] py-4 pl-20 pr-6 font-mono text-sm font-bold outline-none"
                />
              </div>
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                批量注入时，系统会自动在根路径下创建对应的子目录。
              </p>
            </div>

            <div className="flex items-center justify-end gap-6 border-t-[3px] border-[var(--border)] border-dashed pt-8">
              {urls.length > 1 && (
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--brand)]">
                  准备部署 {urls.length} 个注入节点
                </span>
              )}
              <ConsoleButton
                type="submit"
                tone="dark"
                disabled={loading || (selectedSource.supportsBatchUrls && urls.length === 0)}
                className="gap-3 px-12 py-5 text-[10px] tracking-[0.2em] shadow-[6px_6px_0px_var(--brand)]"
              >
                <Layers size={18} strokeWidth={3} />
                {loading ? "正在调度批量任务..." : ">> 启动批量注入流水线"}
              </ConsoleButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
