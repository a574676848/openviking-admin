"use client";

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const BASE_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const PLATFORM_TONE_CLASS = {
  default:
    "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--brand)] hover:bg-[var(--brand-muted)] hover:text-[var(--brand)] focus-visible:ring-[var(--brand)] focus-visible:ring-offset-[var(--bg-card)]",
  danger:
    "border-[var(--danger)] bg-transparent text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white focus-visible:ring-[var(--danger)] focus-visible:ring-offset-[var(--bg-card)]",
} as const;

const PLATFORM_BADGE_TONE_CLASS = {
  default: "border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg-card)]",
  muted: "border-[var(--text-muted)] text-[var(--text-muted)] bg-[var(--text-muted)]/10",
  brand: "border-[var(--brand)] text-[var(--brand)] bg-[var(--brand)]/10",
  info: "border-[var(--info)] text-[var(--info)] bg-[var(--info)]/10",
  success: "border-[var(--success)] text-[var(--success)] bg-[var(--success)]/10",
  warning: "border-[var(--warning)] text-[var(--warning)] bg-[var(--warning)]/10",
  danger: "border-[var(--danger)] text-[var(--danger)] bg-[var(--danger)]/10",
  inverse: "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-card)]",
} as const;

export function PlatformPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "bg-[var(--bg-card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-base)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PlatformPageHeader({
  title,
  subtitle,
  actions,
  className,
  titleClassName,
  subtitleClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}) {
  return (
    <div
      className={cx(
        "mb-8 flex flex-col items-start justify-between gap-6 border-b-[var(--border-width)] border-[var(--border)] pb-6 md:flex-row md:items-end",
        className,
      )}
    >
      <div>
        <div className={cx("text-[var(--text-primary)]", titleClassName)}>{title}</div>
        {subtitle ? (
          <div
            className={cx(
              "text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]",
              subtitleClassName,
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-4">{actions}</div> : null}
    </div>
  );
}

export function PlatformField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export function PlatformSectionTitle({
  title,
  subtitle,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-8", className)}>
      <div className="flex items-center gap-3 font-sans text-xl font-bold text-[var(--text-primary)]">
        {icon}
        <span>{title}</span>
      </div>
        {subtitle ? (
          <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
    </div>
  );
}

import { forwardRef } from "react";

export const PlatformButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: keyof typeof PLATFORM_TONE_CLASS;
  }
>(({ className, tone = "default", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center gap-2 border font-sans text-xs font-bold rounded-[var(--radius-pill)] px-4 py-2 transition-all disabled:opacity-50 active:scale-[0.98]",
        BASE_FOCUS_RING,
        PLATFORM_TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  );
});

PlatformButton.displayName = "PlatformButton";

export function PlatformSegmentedControl<T extends string>({
  value,
  items,
  onChange,
  disabled = false,
  className,
  buttonClassName,
}: {
  value: T;
  items: Array<{ value: T; label: ReactNode }>;
  onChange: (next: T) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      className={cx(
        "flex p-1 gap-1 border border-[var(--border)] bg-[var(--bg-base)] rounded-[var(--radius-base)]",
        disabled && "opacity-60",
        className,
      )}
      aria-disabled={disabled}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <PlatformButton
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            className={cx(
              "relative flex-1 rounded-[calc(var(--radius-base)-4px)] px-3 py-1.5 text-xs transition-all",
              active
                ? "bg-[var(--bg-card)] text-[var(--brand)] shadow-sm font-bold"
                : "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium",
              disabled && "cursor-not-allowed opacity-50",
              buttonClassName,
            )}
          >
            {item.label}
          </PlatformButton>
        );
      })}
    </div>
  );
}

export function DangerAction({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <PlatformButton
      tone="danger"
      className={cx("px-2 py-1 text-[9px] tracking-widest", className)}
      {...props}
    >
      {children}
    </PlatformButton>
  );
}

export function PlatformInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "ov-input px-3 py-2 font-sans text-sm rounded-[var(--radius-pill)]",
        BASE_FOCUS_RING,
        "focus-visible:ring-[var(--brand)] focus-visible:ring-offset-[var(--bg-card)]",
        className,
      )}
      {...props}
    />
  );
}

import { ConsoleSelect } from "../console/forms";

export function PlatformSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <ConsoleSelect
      {...props as any}
      className={className}
    />
  );
}

