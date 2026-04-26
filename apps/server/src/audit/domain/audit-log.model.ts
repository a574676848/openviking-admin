export interface AuditLogModel {
  id: string;
  tenantId: string | null;
  userId: string | null;
  username: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  success: boolean;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  tenantId?: string;
  userId?: string;
  username?: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  success?: boolean;
}
