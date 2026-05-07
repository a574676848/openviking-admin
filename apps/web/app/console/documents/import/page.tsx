"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Globe, Layers, Share2, Terminal, X } from "lucide-react";
import { VikingWatcher } from "@/components/watcher";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleButton,
  ConsoleSelectionCard,
  ConsoleSurfaceCard,
  ConsoleSelect,
} from "@/components/console/primitives";

type SourceType = "git" | "local" | "url" | "enterprise";
type Integration = { id: string; name: string; type: string };
type KnowledgeBase = { id: string; name: string };
type KnowledgeNode = { id: string; name: string; vikingUri: string | null };

const sourceOptions = [
  {
    id: "git" as const,
    label: "Git 仓库",
    icon: Globe,
    desc: "支持 GitHub / GitLab 私有仓库",
    color: "var(--brand)",
    supportsBatchUrls: true,
    sourceListLabel: "仓库地址列表",
    sourceListPlaceholder:
      "https://github.com/org/repo1.git\nhttps://github.com/org/repo2.git",
    supportsSubType: false,
    requiresIntegration: true,
    credentialLabel: "集成凭证",
    credentialEmptyLabel: "请选择 Git 凭证",
    resolveSourceType: () => "git",
    filterIntegrations: (integrations: Integration[]) =>
      integrations.filter((integration) =>
        ["github", "gitlab"].includes(integration.type),
      ),
  },
  {
    id: "enterprise" as const,
    label: "企业文档",
    icon: Share2,
    desc: "支持 飞书 / 钉钉 在线文档",
    color: "#FF5733",
    supportsBatchUrls: true,
    sourceListLabel: "文档地址列表",
    sourceListPlaceholder:
      "https://docs.example.com/page1\nhttps://docs.example.com/page2",
    supportsSubType: true,
    requiresIntegration: true,
    credentialLabel: "集成凭证",
    credentialEmptyLabel: "请选择已存储的凭证",
    resolveSourceType: (subType: string) => subType,
    filterIntegrations: (integrations: Integration[], subType: string) =>
      integrations.filter((integration) => integration.type === subType),
  },
  {
    id: "local" as const,
    label: "本地上传",
    icon: FileUp,
    desc: "支持 PDF / MD / Word / ZIP",
    color: "var(--warning)",
    supportsBatchUrls: false,
    sourceListLabel: "",
    sourceListPlaceholder: "",
    supportsSubType: false,
    requiresIntegration: false,
    credentialLabel: "",
    credentialEmptyLabel: "",
    resolveSourceType: () => "local",
    filterIntegrations: () => [],
  },
  {
    id: "url" as const,
    label: "网页提取",
    icon: Globe,
    desc: "公开网页或 Wiki 知识提取",
    color: "var(--success)",
    supportsBatchUrls: true,
    sourceListLabel: "网页地址列表",
    sourceListPlaceholder:
      "https://docs.example.com/page1\nhttps://docs.example.com/page2",
    supportsSubType: false,
    requiresIntegration: false,
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
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    kbId: "",
    rawSourceUrls: "",
    integrationId: "",
    targetNodeUri: "",
    subType: "feishu",
  });

  useEffect(() => {
    void apiClient.get<Integration[]>("/integrations").then(setIntegrations);
    void apiClient.get<KnowledgeBase[]>("/knowledge-bases").then(setKbs);
  }, []);

  useEffect(() => {
    if (!form.kbId) {
      setNodes([]);
      setForm((prev) => ({ ...prev, targetNodeUri: "" }));
      return;
    }
    void apiClient
      .get<KnowledgeNode[]>(
        `/knowledge-tree?kbId=${encodeURIComponent(form.kbId)}`,
      )
      .then((items) => {
        const nextNodes = items.filter((item) => Boolean(item.vikingUri));
        setNodes(nextNodes);
        setForm((prev) => {
          if (!prev.targetNodeUri) {
            return prev;
          }
          const stillExists = nextNodes.some(
            (item) => item.vikingUri === prev.targetNodeUri,
          );
          return stillExists ? prev : { ...prev, targetNodeUri: "" };
        });
      })
      .catch(() => {
        setNodes([]);
        setForm((prev) => ({ ...prev, targetNodeUri: "" }));
      });
  }, [form.kbId]);

  const urls = useMemo(
    () =>
      form.rawSourceUrls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
    [form.rawSourceUrls],
  );

  const selectedSource =
    sourceOptions.find((option) => option.id === activeSource) ??
    sourceOptions[0];
  const filteredIntegrations = selectedSource.filterIntegrations(
    integrations,
    form.subType,
  );
  const suggestedTopic = searchParams.get("q") ?? "";
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const hasLocalInput =
    activeSource !== "local" ||
    selectedFiles.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kbId) {
      toast.error("请完善配置信息");
      return;
    }

    if (activeSource === "local") {
      if (selectedFiles.length === 0) {
        toast.error("请先上传文件");
        return;
      }
    }

    if (selectedSource.supportsBatchUrls && urls.length === 0) {
      toast.error("请至少提供一个来源地址");
      return;
    }

    if (selectedSource.requiresIntegration && !form.integrationId) {
      toast.error("请先选择集成凭证");
      return;
    }

    setLoading(true);
    try {
      if (activeSource === "local") {
        const body = new FormData();
        body.set("kbId", form.kbId);
        if (form.targetNodeUri) {
          body.set("targetUri", form.targetNodeUri);
        }
        selectedFiles.forEach((file) => body.append("files", file));
        await apiClient.post("/import-tasks/local-upload", body);
        toast.success(
          `任务创建成功：已启动 ${selectedFiles.length} 个处理进程`,
        );
      } else {
        await apiClient.post("/import-tasks", {
          kbId: form.kbId,
          sourceUrl: urls[0],
          sourceUrls: urls,
          integrationId: form.integrationId || undefined,
          targetUri: form.targetNodeUri || undefined,
          sourceType: selectedSource.resolveSourceType(form.subType),
        });
        toast.success(`任务创建成功：已启动 ${urls.length} 个处理进程`);
      }
      router.push("/console/documents");
    } catch (err) {
      toast.error(
        `处理失败：${err instanceof Error ? err.message : "未知错误"}`,
      );
    } finally {
      setLoading(false);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  return (
    <div className="flex min-h-full flex-col gap-1">
      {/* Bento Header Section */}
      <ConsoleSurfaceCard>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
              文档导入中心
            </h1>
            <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
              支持多维数据源接入，自动化清洗、向量化并存入知识库
            </p>
          </div>
          <VikingWatcher isThinking={loading} size="md" />
        </div>
      </ConsoleSurfaceCard>

      <div className="grid grid-cols-1 gap-1 lg:grid-cols-12">
        {/* Source Selection Bento Column */}
        <div className="grid grid-cols-1 gap-1 lg:col-span-4">
          {sourceOptions.map((source) => (
            <ConsoleSelectionCard
              key={source.id}
              type="button"
              onClick={() => setActiveSource(source.id)}
              active={activeSource === source.id}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] transition-all ${
                  activeSource === source.id
                    ? "bg-white/20"
                    : "bg-[var(--bg-elevated)]"
                }`}
              >
                <source.icon
                  size={20}
                  strokeWidth={2.4}
                  style={{
                    color: activeSource === source.id ? "#FFF" : source.color,
                  }}
                />
              </div>
              <div className="text-left">
                <span className="block font-sans text-sm font-bold uppercase tracking-wider">
                  {source.label}
                </span>
                <span
                  className={`block font-sans text-[10px] font-medium uppercase tracking-wider ${
                    activeSource === source.id
                      ? "text-white/70"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {source.desc}
                </span>
              </div>
            </ConsoleSelectionCard>
          ))}
        </div>

        {/* Configuration Bento Column */}
        <ConsoleSurfaceCard className="lg:col-span-8">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4 font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            <Terminal size={14} strokeWidth={2.6} /> 导入配置参数 /
            CONFIG_PIPELINE
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-8">
            {suggestedTopic ? (
              <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning)]/5 px-4 py-3 font-sans text-xs font-bold text-[var(--warning)]">
                提示：建议将此资源映射至主题{" "}
                <span className="underline">{suggestedTopic}</span>
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                01. 目标知识库集群
              </label>
              <ConsoleSelect
                value={form.kbId}
                onChange={(e) => setForm({ ...form, kbId: e.target.value })}
              >
                <option value="">-- 选择存储集群 --</option>
                {kbs.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}
                  </option>
                ))}
              </ConsoleSelect>
            </div>

            {nodes.length > 0 && (
              <div className="space-y-3">
                <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  02. 导入目标节点
                </label>
                <ConsoleSelect
                  value={form.targetNodeUri}
                  onChange={(e) =>
                    setForm({ ...form, targetNodeUri: e.target.value })
                  }
                  placeholder="知识库根目录（默认）"
                >
                  <option value="">知识库根目录（默认）</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.vikingUri ?? ""}>
                      {node.name}
                    </option>
                  ))}
                </ConsoleSelect>
                <p className="font-sans text-[11px] text-[var(--text-muted)]">
                  已存在知识树节点时，可将本次导入内容挂到指定节点；不选择时默认进入知识库根目录。
                </p>
              </div>
            )}

            {/* Source URLs */}
            {selectedSource.supportsBatchUrls && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    {nodes.length > 0 ? "03." : "02."}{" "}
                    {selectedSource.sourceListLabel}
                  </label>
                  <span className="font-sans text-[9px] font-black text-[var(--text-muted)]">
                    COUNT: {urls.length} / 支持换行批量录入
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={form.rawSourceUrls}
                  onChange={(e) =>
                    setForm({ ...form, rawSourceUrls: e.target.value })
                  }
                  placeholder={selectedSource.sourceListPlaceholder}
                  className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4 font-sans text-xs font-bold outline-none focus:border-[var(--brand)]"
                />
              </div>
            )}

            {/* Local File Upload */}
            {activeSource === "local" && (
              <div className="space-y-3">
                <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {nodes.length > 0 ? "03." : "02."} 本地资源上传
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all ${
                    isDragging
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--text-muted)]"
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.md,.markdown,.doc,.docx,.txt,.zip"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      const files = e.target.files
                        ? Array.from(e.target.files)
                        : [];
                      setSelectedFiles((prev) => [...prev, ...files]);
                    }}
                  />
                  <FileUp
                    size={32}
                    strokeWidth={1.5}
                    className={
                      isDragging
                        ? "text-[var(--brand)]"
                        : "text-[var(--text-muted)]"
                    }
                  />
                  <p className="mt-4 font-sans text-xs font-bold text-[var(--text-primary)]">
                    点击或将文件拖拽至此处上传
                  </p>
                  <p className="mt-2 font-sans text-[10px] text-[var(--text-muted)]">
                    支持 PDF、Markdown、Word、TXT、ZIP
                  </p>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {selectedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2"
                      >
                        <span className="font-sans text-[10px] font-bold">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedFiles((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                          className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {/* Enterprise Sub-Type */}
            {selectedSource.supportsSubType && (
              <div className="space-y-3">
                <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {nodes.length > 0 ? "04." : "03."} 选择接入平台
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {["feishu", "dingtalk"].map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => setForm({ ...form, subType: platform })}
                      className={`rounded-xl border p-4 text-center font-sans text-xs font-bold uppercase tracking-wider transition-all ${
                        form.subType === platform
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm"
                          : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      {platform === "feishu"
                        ? "飞书 / Lark"
                        : "钉钉 / DingTalk"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Credential Selection */}
            {selectedSource.credentialLabel && (
              <div className="space-y-3">
                <label className="block font-sans text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  {nodes.length > 0 ? "05." : "04."}{" "}
                  {selectedSource.credentialLabel}
                </label>
                <ConsoleSelect
                  value={form.integrationId}
                  onChange={(e) =>
                    setForm({ ...form, integrationId: e.target.value })
                  }
                >
                  <option value="">
                    -- {selectedSource.credentialEmptyLabel} --
                  </option>
                  {filteredIntegrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name}
                    </option>
                  ))}
                </ConsoleSelect>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-8">
              <div className="font-sans text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                DEPLOY_MODE:{" "}
                <span className="text-[var(--brand)]">ASYNC_PIPELINE</span>
              </div>
              <ConsoleButton
                type="submit"
                tone="dark"
                disabled={
                  loading ||
                  (selectedSource.supportsBatchUrls && urls.length === 0) ||
                  !hasLocalInput
                }
                className="h-14 px-10 font-sans tracking-[0.2em]"
              >
                <Layers
                  size={18}
                  strokeWidth={2.6}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "正在调度处理..." : "执行导入任务"}
              </ConsoleButton>
            </div>
          </form>
        </ConsoleSurfaceCard>
      </div>
    </div>
  );
}
