import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  Globe,
  Loader2,
  ServerCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ImportTask {
  id: string;
  kbId: string;
  sourceType: string;
  sourceUrl: string;
  targetUri: string;
  status: string;
  nodeCount: number;
  vectorCount: number;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENT_SUCCESS_STATUS = "done";
export const DOCUMENT_CANCELLABLE_STATUS = "pending";
export const DOCUMENT_RETRYABLE_STATUSES = ["failed", "cancelled"] as const;

export function canSyncDocumentTask(_task: Pick<ImportTask, "status">) {
  return true;
}

export function canRetryDocumentTask(task: Pick<ImportTask, "status">) {
  return DOCUMENT_RETRYABLE_STATUSES.includes(
    task.status as (typeof DOCUMENT_RETRYABLE_STATUSES)[number],
  );
}

export function canCancelDocumentTask(task: Pick<ImportTask, "status">) {
  return task.status === DOCUMENT_CANCELLABLE_STATUS;
}

export const DOCUMENT_STATUS_MAP: Record<
  string,
  {
    label: string;
    icon: LucideIcon;
    className: string;
  }
> = {
  pending: { label: "等待处理", icon: Clock, className: "bg-[var(--bg-card)] text-[var(--text-primary)]" },
  running: { label: "处理中", icon: Loader2, className: "bg-[var(--warning)] text-black" },
  done: { label: "成功", icon: CheckCircle2, className: "bg-[var(--success)] text-white" },
  failed: { label: "失败", icon: AlertTriangle, className: "bg-[var(--danger)] text-white" },
  cancelled: { label: "已取消", icon: Ban, className: "bg-black text-white" },
};

export const DOCUMENT_SOURCE_ICONS: Record<string, LucideIcon> = {
  git: GitBranch,
  webdav: ServerCog,
  url: Globe,
  local: FileText,
};
