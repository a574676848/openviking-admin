"use client";

import type { ReactNode } from "react";
import { ConsoleBadge } from "./feedback";
import { cx } from "./shared";

export function ConsoleChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col", role === "user" ? "items-end" : "items-start")}>
      <span className="mb-2 bg-black px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white">
        {role === "user" ? "USER_INPUT" : "SYS_RESPONSE"}
      </span>
      <div
        className={cx(
          "max-w-[90%] border-[3px] border-[var(--border)] p-6 font-mono text-sm font-bold leading-relaxed shadow-[6px_6px_0px_#000]",
          role === "user" ? "bg-[var(--warning)] text-black" : "bg-[var(--bg-card)] text-black",
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
    <div className="border-[3px] border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[4px_4px_0px_#000]">
      <div className="mb-3 flex items-start justify-between gap-3 border-b-[2px] border-[var(--border)] pb-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.12em] text-black">
            #{index + 1} | {source.title || "REF_CHUNK"}
          </p>
          {source.reranked ? (
            <ConsoleBadge className="mt-2 border-[2px] bg-black px-2 py-0.5 text-[8px] tracking-[0.16em] text-white shadow-none">
              RERANK_BOOSTED
            </ConsoleBadge>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-black text-[var(--brand)]">{(source.score * 100).toFixed(1)}%</p>
          {source.reranked ? (
            <p className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
              ORIGIN {((source.stage1Score ?? 0) * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>
      </div>
      {source.content ? (
        <div className="border-[2px] border-[var(--border)] border-dashed bg-[#FFF200]/20 p-4 font-mono text-xs leading-relaxed text-black/80">
          {source.content}
        </div>
      ) : null}
      <p className="mt-3 truncate font-mono text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
        URI: {source.uri}
      </p>
    </div>
  );
}