export function PlatformBadge({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 border rounded-[var(--radius-pill)] px-2 py-0.5 font-sans text-[10px] font-bold tracking-tight",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function PlatformStateBadge({
  children,
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof PLATFORM_BADGE_TONE_CLASS;
}) {
  return (
    <PlatformBadge
      className={cx(PLATFORM_BADGE_TONE_CLASS[tone], className)}
      {...props}
    >
      {children}
    </PlatformBadge>
  );
}

export function PlatformMetric({
  label,
  value,
  hint,
  accent,
  className,
  valueClassName,
  labelClassName,
  hintClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
  hintClassName?: string;
}) {
  return (
    <PlatformPanel className={cx("flex min-h-[180px] flex-col justify-between px-6 py-5", className)}>
      <p
        className={cx(
          "text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]",
          labelClassName,
        )}
      >
        {label}
      </p>
      <p
        className={cx(
          "mt-2 font-sans text-4xl font-bold tabular-nums text-[var(--text-primary)]",
          valueClassName,
        )}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cx(
            "text-[10px] font-medium text-[var(--text-muted)]",
            hintClassName,
          )}
        >
          {hint}
        </p>
      ) : null}
    </PlatformPanel>
  );
}

export function PlatformSignalCard({
  label,
  value,
  hint,
  marker,
  accent = "var(--brand)",
  overlay,
  pulse = false,
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  marker?: ReactNode;
  accent?: string;
  overlay?: ReactNode;
  pulse?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <PlatformPanel
      className={cx(
        "group relative flex min-h-[200px] flex-col justify-between overflow-hidden p-6 transition-colors hover:bg-[var(--bg-elevated)] md:p-8",
        className,
      )}
    >
      <div className="relative z-10 mb-4 flex items-center font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {marker}
        {label}
      </div>
      <div className="relative z-10 flex flex-col gap-1">
        <div
          className={cx(
            "font-sans text-4xl font-bold text-[var(--text-primary)]",
            pulse && "animate-theme-pulse",
            valueClassName,
          )}
          style={{ color: accent }}
        >
          {value}
        </div>
        {hint ? (
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            {hint}
          </span>
        ) : null}
      </div>
      {overlay ? <div className="absolute -bottom-4 -right-4 opacity-5 transition-opacity group-hover:opacity-10">{overlay}</div> : null}
    </PlatformPanel>
  );
}

export function PlatformControlCard({
  label,
  description,
  control,
  accent = "brand",
  layout = "stacked",
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  accent?: "brand" | "info" | "warning" | "danger";
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const accentClass = {
    brand: "bg-[var(--brand)]",
    info: "bg-[var(--info)]",
    warning: "bg-[var(--warning)]",
    danger: "bg-[var(--danger)]",
  }[accent];

  return (
    <div
      className={cx(
        "bg-[var(--bg-card)] p-6",
        layout === "inline"
          ? "flex flex-col justify-between gap-6 md:flex-row md:items-center"
          : "flex flex-col justify-between",
        className,
      )}
    >
      <div className={layout === "inline" ? "flex-1" : undefined}>
        <div className="mb-2 flex items-center font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
          <span className={cx("mr-2 h-2 w-2 rounded-full shrink-0", accentClass)} />
          {label}
        </div>
        {description ? (
          <div className="text-[10px] font-medium text-[var(--text-muted)]">
            {description}
          </div>
        ) : null}
      </div>
      <div className={layout === "inline" ? "w-full md:w-2/3" : "mt-4 w-full"}>{control}</div>
    </div>
  );
}

export function PlatformActivityRow({
  time,
  primary,
  secondary,
  status,
  tone = "default",
  className,
}: {
  time: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  status: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
  className?: string;
}) {
  const toneClass = {
    default: "text-[var(--text-primary)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    brand: "text-[var(--brand)]",
  }[tone];

  return (
    <div
      className={cx(
        "flex items-center border-b border-[var(--border)] p-4 font-sans text-xs transition-colors hover:bg-[var(--bg-elevated)] last:border-0",
        className,
      )}
    >
      <span className="mr-6 w-20 opacity-40">{time}</span>
      <span className={cx("mr-6 font-bold", toneClass)}>{primary}</span>
      <span className="flex-1 truncate opacity-60">{secondary}</span>
      <span className="ml-4 text-right font-bold opacity-80">[{status}]</span>
    </div>
  );
}

export function PlatformDataRow({
  rank,
  primary,
  secondary,
  value,
  status,
  className,
}: {
  rank: number;
  primary: ReactNode;
  secondary: ReactNode;
  value: ReactNode;
  status: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("grid grid-cols-[48px_minmax(0,1fr)_120px_110px] gap-px bg-[var(--border)]", className)}>
      <div className="bg-[var(--bg-card)] px-3 py-4 font-sans text-xs font-bold text-[var(--text-muted)]">
        {String(rank).padStart(2, "0")}
      </div>
      <div className="min-w-0 bg-[var(--bg-card)] px-4 py-4">
        <div className="truncate font-sans text-sm font-bold text-[var(--text-primary)]">{primary}</div>
        <div className="mt-1 truncate font-sans text-[11px] font-medium text-[var(--text-muted)]">{secondary}</div>
      </div>
      <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-sans text-sm font-bold text-[var(--brand)]">
        {value}
      </div>
      <div className="bg-[var(--bg-card)] px-4 py-4 text-right font-sans text-xs font-medium text-[var(--text-secondary)]">
        {status}
      </div>
    </div>
  );
}

