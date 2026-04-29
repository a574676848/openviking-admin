"use client";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type Tone = "brand" | "danger" | "warning" | "success" | "default" | "dark";

export const toneMap: Record<Tone, string> = {
  brand: "text-[var(--brand)]",
  danger: "text-[var(--danger)]",
  warning: "text-[var(--warning)]",
  success: "text-[var(--success)]",
  dark: "text-[var(--text-primary)]",
  default: "text-[var(--text-primary)]",
};

export const badgeToneMap: Record<Tone, string> = {
  brand: "border-[var(--brand)]/30 text-[var(--brand)] bg-[var(--brand)]/[0.08]",
  danger: "border-[var(--danger)]/30 text-[var(--danger)] bg-[var(--danger)]/[0.08]",
  warning: "border-[var(--warning)]/30 text-[var(--warning)] bg-[var(--warning)]/[0.08]",
  success: "border-[var(--success)]/30 text-[var(--success)] bg-[var(--success)]/[0.08]",
  dark: "border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg-elevated)]",
  default: "border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg-elevated)]/50",
};
