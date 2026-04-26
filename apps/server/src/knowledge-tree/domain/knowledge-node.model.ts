export interface KnowledgeNodeAcl {
  roles?: string[];
  users?: string[];
  isPublic?: boolean;
}

export interface KnowledgeNodeModel {
  id: string;
  tenantId: string | null;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string | null;
  sortOrder: number;
  acl: KnowledgeNodeAcl | null;
  vikingUri: string | null;
  createdAt: Date;
  updatedAt: Date;
}
