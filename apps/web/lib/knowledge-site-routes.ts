export function buildKnowledgeSiteHomeRoute(kbId: string): string {
  return `/site/${kbId}`;
}

export function buildKnowledgeSiteFolderRoute(kbId: string, nodeId: string): string {
  return `/site/${kbId}/folder/${nodeId}`;
}

export function buildKnowledgeSiteDocRoute(kbId: string, nodeId: string): string {
  return `/site/${kbId}/doc/${nodeId}`;
}

export function buildKnowledgeSiteIndexRoute(): string {
  return "/site";
}

