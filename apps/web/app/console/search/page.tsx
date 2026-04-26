"use client";

import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Terminal, Clock, Zap, FileText, Settings2, ShieldAlert } from "lucide-react";
import {
  ConsoleBadge,
  ConsoleButton,
  ConsoleField,
  ConsoleInput,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSurfaceCard,
  ConsoleStatusPanel,
} from "@/components/console/primitives";

interface SearchResult {
  uri: string;
  score: number;
  title?: string;
  content?: string;
  stage1Score?: number;
  reranked?: boolean;
}

interface SearchResponse {
  resources?: SearchResult[];
  latencyMs?: number | null;
  logId?: string;
  rerankApplied?: boolean;
}

function tokenizeQuery(query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length > 0 ? tokens : query.trim() ? [query.trim()] : [];
}

function highlightText(text: string, query: string) {
  const tokens = tokenizeQuery(query);
  if (!text || tokens.length === 0) {
    return text;
  }

  const escapedTokens = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escapedTokens.join("|")})`, "gi");
  const parts = text.split(matcher);

  return parts.map((part, index) => {
    const matched = tokens.some((token) => token.toLowerCase() === part.toLowerCase());
    if (!matched) {
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
    }

    return (
      <mark
        key={`${part}-${index}`}
        className="bg-[var(--warning)] px-1 text-[var(--text-primary)]"
      >
        {part}
      </mark>
    );
  });
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [uri, setUri] = useState("");
  const [topK, setTopK] = useState(10);
  const [scoreThreshold, setScoreThreshold] = useState(0.3);
  const [useRerank, setUseRerank] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [searchLogId, setSearchLogId] = useState("");
  const [rerankApplied, setRerankApplied] = useState(false);
  const [feedback, setFeedback] = useState<"helpful" | "unhelpful" | "">("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const nextQuery = searchParams.get("query");
    const nextUri = searchParams.get("uri");
    if (nextQuery) {
      setQuery(nextQuery);
    }
    if (nextUri) {
      setUri(nextUri);
    }
  }, [searchParams]);

  async function runSearch() {
    setLoading(true);
    setSearched(false);
    setLoadError("");
    setFeedback("");
    setFeedbackMessage("");
    setFeedbackNote("");
    try {
      const data = await apiClient.post<SearchResponse>("/search/find", {
        query,
        uri: uri || undefined,
        topK,
        scoreThreshold,
        useRerank,
      });
      setResults(data.resources ?? []);
      setLatency(data.latencyMs ?? null);
      setSearchLogId(data.logId ?? "");
      setRerankApplied(Boolean(data.rerankApplied));
      setSearched(true);
    } catch (error: unknown) {
      setResults([]);
      setLatency(null);
      setSearchLogId("");
      setRerankApplied(false);
      setLoadError(error instanceof Error ? error.message : "检索请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch();
  }

  async function submitFeedback(nextFeedback: "helpful" | "unhelpful") {
    if (!searchLogId) {
      setFeedbackMessage("当前结果缺少检索日志标识，暂时无法回写反馈。");
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackMessage("");
    try {
      await apiClient.post(`/search/logs/${searchLogId}/feedback`, {
        feedback: nextFeedback,
        note: feedbackNote || undefined,
      });
      setFeedback(nextFeedback);
      setFeedbackMessage(nextFeedback === "helpful" ? "已记录为有帮助结果。" : "已记录为待修正结果。");
    } catch (error: unknown) {
      setFeedbackMessage(error instanceof Error ? error.message : "反馈提交失败");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="检索调试控制台" subtitle="中文结果预览 / 语义召回调试" />

      <ConsolePanel className="relative overflow-hidden p-8">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <form onSubmit={handleSearch} className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <Terminal size={18} strokeWidth={2.2} className="text-[var(--brand)]" />
              </div>
              <ConsoleInput
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
                placeholder="输入检索问题，例如：如何配置 WebDAV？"
                className="py-4 pl-12 pr-4 tracking-widest"
              />
            </div>
            <ConsoleButton type="submit" disabled={loading} className="px-10 py-4 tracking-[0.2em]">
              {loading ? "正在检索..." : "执行检索"}
            </ConsoleButton>
          </div>

          <ConsoleSurfaceCard tone="elevated" className="grid grid-cols-1 gap-4 border-dashed p-4 lg:grid-cols-[1fr_150px_150px_180px]">
            <ConsoleField label="">
              <label className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <Settings2 size={12} className="mr-2" /> 检索范围 URI
              </label>
              <ConsoleInput
                type="text"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                placeholder="viking://resources/default/"
                className="px-3 py-2 text-xs tracking-widest"
              />
            </ConsoleField>
            <ConsoleField label="">
              <label className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <Zap size={12} className="mr-2" /> 返回数量
              </label>
              <ConsoleInput
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="px-3 py-2 text-center text-xs tracking-widest"
              />
            </ConsoleField>
            <ConsoleField label="">
              <label className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <ShieldAlert size={12} className="mr-2" /> 最低分数
              </label>
              <ConsoleInput
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
                className="px-3 py-2 text-center text-xs tracking-widest"
              />
            </ConsoleField>
            <ConsoleField label="">
              <label className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <Zap size={12} className="mr-2" /> Rerank
              </label>
              <label className="flex h-[46px] cursor-pointer items-center justify-between border-[3px] border-[var(--border)] bg-[var(--bg-card)] px-3 font-mono text-[10px] font-black uppercase tracking-[0.16em]">
                <span>{useRerank ? "已启用" : "已关闭"}</span>
                <input
                  type="checkbox"
                  checked={useRerank}
                  onChange={(e) => setUseRerank(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
              </label>
            </ConsoleField>
          </ConsoleSurfaceCard>
        </form>
      </ConsolePanel>

      {loadError ? (
        <ConsoleStatusPanel
          icon={ShieldAlert}
          title="检索请求失败"
          description={loadError}
          action={
            <ConsoleButton type="button" onClick={() => void runSearch()} disabled={loading}>
              {loading ? "重试中..." : "重新加载"}
            </ConsoleButton>
          }
        />
      ) : null}

      {searched && (
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b-[3px] border-[var(--border)] pb-3">
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              {"// 召回结果: "}<span className="text-[var(--brand)]">[{results.length}]</span>
            </span>
            <div className="flex items-center gap-3">
              <ConsoleBadge tone={rerankApplied ? "success" : "warning"}>
                {rerankApplied ? "Rerank 已启用" : "仅基础召回"}
              </ConsoleBadge>
              {latency !== null && (
                <span className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <Clock size={12} className="mr-2 text-[var(--warning)]" /> {latency}ms
                </span>
              )}
            </div>
          </div>

          {results.length === 0 ? (
            <ConsoleStatusPanel
              icon={ShieldAlert}
              title="未命中可用结果"
              description="请放宽范围、降低最低分数，或补充知识资源后重试。"
              className="py-20"
            />
          ) : (
            <div className="grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)]">
              {results.map((result, index) => {
                const scoreColor =
                  result.score > 0.8 ? "var(--success)" : result.score > 0.6 ? "var(--warning)" : "var(--text-muted)";

                return (
                  <div key={`${result.uri}-${index}`} className="bg-[var(--bg-card)] p-6">
                    <div className="mb-4 flex items-start justify-between gap-4 border-b-[3px] border-[var(--border)] pb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center border-[2px] border-[var(--border)] bg-[var(--bg-elevated)] font-mono text-[10px] font-black">
                            {index + 1}
                          </span>
                          <h3 className="truncate font-sans text-xl font-black uppercase tracking-tight">
                            {highlightText(result.title ?? result.uri.split("/").pop() ?? "未命名节点", query)}
                          </h3>
                        </div>
                        <p className="mt-3 inline-flex max-w-full items-center border-[2px] border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[10px] font-black text-[var(--brand)]">
                          <FileText size={10} className="mr-2 shrink-0" />
                          <span className="truncate">{result.uri}</span>
                        </p>
                      </div>
                      <span className="border-[2px] border-[var(--border)] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: scoreColor, borderColor: scoreColor }}>
                        {(result.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    {typeof result.stage1Score === "number" && result.reranked ? (
                      <div className="mb-3 flex flex-wrap gap-2 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                        <ConsoleBadge tone="warning">初筛 {(result.stage1Score * 100).toFixed(1)}%</ConsoleBadge>
                        <ConsoleBadge tone="success">Rerank {(result.score * 100).toFixed(1)}%</ConsoleBadge>
                      </div>
                    ) : null}
                    {result.content && (
                      <div className="border-[2px] border-[var(--border)] border-l-[6px] border-l-[var(--brand)] bg-[var(--bg-elevated)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                        {highlightText(result.content, query)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <ConsolePanel className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  结果反馈
                </p>
                <p className="mt-2 font-mono text-xs font-bold leading-6 text-[var(--text-secondary)]">
                  对当前召回结果做标记，后续可用于排查无答案样本和调优召回策略。
                </p>
              </div>
              <div className="flex gap-3">
                <ConsoleButton
                  type="button"
                  tone={feedback === "helpful" ? "brand" : "dark"}
                  onClick={() => void submitFeedback("helpful")}
                  disabled={feedbackSubmitting}
                >
                  结果有帮助
                </ConsoleButton>
                <ConsoleButton
                  type="button"
                  tone={feedback === "unhelpful" ? "danger" : "dark"}
                  onClick={() => void submitFeedback("unhelpful")}
                  disabled={feedbackSubmitting}
                >
                  仍不准确
                </ConsoleButton>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row">
              <ConsoleInput
                type="text"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="补充说明，例如：命中范围过窄 / 语义不相关"
                className="flex-1 px-3 py-3 text-xs tracking-widest"
              />
              {feedbackMessage ? (
                <ConsoleSurfaceCard tone="elevated" className="px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  {feedbackMessage}
                </ConsoleSurfaceCard>
              ) : null}
            </div>
          </ConsolePanel>
        </section>
      )}
    </div>
  );
}
