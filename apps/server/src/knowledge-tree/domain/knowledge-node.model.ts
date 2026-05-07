export interface KnowledgeNodeAcl {
  roles?: string[];
  users?: string[];
  isPublic?: boolean;
}

export type KnowledgeNodeKind = 'collection' | 'document';

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
  createdAt: Date;
  updatedAt: Date;
}
