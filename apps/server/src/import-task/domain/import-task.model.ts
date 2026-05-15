import type { AuditActorSnapshot } from '../../common/audit-actor.types';

export type ImportTaskStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ImportTaskSourceType =
  | 'url'
  | 'git'
  | 'local'
  | 'webdav'
  | 'manifest'
  | 'feishu'
  | 'dingtalk';

export interface ImportTaskModel {
  id: string;
  tenantId: string;
  integrationId: string;
  kbId: string;
  sourceType: ImportTaskSourceType;
  sourceUrl: string;
  sourceName: string | null;
  targetUri: string;
  status: ImportTaskStatus;
  nodeCount: number;
  vectorCount: number;
  errorMsg: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  createdBy?: AuditActorSnapshot | null;
  updatedBy?: AuditActorSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}
