import { SystemRoles } from '../users/entities/user.entity';

export const KNOWLEDGE_NODE_KIND_COLLECTION = 'collection';
export const KNOWLEDGE_NODE_KIND_DOCUMENT = 'document';
export const KNOWLEDGE_NODE_KINDS = [
  KNOWLEDGE_NODE_KIND_COLLECTION,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
] as const;
export const KNOWLEDGE_NODE_DEFAULT_KIND = KNOWLEDGE_NODE_KIND_COLLECTION;

export const KNOWLEDGE_TREE_DOCUMENT_FILE_EXTENSION = '.md';

export const KNOWLEDGE_TREE_WRITE_ROLES = [
  SystemRoles.SUPER_ADMIN,
  SystemRoles.TENANT_ADMIN,
  SystemRoles.TENANT_OPERATOR,
] as const;
