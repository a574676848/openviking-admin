import type { AuditActorSnapshot } from '../../common/audit-actor.types';

export interface KnowledgeNodeAcl {
  roles?: string[];
  users?: string[];
  isPublic?: boolean;
}

export type KnowledgeNodeKind = 'collection' | 'document';
export type KnowledgeNodeIndexStatus = 'clean' | 'dirty' | 'pending' | 'indexing' | 'failed';

export interface KnowledgeNodeModel {
  id: string;
  tenantId: string | null;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string | null;
  sortOrder: number;
  acl: KnowledgeNodeAcl | null;
  kind: KnowledgeNodeKind;
  vikingUri: string | null;
  contentUri: string | null;
  indexStatus: KnowledgeNodeIndexStatus;
  draftVersion: number;
  indexedVersion: number;
  vectorCount: number | null;
  lastIndexedAt: Date | null;
  indexError: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  updatedById?: string | null;
  updatedByName?: string | null;
  createdBy?: AuditActorSnapshot | null;
  updatedBy?: AuditActorSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}
