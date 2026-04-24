"use client";

import type { ElementType, ReactNode } from "react";
import { badgeToneMap, cx, type Tone } from "./shared";

export function ConsoleBadge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex border-[3px] border-[var(--border)] px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] shadow-[3px_3px_0px_#000]",
        badgeToneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ConsoleEmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: ElementType;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cx("bg-[var(--bg-card)] px-6 py-16 text-center", className)}>
      <Icon size={40} strokeWidth={2.2} className="mx-auto text-[var(--text-muted)]" />
      <p className="mt-4 font-sans text-2xl font-black text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {description}
      </p>
    </div>
  );
}
