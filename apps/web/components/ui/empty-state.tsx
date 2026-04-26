import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 border-[3px] border-dashed border-[var(--border)] bg-[var(--bg-base)] px-5 py-6">
      <div className="flex h-11 w-11 items-center justify-center border-[3px] border-[var(--border)] bg-[var(--brand-muted)]">
        <Icon size={18} strokeWidth={2.4} />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-black">{title}</h3>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
