"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, Terminal } from "lucide-react";
import { VikingWatcher } from "@/components/watcher";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import {
  ConsoleBadge,
  ConsoleChatBubble,
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleInput,
  ConsolePanel,
  ConsoleStatusPanel,
  ConsoleSurfaceCard,
  ConsoleSourceCard,
} from "@/components/console/primitives";

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
}

export default function QaPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uri, setUri] = useState("");
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function requestAnswer(userMsg: string) {
    setLoading(true);
    setLoadError("");
    setLastQuestion(userMsg);

    try {
      const data = await apiClient.post<SearchResponse>("/search/find", { query: userMsg, uri: uri || undefined, topK });
      const sources = data.resources ?? [];
      const answer =
        sources.length === 0
          ? "当前未在知识库中找到相关内容，请尝试缩小范围或补充知识资源。"
          : `已召回 ${sources.length} 条知识切片，正在整理回答。`;

      setMessages((prev) => [...prev, { role: "assistant", content: answer, sources, logId: data.logId }]);
    } catch {
      setLoadError("检索请求失败，请确认核心引擎在线后重试。");
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
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-6">
      <div className="flex items-end justify-between gap-4 border-b-[3px] border-[var(--border)] pb-4">
        <div className="flex items-center gap-5">
          <VikingWatcher isThinking={loading} size="sm" />
          <div>
            <h1 className="font-sans text-5xl font-black tracking-tight text-[var(--text-primary)]">交互问答终端</h1>
            <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              面向调试与验证的知识问答工作台
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <ConsoleButton type="button" tone="danger" onClick={() => setMessages([])} className="px-6 py-2">
            清空会话
          </ConsoleButton>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-8 lg:flex-row">
        <ConsolePanel className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <ConsoleEmptyState icon={Terminal} title="等待输入问题" description="可直接提问，或先使用下方推荐问题快速开始。" className="py-10" />
                <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
                  {["如何导入知识库？", "向量数如何统计？", "支持哪些文件格式？", "OpenViking 是什么？"].map((prompt) => (
                    <ConsoleButton
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      tone="neutral"
                      className="justify-start px-6 py-4 text-left text-[11px] tracking-[0.16em]"
                    >
                      {"> "}{prompt}
                    </ConsoleButton>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`}>
                    <ConsoleChatBubble role={message.role} content={message.content} />
                    {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                      <div className="mt-5 grid w-full grid-cols-1 gap-4">
                        {message.sources.map((source, sourceIndex) => (
                          <ConsoleSourceCard key={`${source.uri}-${sourceIndex}`} index={sourceIndex} source={source} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loadError ? (
                  <ConsoleStatusPanel
                    icon={Terminal}
                    title="本轮检索失败"
                    description={loadError}
                    action={
                      <ConsoleButton
                        type="button"
                        onClick={() => void requestAnswer(lastQuestion)}
                        disabled={loading || !lastQuestion}
                      >
                        {loading ? "重试中..." : "重新加载"}
                      </ConsoleButton>
                    }
                  />
                ) : null}
                {loading && (
                  <div className="flex items-start">
                    <ConsoleSurfaceCard tone="card" className="flex gap-3 p-6 shadow-[6px_6px_0px_#000]">
                      <div className="h-3 w-3 animate-bounce bg-black" />
                      <div className="h-3 w-3 animate-bounce bg-black" style={{ animationDelay: "0.2s" }} />
                      <div className="h-3 w-3 animate-bounce bg-black" style={{ animationDelay: "0.4s" }} />
                    </ConsoleSurfaceCard>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-6">
            <form onSubmit={handleSend} className="flex gap-4">
              <ConsoleInput
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="请输入问题，例如：如何导入知识库？"
                className="flex-1 px-6 py-4 tracking-[0.14em] shadow-[4px_4px_0px_#000] focus:translate-y-1 focus:shadow-none"
              />
              <ConsoleButton
                type="submit"
                tone="dark"
                disabled={loading || !input.trim()}
                className="px-10 py-4 tracking-[0.2em]"
              >
                发送问题
              </ConsoleButton>
            </form>
          </div>
        </ConsolePanel>

        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          <ConsolePanel className="p-6">
            <h3 className="mb-6 flex items-center border-b-[2px] border-[var(--border)] pb-2 font-mono text-xs font-black uppercase tracking-[0.18em]">
              <Settings size={16} className="mr-2" /> 实时调试参数
            </h3>
            <div className="space-y-6">
              <ConsoleField label="检索作用域 (URI)">
                <ConsoleInput
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="viking://..."
                  className="border-[2px] bg-[var(--bg-elevated)] text-xs"
                />
              </ConsoleField>
              <ConsoleField label="召回数量 (TOP_K)">
                <ConsoleInput
                  type="number"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="border-[2px] bg-[var(--bg-elevated)] text-xs"
                />
              </ConsoleField>
            </div>
          </ConsolePanel>

          {messages.length > 0 && (
            <ConsoleSurfaceCard tone="warning" className="p-6">
              <div className="mb-4 border-b-[2px] border-[var(--border)] pb-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-black">
                会话实时度量
              </div>
              <div className="space-y-3 font-mono text-xs font-black">
                <div className="flex items-center justify-between">
                  <span>总轮次</span>
                  <ConsoleBadge tone="default">{Math.floor(messages.length / 2)}</ConsoleBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span>命中轮次</span>
                  <span>{messages.filter((message) => message.sources?.length).length}</span>
                </div>
              </div>
            </ConsoleSurfaceCard>
          )}
        </aside>
      </div>
    </div>
  );
}
