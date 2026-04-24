"use client";

import type { ReactNode, ElementType } from "react";
import { cx, toneMap, type Tone } from "./shared";

export function ConsolePageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle: string;
  icon?: ElementType;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-b-[3px] border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="flex items-center gap-4 font-sans text-5xl font-black tracking-tight text-[var(--text-primary)]">
          {Icon ? <Icon size={34} strokeWidth={2.6} /> : null}
          {title}
        </h1>
        <p className="mt-3 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          {subtitle}
        </p>
      </div>
      {actions ? <div className="flex flex-col gap-3 sm:flex-row">{actions}</div> : null}
    </section>
  );
}

export function ConsoleMetricCard({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cx("bg-[var(--bg-card)] px-6 py-6", className)}>
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <div className={cx("mt-5 font-mono text-5xl font-black tracking-tighter tabular-nums", toneMap[tone])}>{value}</div>
    </div>
  );
}

export function ConsolePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx("ov-card", className)}>{children}</section>;
}

export function ConsolePanelHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow?: string;
  title?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("border-b-[3px] border-[var(--border)] pb-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {eyebrow}
            </p>
          ) : null}
          {title ? <h2 className="mt-3 font-sans text-2xl font-black">{title}</h2> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}
