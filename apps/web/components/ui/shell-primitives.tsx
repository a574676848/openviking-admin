"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ShellTheme = "neo" | "starry";

type ShellTone = "default" | "danger";
type ShellPanelVariant = "surface" | "sidebar" | "popover" | "drawer";

const SHELL_FOCUS_RING = {
  default:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
  danger:
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
} as const;

const SHELL_PANEL_VARIANT_CLASS: Record<ShellPanelVariant, Record<ShellTheme, string>> = {
  surface: {
    neo: "border border-[var(--border)] bg-[var(--bg-card)] rounded-[var(--radius-base)] shadow-sm",
    starry: "border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_0_15px_rgba(0,240,255,0.05)]",
  },
  sidebar: {
    neo: "border-r border-[var(--border)] bg-[var(--bg-card)] shadow-none",
    starry: "border-r border-[var(--border)] bg-[var(--bg-base)] shadow-none",
  },
  popover: {
    neo: "border border-[var(--border)] bg-[var(--bg-card)] rounded-[var(--radius-base)] shadow-md",
    starry: "border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_0_20px_rgba(0,240,255,0.1)]",
  },
  drawer: {
    neo: "border-r border-[var(--border)] bg-[var(--bg-card)] rounded-r-[var(--radius-base)] shadow-[4px_0_24px_rgba(0,0,0,0.08)]",
    starry: "border-r border-[var(--border)] bg-[var(--bg-base)] shadow-[12px_0_24px_rgba(0,240,255,0.05)]",
  },
};

const SHELL_BUTTON_TONE_CLASS: Record<ShellTone, Record<ShellTheme, string>> = {
  default: {
    neo: "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] rounded-[var(--radius-pill)] transition-all hover:bg-[var(--bg-elevated)] hover:shadow-sm",
    starry: "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] rounded-[var(--radius-pill)] transition-all hover:bg-[var(--bg-elevated)] hover:shadow-[0_0_10px_rgba(0,240,255,0.1)]",
  },
  danger: {
    neo: "border border-[var(--danger)]/20 bg-[var(--bg-card)] text-[var(--danger)] rounded-[var(--radius-pill)] transition-all hover:bg-[var(--danger)]/10 hover:shadow-sm",
    starry: "border border-[var(--danger)]/50 bg-[var(--danger)]/10 text-[var(--danger)] rounded-[var(--radius-pill)] transition-all hover:bg-[var(--danger)] hover:text-white hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]",
  },
};

const SHELL_TILE_CLASS: Record<ShellTheme, string> = {
  neo: "border border-[var(--border)] bg-[var(--bg-card)] rounded-[var(--radius-tile)]",
  starry: "border border-[var(--border)] bg-[var(--bg-card)] shadow-[0_0_5px_rgba(0,240,255,0.05)] rounded-[var(--radius-tile)]",
};

export function getShellPanelClass(
  theme: ShellTheme,
  variant: ShellPanelVariant = "surface",
  className?: string,
) {
  return cx(SHELL_PANEL_VARIANT_CLASS[variant][theme], className);
}

export function getShellButtonClass(
  theme: ShellTheme,
  tone: ShellTone = "default",
  className?: string,
) {
  return cx(
    "inline-flex items-center justify-center gap-2 font-sans text-xs font-bold",
    SHELL_FOCUS_RING[tone],
    SHELL_BUTTON_TONE_CLASS[tone][theme],
    className,
  );
}

export function getShellTileClass(theme: ShellTheme, className?: string) {
  return cx(SHELL_TILE_CLASS[theme], className);
}

export function ShellPanel({
  theme,
  variant = "surface",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  theme: ShellTheme;
  variant?: ShellPanelVariant;
}) {
  return (
    <div className={getShellPanelClass(theme, variant, className)} {...props}>
      {children}
    </div>
  );
}

export function ShellButton({
  theme,
  tone = "default",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  theme: ShellTheme;
  tone?: ShellTone;
}) {
  return (
    <button className={getShellButtonClass(theme, tone, className)} {...props}>
      {children}
    </button>
  );
}

export function ShellInsetTile({
  theme,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  theme: ShellTheme;
  children: ReactNode;
}) {
  return (
    <div className={getShellTileClass(theme, className)} {...props}>
      {children}
    </div>
  );
}
