"use client";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type Tone = "brand" | "danger" | "warning" | "success" | "default";

export const toneMap: Record<Tone, string> = {
  brand: "text-[var(--brand)]",
  danger: "text-[var(--danger)]",
  warning: "text-[var(--warning)]",
  success: "text-[var(--success)]",
  default: "text-[var(--text-primary)]",
};

export const badgeToneMap: Record<Tone, string> = {
  brand: "bg-[var(--brand)] text-white",
  danger: "bg-[var(--danger)] text-white",
  warning: "bg-[var(--warning)] text-black",
  success: "bg-[var(--success)] text-white",
  default: "bg-black text-white",
};
