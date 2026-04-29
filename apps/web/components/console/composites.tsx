"use client";

import type { ElementType, ReactNode } from "react";
import { ConsolePanel, ConsolePanelHeader } from "./layout";
import { ConsoleBadge, ConsoleEmptyState } from "./feedback";
import { ConsoleButton } from "./forms";
import { cx, toneMap, type Tone } from "./shared";

/* ------------------------------------------------------------------ */
/*  ConsoleStatsGrid                                                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  ConsoleControlPanel                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  ConsoleTableShell                                                  */
/* ------------------------------------------------------------------ */

export type ConsoleTableState = "loading" | "error" | "empty" | "ready";

export function resolveConsoleTableState({
  loading,
  hasError = false,
  hasData = false,
}: {
  loading: boolean;
  hasError?: boolean;
  hasData?: boolean;
}): ConsoleTableState {
  if (loading) return "loading";
  if (hasError) return "error";
  if (!hasData) return "empty";
  return "ready";
}

export function ConsoleTableShell({
  columns,
  children,
  state = "ready",
  stateContent,
  className,
  headerClassName,
  rowsClassName,
}: {
  columns: ReactNode;
  children?: ReactNode;
  state?: ConsoleTableState;
  stateContent?: {
    loading?: ReactNode;
    error?: ReactNode;
    empty?: ReactNode;
  };
  className?: string;
  headerClassName?: string;
  rowsClassName?: string;
}) {
  const body =
    state === "loading"
      ? stateContent?.loading
      : state === "error"
        ? stateContent?.error
        : state === "empty"
          ? stateContent?.empty
          : children;

  return (
    <ConsolePanel className={cx("flex flex-col overflow-hidden", className)}>
      <div className={cx("shrink-0 border-b-[3px] border-[var(--border)] bg-[var(--bg-elevated)]", headerClassName)}>{columns}</div>
      <div className={cx("grid min-h-0 flex-1 grid-cols-1 gap-px bg-[var(--border)]", rowsClassName)}>
        {body}
      </div>
    </ConsolePanel>
  );
}

/* ------------------------------------------------------------------ */
/*  ConsoleListRow – 通用列表行                                        */
/* ------------------------------------------------------------------ */

export interface ConsoleListRowBadge {
  label: string;
  tone?: Tone;
  className?: string;
}

export interface ConsoleListRowMetric {
  value: ReactNode;
  className?: string;
  /** 自定义渲染函数，替代默认的大号数字样式 */
  render?: (value: ReactNode) => ReactNode;
}

export function ConsoleListRow({
  icon: Icon,
  iconClassName,
  name,
  nameTestId,
  description,
  detailId,
  date,
  badges,
  metrics,
  actions,
  columns,
  className,
}: {
  icon?: ElementType;
  iconClassName?: string;
  name: string;
  nameTestId?: string;
  description?: string;
  detailId?: string;
  date?: string;
  badges?: ConsoleListRowBadge[];
  metrics?: ConsoleListRowMetric[];
  actions?: ReactNode;
  columns?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "grid gap-px bg-[var(--border)]",
        columns,
        className,
      )}
    >
      {/* 主信息列 */}
      <div className="bg-[var(--bg-card)] px-5 py-5">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className={cx(
              "flex h-10 w-10 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--bg-elevated)]",
              iconClassName,
            )}>
              <Icon size={16} strokeWidth={2.6} />
            </div>
          ) : null}
          <div className="min-w-0">
            <p
              className="truncate font-sans text-xl font-black text-[var(--text-primary)]"
              title={name}
              data-testid={nameTestId}
            >
              {name}
            </p>
            {description ? (
              <p className="mt-2 font-sans text-xs font-medium text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
            {detailId ? (
              <p className="mt-2 font-sans text-xs font-medium text-[var(--text-muted)]">
                {detailId}
              </p>
            ) : null}
            {date ? (
              <p className="mt-2 font-sans text-xs font-medium text-[var(--text-secondary)]">
                {date}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Badge 列 */}
      {badges?.map((badge, i) => (
        <div key={i} className="bg-[var(--bg-card)] px-5 py-5">
          <ConsoleBadge tone={badge.tone} className={badge.className}>
            {badge.label}
          </ConsoleBadge>
        </div>
      ))}

      {/* 指标列 */}
      {metrics?.map((metric, i) => (
        <div
          key={i}
          className={cx(
            "bg-[var(--bg-card)] px-5 py-5",
            metric.render
              ? ""
              : "font-sans text-3xl font-bold tabular-nums text-[var(--text-primary)]",
            metric.className,
          )}
        >
          {metric.render ? metric.render(metric.value) : metric.value}
        </div>
      ))}

      {/* 操作列 */}
      {actions ? (
        <div className="bg-[var(--bg-card)] px-5 py-5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ConsoleInspectorStack – 节点/详情检查器                            */
/* ------------------------------------------------------------------ */

export interface InspectorField {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: Tone;
}

export function ConsoleInspectorStack({
  eyebrow,
  title,
  fields,
  action,
  emptyState,
  className,
}: {
  eyebrow?: string;
  title?: string;
  fields?: InspectorField[];
  action?: { label: string; onClick: () => void };
  emptyState?: { icon: ElementType; title: string; description: string };
  className?: string;
}) {
  return (
    <ConsolePanel className={cx("p-6", className)}>
      <ConsolePanelHeader eyebrow={eyebrow} title={title} />

      {fields && fields.length > 0 ? (
        <div className="mt-6 space-y-4">
          {fields.map((field, i) => (
            <div
              key={i}
              className="border-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-5"
            >
              <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {field.label}
              </p>
              <p
                className={cx(
                  "mt-3 break-all",
                  field.mono
                    ? "font-sans text-xs font-bold"
                    : "font-sans text-3xl font-black",
                  field.tone ? toneMap[field.tone] : "text-[var(--text-primary)]",
                )}
              >
                {field.value}
              </p>
            </div>
          ))}

          {action ? (
            <ConsoleButton
              type="button"
              onClick={action.onClick}
              className="w-full justify-center py-4"
            >
              {action.label}
            </ConsoleButton>
          ) : null}
        </div>
      ) : emptyState ? (
        <ConsoleEmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          className="mt-6 py-10"
        />
      ) : null}
    </ConsolePanel>
  );
}

/* ------------------------------------------------------------------ */
/*  ConsoleTelemetryPanel – 规则/遥测信息面板                          */
/* ------------------------------------------------------------------ */

export interface TelemetryRule {
  text: string;
}

export function ConsoleTelemetryPanel({
  eyebrow,
  title,
  rules,
  className,
}: {
  eyebrow?: string;
  title?: string;
  rules: TelemetryRule[];
  className?: string;
}) {
  return (
    <ConsolePanel className={cx("p-6", className)}>
      <ConsolePanelHeader eyebrow={eyebrow} title={title} />
      <div className="mt-6 space-y-4 font-sans text-xs font-medium text-[var(--text-secondary)]">
        {rules.map((rule, i) => (
          <p key={i}>{rule.text}</p>
        ))}
      </div>
    </ConsolePanel>
  );
}
