export interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
}

export type KnowledgeAcl = {
  isPublic: boolean;
  roles: string[];
  users: string[];
};

export interface KnowledgeNode {
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  vikingUri: string | null;
  acl: KnowledgeAcl | null;
  createdAt: string;
}

export interface TreeNode extends KnowledgeNode {
  children: TreeNode[];
}
