import type { AuditActorSnapshot } from '../../common/audit-actor.types';

export type KnowledgeBaseStatus = 'active' | 'building' | 'archived';

export interface KnowledgeBaseModel {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  status: KnowledgeBaseStatus;
  vikingUri: string;
  docCount: number;
  vectorCount: number;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  createdBy?: AuditActorSnapshot | null;
  updatedBy?: AuditActorSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}
