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

export interface TenantUserOption {
  id: string;
  username: string;
  role: string;
  active: boolean;
}

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