export function PlatformKeyValueRow({
  label,
  value,
  accent = "var(--brand)",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between border-b border-[var(--border)] border-dashed px-2 py-2 transition-colors hover:bg-[var(--bg-base)] last:border-0",
        className,
      )}
    >
      <span className="font-sans text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <span
        className="max-w-[50%] truncate text-right font-sans text-xs font-bold"
        style={{ color: accent }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function PlatformStatPill({
  label,
  value,
  accent = "var(--border)",
  backgroundClassName = "bg-[var(--bg-elevated)]",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  backgroundClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 border rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-tight",
        backgroundClassName,
        className,
      )}
      style={{ borderColor: accent, color: accent }}
    >
      {label}: {value}
    </span>
  );
}

export function PlatformMiniChart({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PlatformActionMenu({
  items,
  className,
}: {
  items: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    tone?: keyof typeof PLATFORM_TONE_CLASS;
    disabled?: boolean;
  }>;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.right + window.scrollX - 160, // 160 is roughly the min-width
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener("scroll", updateCoords);
      window.addEventListener("resize", updateCoords);
    }
    return () => {
      window.removeEventListener("scroll", updateCoords);
      window.removeEventListener("resize", updateCoords);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        // Since we use portal, we need to handle click outside carefully
        // Or just let the menu close itself on click
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cx("relative inline-block", className)}>
      <PlatformButton
        ref={triggerRef}
        type="button"
        className="h-9 px-3 bg-[var(--bg-card)] border-[var(--border)] shadow-sm hover:border-[var(--brand)] hover:bg-[var(--brand-muted)] group"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="更多操作"
        title="更多操作"
      >
        <MoreHorizontal size={14} className="text-[var(--text-muted)] group-hover:text-[var(--brand)] transition-colors" />
        <span>更多</span>
      </PlatformButton>

      {isOpen && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[100]" 
            onClick={() => setIsOpen(false)} 
          />
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            style={{ 
              position: 'absolute',
              top: coords.top + 8,
              left: coords.left,
              zIndex: 101,
            }}
            className="min-w-[160px] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-2xl rounded-[var(--radius-base)] overflow-hidden"
          >
            <div className="flex flex-col gap-0.5">
              {items.map((item, idx) => (
                <button
                  key={idx}
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick();
                    setIsOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-[calc(var(--radius-base)-4px)] px-3 py-2.5 text-left font-sans text-xs font-bold transition-colors",
                    item.tone === "danger"
                      ? "text-[var(--danger)] hover:bg-[var(--danger)]/10"
                      : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
                    item.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>,
        document.body
      )}
    </div>
  );
}

export function PlatformFooterBar({
  leading,
  trailing,
  className,
}: {
  leading: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between border-t border-[var(--border)] px-6 py-4 font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]",
        className,
      )}
    >
      <span>{leading}</span>
      {trailing ? <span>{trailing}</span> : null}
    </div>
  );
}

export function PlatformUtilityBar({
  leading,
  trailing,
  className,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      {leading ? <div className="min-w-0">{leading}</div> : null}
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function PlatformEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <PlatformPanel className={cx("px-6 py-16 text-center", className)}>
      <p className="font-sans text-2xl font-bold text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </PlatformPanel>
  );
}

export function PlatformStatusPanel({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <PlatformPanel className={cx("px-6 py-16 text-center", className)}>
      <p className="font-sans text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </PlatformPanel>
  );
}
