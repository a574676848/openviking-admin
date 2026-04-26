"use client";

import type { ComponentProps, ElementType, ReactNode } from "react";
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

export function ConsoleSurfaceCard({
  children,
  tone = "card",
  className,
}: {
  children: ReactNode;
  tone?: "card" | "elevated" | "warning" | "danger" | "inverse" | "success";
  className?: string;
}) {
  const toneClass = {
    card: "bg-[var(--bg-card)] text-[var(--text-primary)]",
    elevated: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
    warning: "bg-[var(--warning)] text-black",
    danger: "bg-[var(--danger)] text-white",
    inverse: "bg-black text-white",
    success: "bg-[var(--success)] text-white",
  }[tone];

  return (
    <div className={cx("border-[3px] border-[var(--border)] p-5", toneClass, className)}>
      {children}
    </div>
  );
}

export function ConsoleIconTile({
  children,
  tone = "elevated",
  className,
}: {
  children: ReactNode;
  tone?: "card" | "elevated" | "warning" | "danger" | "inverse" | "success";
  className?: string;
}) {
  const toneClass = {
    card: "bg-[var(--bg-card)] text-[var(--text-primary)]",
    elevated: "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
    warning: "bg-[var(--warning)] text-black",
    danger: "bg-[var(--danger)] text-white",
    inverse: "bg-black text-white",
    success: "bg-[var(--success)] text-white",
  }[tone];

  return (
    <div
      className={cx(
        "flex h-10 w-10 items-center justify-center border-[3px] border-[var(--border)]",
        toneClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ConsoleSelectionCard({
  active = false,
  children,
  className,
  ...props
}: ComponentProps<"button"> & {
  active?: boolean;
}) {
  return (
    <button
      {...props}
      className={cx(
        "border-[3px] border-[var(--border)] px-4 py-4 text-left transition-all",
        active
          ? "bg-black text-white shadow-[4px_4px_0px_var(--brand)]"
          : "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[3px_3px_0px_#000]",
        className,
      )}
    >
      {children}
    </button>
  );
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
