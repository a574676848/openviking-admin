export const KNOWLEDGE_NODE_KIND_COLLECTION = "collection";
export const KNOWLEDGE_NODE_KIND_DOCUMENT = "document";
export const KNOWLEDGE_NODE_KINDS = [
  KNOWLEDGE_NODE_KIND_COLLECTION,
  KNOWLEDGE_NODE_KIND_DOCUMENT,
] as const;
export type KnowledgeNodeKind = (typeof KNOWLEDGE_NODE_KINDS)[number];

export const KNOWLEDGE_NODE_DEFAULT_KIND = KNOWLEDGE_NODE_KIND_COLLECTION;
export const KNOWLEDGE_TREE_ROOT_PARENT_VALUE = "__ROOT__";
export const KNOWLEDGE_TREE_API_PATH = "/knowledge-tree";
export const KNOWLEDGE_TREE_ROUTE = "/console/knowledge-tree";
export const KNOWLEDGE_SITE_ROUTE = "/site";
export const DOCUMENT_INDEX_STATUS_LABELS = {
  clean: "已索引",
  dirty: "待索引",
  pending: "待处理",
  indexing: "索引中",
  failed: "索引失败",
} as const;
export const DOCUMENT_INDEX_STATUS_TONES = {
  clean: "text-[var(--success)]",
  dirty: "text-[var(--warning)]",
  pending: "text-[var(--warning)]",
  indexing: "text-[var(--info)]",
  failed: "text-[var(--danger)]",
} as const;

export const KNOWLEDGE_NODE_KIND_LABELS: Record<KnowledgeNodeKind, string> = {
  [KNOWLEDGE_NODE_KIND_COLLECTION]: "目录节点",
  [KNOWLEDGE_NODE_KIND_DOCUMENT]: "文档节点",
};

export function buildKnowledgeSiteIndexRoute() {
  return KNOWLEDGE_SITE_ROUTE;
}

export function buildKnowledgeSiteHomeRoute(kbId: string) {
  return `${KNOWLEDGE_SITE_ROUTE}/${encodeURIComponent(kbId)}`;
}

export function buildKnowledgeSiteDocumentRoute(kbId: string, nodeId: string) {
  return `${buildKnowledgeSiteHomeRoute(kbId)}/doc/${encodeURIComponent(nodeId)}`;
}
