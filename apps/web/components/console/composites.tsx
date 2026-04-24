"use client";

import type { ReactNode } from "react";
import { ConsolePanel, ConsolePanelHeader } from "./layout";
import { cx } from "./shared";

export function ConsoleStatsGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "grid grid-cols-1 gap-[var(--border-width)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function ConsoleControlPanel({
  eyebrow,
  title,
  children,
  footer,
  className,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <ConsolePanel className={cx("p-6", className)}>
      {eyebrow || title ? <ConsolePanelHeader eyebrow={eyebrow} title={title} /> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6">{footer}</div> : null}
    </ConsolePanel>
  );
}

export function ConsoleTableShell({
  columns,
  children,
  isLoading,
  hasData,
  loadingState,
  emptyState,
  className,
  headerClassName,
  rowsClassName,
}: {
  columns: ReactNode;
  children?: ReactNode;
  isLoading?: boolean;
  hasData?: boolean;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
  headerClassName?: string;
  rowsClassName?: string;
}) {
  return (
    <ConsolePanel className={cx("overflow-hidden", className)}>
      <div className={cx("border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)]", headerClassName)}>{columns}</div>
      <div className={cx("grid grid-cols-1 gap-px bg-[var(--border)]", rowsClassName)}>
        {isLoading ? loadingState : hasData ? children : emptyState}
      </div>
    </ConsolePanel>
  );
}
