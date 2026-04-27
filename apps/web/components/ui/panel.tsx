import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, eyebrow, actions, children, className = "" }: PanelProps) {
  return (
    <section className={`border border-[var(--border)] bg-[var(--bg-card)] rounded-[var(--radius-base)] shadow-sm overflow-hidden ${className}`}>
      {(title || eyebrow || actions) ? (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 bg-[var(--bg-elevated)]/30">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h3 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-primary)]">{title}</h3> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
