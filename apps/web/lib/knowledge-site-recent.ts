"use client";

export interface RecentKnowledgeDocument {
  kbId: string;
  nodeId: string;
  name: string;
  visitedAt: string;
}

const RECENT_DOCUMENTS_STORAGE_KEY_PREFIX = "ov_site_recent_documents";
const MAX_RECENT_DOCUMENTS = 8;

function buildStorageKey(tenantId: string | null | undefined): string {
  return tenantId
    ? `${RECENT_DOCUMENTS_STORAGE_KEY_PREFIX}:${tenantId}`
    : RECENT_DOCUMENTS_STORAGE_KEY_PREFIX;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRecentKnowledgeDocuments(tenantId?: string | null): RecentKnowledgeDocument[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(buildStorageKey(tenantId));
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is RecentKnowledgeDocument =>
        Boolean(
          item &&
            typeof item === "object" &&
            typeof item.kbId === "string" &&
            typeof item.nodeId === "string" &&
            typeof item.name === "string" &&
            typeof item.visitedAt === "string",
        ),
    );
  } catch {
    return [];
  }
}

export function writeRecentKnowledgeDocument(
  document: Omit<RecentKnowledgeDocument, "visitedAt">,
  tenantId?: string | null,
): RecentKnowledgeDocument[] {
  if (!canUseStorage()) {
    return [];
  }

  const nextEntry: RecentKnowledgeDocument = {
    ...document,
    visitedAt: new Date().toISOString(),
  };
  const deduped = readRecentKnowledgeDocuments(tenantId).filter(
    (item) => !(item.kbId === document.kbId && item.nodeId === document.nodeId),
  );
  const nextDocuments = [nextEntry, ...deduped].slice(0, MAX_RECENT_DOCUMENTS);
  window.localStorage.setItem(
    buildStorageKey(tenantId),
    JSON.stringify(nextDocuments),
  );
  return nextDocuments;
}
