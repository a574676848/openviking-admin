import type { KnowledgeNodeKind } from "./knowledge-tree.constants";

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

export interface ActorInfo {
  id: string | null;
  username: string | null;
}

export interface KnowledgeNode {
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  vikingUri: string | null;
  contentUri: string | null;
  kind: KnowledgeNodeKind;
  acl: KnowledgeAcl | null;
  indexStatus?: "clean" | "dirty" | "pending" | "indexing" | "failed";
  draftVersion?: number;
  indexedVersion?: number;
  vectorCount?: number | null;
  lastIndexedAt?: string | null;
  indexError?: string | null;
  createdBy?: ActorInfo | null;
  updatedBy?: ActorInfo | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TreeNode extends KnowledgeNode {
  children: TreeNode[];
}
