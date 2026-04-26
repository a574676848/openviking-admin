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
    <section className={`border-[3px] border-[var(--border)] bg-[var(--bg-card)] ${className}`}>
      {(title || eyebrow || actions) ? (
        <header className="flex items-start justify-between gap-4 border-b-[3px] border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brand)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h3 className="mt-1 text-lg font-black">{title}</h3> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
