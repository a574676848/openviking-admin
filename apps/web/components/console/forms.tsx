"use client";

import { useState, useRef, useEffect, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
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
    brand: "bg-[var(--brand)] text-[var(--brand-text)] hover:bg-[var(--brand-hover)] border-[var(--brand)]",
    dark: "bg-black text-white hover:bg-black",
    danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger)]",
    warning: "bg-[var(--warning)] text-black hover:bg-[var(--warning)]",
    neutral: "bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]",
  }[tone];

  return (
    <button
      {...props}
      className={cx(
        "ov-button inline-flex items-center gap-3 px-5 py-3 font-sans text-xs font-bold rounded-[var(--radius-base)] transition-all active:scale-[0.98]",
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
  return <input {...rest} className={cx("ov-input w-full px-4 py-3 font-sans text-sm rounded-[var(--radius-base)]", className)} />;
}

interface ConsoleSelectOption {
  label: string;
  value: string;
}

export function ConsoleSelect({
  value,
  onChange,
  children,
  className,
  placeholder = "请选择...",
  disabled,
}: {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  // 解析 children 获取选项数据
  const options: ConsoleSelectOption[] = [];
  const childrenArray = Array.isArray(children) ? children : [children];
  childrenArray.forEach((child: any) => {
    if (child?.type === "option") {
      options.push({ label: child.props.children, value: child.props.value });
    } else if (Array.isArray(child)) {
      child.forEach((subChild: any) => {
        if (subChild?.type === "option") {
          options.push({ label: subChild.props.children, value: subChild.props.value });
        }
      });
    }
  });

  const selectedOption = options.find((opt) => opt.value === value);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
      const handleClickOutside = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        window.removeEventListener("scroll", updateCoords, true);
        window.removeEventListener("resize", updateCoords);
        document.addEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange?.({ target: { value: val } });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cx("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cx(
          "ov-input flex w-full items-center justify-between pl-5 pr-4 py-3.5 font-sans text-sm font-bold transition-all duration-300",
          "bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-primary)]",
          !disabled && "hover:border-[var(--brand)] hover:bg-[var(--bg-card)]",
          isOpen && !disabled && "ring-4 ring-[var(--brand-muted)] border-[var(--brand)] shadow-lg",
          disabled && "cursor-not-allowed opacity-50 bg-[var(--bg-elevated)]"
        )}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown
          size={18}
          className={cx("text-[var(--text-muted)] transition-transform duration-300", isOpen && "rotate-180 text-[var(--brand)]")}
        />
      </button>

      {isOpen && !disabled && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 9999,
          }}
          className={cx(
            "animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl",
            "bg-[var(--bg-card)] border-[var(--border)]"
          )}
        >
          <div className="max-h-[300px] overflow-y-auto p-1.5 scrollbar-thin">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={cx(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-bold transition-all duration-200",
                  opt.value === value 
                    ? "bg-[var(--brand)] text-[var(--brand-text)] shadow-md" 
                    : "text-[var(--text-primary)] hover:bg-[var(--brand-muted)] hover:text-[var(--brand)]"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check size={16} strokeWidth={3} />}
              </button>
            ))}
          </div>
          <div className="h-1 w-full bg-gradient-to-r from-transparent via-[var(--brand)] to-transparent opacity-30" />
        </div>,
        document.body
      )}
    </div>
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
      <label className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
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
