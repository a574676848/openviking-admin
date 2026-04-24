"use client";

import { useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Terminal, Clock, Zap, FileText, Settings2, ShieldAlert } from "lucide-react";
import {
  ConsoleButton,
  ConsoleEmptyState,
  ConsoleField,
  ConsoleInput,
  ConsolePageHeader,
  ConsolePanel,
} from "@/components/console/primitives";

interface SearchResult {
  uri: string;
  score: number;
  title?: string;
  content?: string;
}

interface SearchResponse {
  resources?: SearchResult[];
  latencyMs?: number | null;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [uri, setUri] = useState("");
  const [topK, setTopK] = useState(10);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(false);
    try {
      const data = await apiClient.post<SearchResponse>("/search/find", { query, uri: uri || undefined, topK });
      setResults(data.resources ?? []);
      setLatency(data.latencyMs ?? null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-8">
      <ConsolePageHeader title="检索调试控制台" subtitle="Semantic Search / Vector Debugging Console" />

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
                placeholder="INPUT_QUERY e.g. 如何配置 WebDAV？"
                className="py-4 pl-12 pr-4 tracking-widest"
              />
            </div>
            <ConsoleButton type="submit" disabled={loading} className="px-10 py-4 tracking-[0.2em]">
              {loading ? ">> SEARCHING..." : ">> EXECUTE"}
            </ConsoleButton>
          </div>

          <div className="grid grid-cols-1 gap-4 border-[3px] border-[var(--border)] border-dashed bg-[var(--bg-elevated)] p-4 lg:grid-cols-[1fr_160px]">
            <ConsoleField label="">
              <label className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <Settings2 size={12} className="mr-2" /> Scope URI
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
                <Zap size={12} className="mr-2" /> Top K
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
          </div>
        </form>
      </ConsolePanel>

      {searched && (
        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b-[3px] border-[var(--border)] pb-3">
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-primary)]">
              {"// Recall Results: "}<span className="text-[var(--brand)]">[{results.length}]</span>
            </span>
            {latency !== null && (
              <span className="flex items-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <Clock size={12} className="mr-2 text-[var(--warning)]" /> {latency}ms
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <ConsolePanel>
              <ConsoleEmptyState icon={ShieldAlert} title="ERR_NULL_HITS_FOUND" description="no results returned" className="py-20" />
            </ConsolePanel>
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
                            {result.title ?? result.uri.split("/").pop() ?? "UNTITLED_NODE"}
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
                    {result.content && (
                      <div className="border-[2px] border-[var(--border)] border-l-[6px] border-l-[var(--brand)] bg-[var(--bg-elevated)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                        {result.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
