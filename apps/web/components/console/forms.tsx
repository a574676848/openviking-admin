"use client";

import type { ComponentProps, ReactNode } from "react";
import { cx } from "./shared";

export function ConsoleButton({
  className,
  tone = "brand",
  children,
  ...props
}: ComponentProps<"button"> & {
  tone?: "brand" | "dark" | "danger" | "warning" | "neutral";
}) {
  const toneClass = {
    brand: "",
    dark: "bg-black text-white hover:bg-black",
    danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger)]",
    warning: "bg-[var(--warning)] text-black hover:bg-[var(--warning)]",
    neutral: "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]",
  }[tone];

  return (
    <button
      {...props}
      className={cx(
        "ov-button inline-flex items-center gap-3 px-5 py-3 font-mono text-[10px] font-black uppercase tracking-[0.18em]",
        toneClass,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ConsoleInput(props: ComponentProps<"input">) {
  const { className, ...rest } = props;
  return <input {...rest} className={cx("ov-input w-full px-4 py-3 font-mono text-sm font-black", className)} />;
}

export function ConsoleSelect(props: ComponentProps<"select">) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={cx("ov-input w-full px-4 py-3 font-mono text-sm font-black", className)}>
      {children}
    </select>
  );
}

export function ConsoleField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function ConsoleIconButton({
  className,
  children,
  tone = "neutral",
  title,
  ...props
}: ComponentProps<"button"> & {
  "aria-label": string;
  tone?: "neutral" | "danger" | "warning" | "dark";
}) {
  const toneClass = {
    neutral: "bg-[var(--bg-card)] text-[var(--text-primary)]",
    danger: "bg-[var(--danger)] text-white",
    warning: "bg-[var(--warning)] text-black",
    dark: "bg-black text-white",
  }[tone];

  return (
    <button
      {...props}
      title={title ?? props["aria-label"]}
      className={cx(
        "flex h-11 w-11 items-center justify-center border-[3px] border-[var(--border)] shadow-[3px_3px_0px_#000] transition-all hover:translate-y-0.5 hover:shadow-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        toneClass,
        className,
      )}
    >
      {children}
    </button>
  );
}
