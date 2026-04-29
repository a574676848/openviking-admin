"use client";

import type { ReactNode } from "react";
import { ConsoleBadge } from "./feedback";
import { cx } from "./shared";

export function ConsoleChatBubble({
  role,
  content,
  label,
}: {
  role: "user" | "assistant";
  content: ReactNode;
  label?: string;
}) {
  return (
    <div className={cx("flex flex-col group", role === "user" ? "items-end" : "items-start")}>
      <span className={cx(
        "mb-2 px-2 py-0.5 font-sans text-[9px] font-black uppercase tracking-[0.18em]",
        role === "user" ? "text-[var(--text-primary)]" : "text-[var(--brand)]"
      )}>
        {label ?? (role === "user" ? "USER_INPUT" : "SYS_RESPONSE")}
      </span>
      <div
        className={cx(
          "max-w-[90%] rounded-2xl border border-[var(--border)] p-6 font-sans text-sm font-medium leading-relaxed transition-all",
          role === "user" 
            ? "bg-transparent text-[var(--text-primary)] shadow-none" 
            : "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-lg theme-starry:backdrop-blur-md theme-starry:bg-[var(--bg-card)]/80",
        )}
      >
        {content}
      </div>
    </div>
  );
}

export interface ConsoleSourceCardData {
  title?: string;
  uri: string;
  score: number;
  content?: string;
  reranked?: boolean;
  stage1Score?: number;
}

export function ConsoleSourceCard({
  index,
  source,
}: {
  index: number;
  source: ConsoleSourceCardData;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition-all hover:border-[var(--brand)]/50 hover:shadow-xl theme-starry:backdrop-blur-md">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--brand)]/10 font-sans text-[10px] font-black text-[var(--brand)]">
              {index + 1}
            </span>
            <p className="font-sans text-sm font-black text-[var(--text-primary)]">
              {source.title || "参考切片 (REF_CHUNK)"}
            </p>
          </div>
          {source.reranked ? (
            <ConsoleBadge tone="brand" className="mt-2 h-4 px-1.5 text-[8px] tracking-[0.12em] rounded-sm">
              RERANK_BOOSTED
            </ConsoleBadge>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-sans text-lg font-black text-[var(--brand)]">
            {(source.score * 100).toFixed(1)}%
          </p>
          {source.reranked ? (
            <p className="mt-0.5 font-sans text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              ORIGIN {((source.stage1Score ?? 0) * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>
      </div>
      {source.content ? (
        <div className="relative rounded-xl border border-dashed border-[var(--brand)]/20 bg-[var(--brand-muted)]/5 p-4 font-sans text-xs leading-relaxed text-[var(--text-secondary)]">
          <div className="absolute -left-px top-2 h-4 w-1 bg-[var(--brand)]/30 rounded-r" />
          {source.content}
        </div>
      ) : null}
      <p className="mt-4 truncate font-sans text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] group-hover:text-[var(--brand)] transition-colors">
        URI: {source.uri}
      </p>
    </div>
  );
}
