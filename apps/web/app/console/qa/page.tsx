"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings, Terminal, Trash2, Zap, MessageSquare, Target, Activity, ShieldAlert, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { readSessionUser } from "@/lib/session";
import {
  ConsoleBadge,
  ConsoleChatBubble,
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleInput,
  ConsolePanel,
  ConsolePanelHeader,
  ConsoleSurfaceCard,
  ConsoleSourceCard,
  ConsolePageHeader,
  ConsoleStatsGrid,
  ConsoleMetricCard,
  ConsoleSelect,
} from "@/components/console";

interface SearchResult {
  uri: string;
  score: number;
  title?: string;
  content?: string;
  reranked?: boolean;
  stage1Score?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
  logId?: string;
}

interface SearchResponse {
  resources?: SearchResult[];
  logId?: string;
  rerankApplied?: boolean;
}

interface KnowledgeBaseOption {
  id: string;
  name: string;
  vikingUri: string;
}

export default function QaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uri, setUri] = useState("");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [topK, setTopK] = useState(5);
  const [scoreThreshold, setScoreThreshold] = useState(0.3);
  const [useRerank, setUseRerank] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const messageViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    apiClient.get<KnowledgeBaseOption[]>("/knowledge-bases")
      .then((list) => {
        if (active) setKnowledgeBases(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) setKnowledgeBases([]);
      });
    return () => { active = false; };
  }, []);

  const hasMatchedUri = useMemo(
    () => knowledgeBases.some((item) => item.vikingUri === uri),
    [knowledgeBases, uri]
  );
  const currentUsername = useMemo(
    () => readSessionUser()?.username?.trim() || "当前账号",
    []
  );

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  async function requestAnswer(userMsg: string) {
    setLoading(true);
    setLoadError("");
    setLastQuestion(userMsg);

    try {
      const data = await apiClient.post<SearchResponse>("/search/find", { 
        query: userMsg, 
        uri: uri || undefined, 
        topK,
        scoreThreshold,
        useRerank,
      });
      const sources = data.resources ?? [];
      const answer =
        sources.length === 0
          ? "当前知识库中未检索到匹配的参考信息，请尝试调整检索 URI 作用域或降低分数阈值。"
          : `已成功召回 ${sources.length} 条关联知识切片${data.rerankApplied ? "（已应用 Rerank 重排）" : ""}，正在为您同步问答上下文。`;

      setMessages((prev) => [...prev, { role: "assistant", content: answer, sources, logId: data.logId }]);
    } catch {
      setLoadError("检索服务响应异常，请检查底层引擎 (OpenViking Core) 是否在线。");
      toast.error("检索请求失败，核心引擎可能已离线");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    await requestAnswer(userMsg);
  }

  return (
    <div className="flex min-h-full flex-col gap-8 pb-10">
      <ConsolePageHeader
        title="沙盒问答调试"
        subtitle="面向研发与运维的知识问答仿真终端，可实时观测知识召回深度与重排权重"
        actions={
          messages.length > 0 && (
            <ConsoleButton
              type="button"
              tone="danger"
              onClick={() => setMessages([])}
              className="px-6"
            >
              <Trash2 size={14} className="mr-2" />
              清空调试上下文
            </ConsoleButton>
          )
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-8">
          <ConsolePanel className="relative flex min-h-[600px] flex-col overflow-hidden p-0">
            <div
              ref={messageViewportRef}
              className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-thin scrollbar-thumb-[var(--border)]"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <ConsoleEmptyState
                    icon={MessageSquare}
                    title="待命状态 (READY)"
                    description="请输入检索指令或问题，系统将根据当前调试参数在知识空间内进行向量检索。"
                    className="py-16"
                  />
                  <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { label: "如何配置知识库？", desc: "基础操作指引" },
                      { label: "向量检索的原理是什么？", desc: "核心算法解析" },
                      { label: "支持哪些非结构化数据？", desc: "数据兼容性查询" },
                      { label: "如何验证 Rerank 效果？", desc: "重排机制调试" }
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setInput(item.label)}
                        className="flex flex-col gap-1 rounded-2xl border-2 border-[var(--border)] bg-[var(--bg-card)] p-5 text-left transition-all hover:border-[var(--brand)] hover:bg-[var(--brand-muted)]/10 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-sans text-sm font-black text-[var(--text-primary)]">
                            {item.label}
                          </span>
                          <Zap size={14} className="text-[var(--text-muted)] group-hover:text-[var(--brand)] transition-colors" />
                        </div>
                        <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-60">
                          {item.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  {messages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <ConsoleChatBubble
                        role={message.role}
                        label={message.role === "user" ? currentUsername : "ov精灵"}
                        content={message.content}
                      />
                      {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                        <div className="mt-8 grid w-full grid-cols-1 gap-5 xl:grid-cols-2">
                          {message.sources.map((source, sourceIndex) => (
                            <ConsoleSourceCard key={`${source.uri}-${sourceIndex}`} index={sourceIndex} source={source} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {loadError && (
                    <div className="rounded-[var(--radius-base)] border-[3px] border-[var(--danger)]/30 bg-[var(--danger)]/5 p-8 text-center animate-in zoom-in-95 duration-200">
                      <p className="font-sans text-base font-black text-[var(--danger)]">{loadError}</p>
                      <ConsoleButton
                        type="button"
                        tone="danger"
                        onClick={() => void requestAnswer(lastQuestion)}
                        disabled={loading || !lastQuestion}
                        className="mt-6 px-10"
                      >
                        {loading ? "重新召回中..." : "重新发起检索请求"}
                      </ConsoleButton>
                    </div>
                  )}

                  {loading && (
                    <div className="flex items-start">
                      <div className="flex gap-2 rounded-2xl border-2 border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-inner">
                        <div className="h-2 w-2 animate-bounce bg-[var(--brand)] rounded-full" />
                        <div className="h-2 w-2 animate-bounce bg-[var(--brand)] [animation-delay:0.2s] rounded-full" />
                        <div className="h-2 w-2 animate-bounce bg-[var(--brand)] [animation-delay:0.4s] rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] p-8">
              <form onSubmit={handleSend} className="relative flex items-center gap-4">
                <div className="relative flex-1 group">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入问题或检索指令 (e.g. 如何配置 WebDAV)..."
                    className="w-full rounded-[var(--radius-base)] border-[3px] border-[var(--border)] bg-[var(--bg-card)] px-6 py-5 font-sans text-sm font-black text-[var(--text-primary)] outline-none transition-all focus:border-[var(--brand)] focus:shadow-[0_0_25px_rgba(var(--brand-rgb),0.1)] group-hover:border-[var(--text-muted)]/30"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 font-sans text-[10px] font-black text-[var(--text-muted)] pointer-events-none opacity-40 group-focus-within:opacity-100 transition-opacity">
                    [ CMD + ENTER ] TO SYNC
                  </div>
                </div>
                <ConsoleButton
                  type="submit"
                  tone="brand"
                  disabled={loading || !input.trim()}
                  className="h-full rounded-[var(--radius-base)] px-10 py-5 text-sm"
                >
                  发起请求
                </ConsoleButton>
              </form>
            </div>
          </ConsolePanel>
        </div>

        <aside className="flex flex-col gap-8">
          <ConsolePanel className="relative overflow-hidden p-0">
            <div className="p-8 space-y-8">
              <div className="space-y-3">
                <label className="flex items-center gap-2 font-sans text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <Settings2 size={12} />
                  检索作用域 (URI_SCOPE)
                </label>
                <ConsoleSelect
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  className="bg-[var(--bg-elevated)]/50 border-[2px] h-12 px-4 text-xs tracking-wider"
                >
                  <option value="">全部知识库</option>
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.vikingUri}>
                      {kb.name}
                    </option>
                  ))}
                  {uri && !hasMatchedUri ? (
                    <option value={uri}>自定义 | {uri}</option>
                  ) : null}
                </ConsoleSelect>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 font-sans text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <Activity size={12} />
                    召回数量 (TOP_K)
                  </label>
                  <ConsoleInput
                    type="number"
                    value={topK}
                    min={1}
                    max={50}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="bg-[var(--bg-elevated)]/50 border-[2px] h-12 px-4"
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 font-sans text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    <ShieldAlert size={12} />
                    最低分数 (MIN_SCORE)
                  </label>
                  <ConsoleInput
                    type="number"
                    value={scoreThreshold}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={(e) => setScoreThreshold(Number(e.target.value))}
                    className="bg-[var(--bg-elevated)]/50 border-[2px] h-12 px-4"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 font-sans text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <Zap size={12} />
                  重排引擎 (RERANK_PROCESS)
                </label>
                <label className="flex h-12 cursor-pointer items-center justify-between border-[2px] border-[var(--border)] bg-[var(--bg-elevated)]/50 px-4 font-sans text-[10px] font-black uppercase tracking-[0.16em]">
                  <span>{useRerank ? "已启用高性能重排" : "仅使用向量初筛"}</span>
                  <input
                    type="checkbox"
                    checked={useRerank}
                    onChange={(e) => setUseRerank(e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
              </div>
            </div>
          </ConsolePanel>

          {messages.length > 0 && (
            <div className="space-y-6 animate-in fade-in duration-500">
               <ConsoleStatsGrid className="grid-cols-2 gap-3">
                <ConsoleMetricCard
                  label="当前会话轮次"
                  value={Math.floor(messages.length / 2).toString()}
                  tone="brand"
                  icon={Activity}
                  className="px-4 py-3"
                />
                <ConsoleMetricCard
                  label="有效知识命中"
                  value={messages.filter((message) => message.sources?.length).length.toString()}
                  tone="success"
                  icon={Target}
                  className="px-4 py-3"
                />
              </ConsoleStatsGrid>
              
              <ConsoleSurfaceCard tone="card" className="p-6 border-dashed border-[2px] bg-[var(--bg-elevated)]/30">
                <div className="flex gap-3">
                  <Settings size={16} className="text-[var(--brand)] shrink-0 mt-0.5" />
                  <p className="font-sans text-[11px] font-bold text-[var(--text-muted)] leading-relaxed">
                    调试建议：若召回结果不理想，请尝试将 TOP_K 调至 10 以上，并确保 URI 作用域已覆盖目标分段。
                  </p>
                </div>
              </ConsoleSurfaceCard>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
