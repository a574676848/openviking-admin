"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ShellTheme = "neo" | "swiss";

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
    neo: "border-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[4px_4px_0px_#000]",
    swiss: "border border-[var(--border)] bg-[var(--bg-card)] shadow-none",
  },
  sidebar: {
    neo: "border-r-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[8px_0px_0px_#000]",
    swiss: "border-r border-[var(--border)] bg-[var(--bg-base)] shadow-none",
  },
  popover: {
    neo: "border-[2px] border-[var(--border)] bg-[var(--bg-card)] shadow-[8px_8px_0px_#000]",
    swiss: "border border-[var(--border)] bg-[var(--bg-card)] shadow-none",
  },
  drawer: {
    neo: "border-r-[3px] border-[var(--border)] bg-[var(--bg-card)] shadow-[12px_0_24px_rgba(0,0,0,0.18)]",
    swiss: "border-r border-[var(--border)] bg-[var(--bg-base)] shadow-[12px_0_24px_rgba(0,0,0,0.18)]",
  },
};

const SHELL_BUTTON_TONE_CLASS: Record<ShellTone, Record<ShellTheme, string>> = {
  default: {
    neo: "border-[3px] border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[2px_2px_0px_#000] transition-all hover:translate-y-0.5 hover:shadow-none",
    swiss: "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]",
  },
  danger: {
    neo: "border-[3px] border-[var(--border)] bg-[var(--danger)] text-white shadow-[2px_2px_0px_#000] transition-all hover:translate-y-0.5 hover:shadow-none",
    swiss: "border border-[var(--danger)] bg-transparent text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white",
  },
};

const SHELL_TILE_CLASS: Record<ShellTheme, string> = {
  neo: "border-[2px] border-[var(--border)] bg-[var(--bg-card)] shadow-[2px_2px_0px_#000]",
  swiss: "border border-[var(--border)] bg-[var(--bg-card)] shadow-none",
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
    "inline-flex items-center justify-center gap-2 font-mono text-[10px] font-black uppercase",
    tone === "danger" ? "tracking-[0.2em]" : "tracking-[0.18em]",
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
