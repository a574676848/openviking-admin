import type {
  KnowledgeNodeSummary,
  KnowledgeSiteTreeNode,
} from "./knowledge-site-shell";

export type KnowledgeSiteAcl = NonNullable<KnowledgeNodeSummary["acl"]>;

export interface TenantUserOption {
  id: string;
  username: string;
  role: string;
  active: boolean;
}

export const EMPTY_KNOWLEDGE_SITE_ACL: KnowledgeSiteAcl = {
  isPublic: true,
  roles: [],
  users: [],
};

export const KNOWLEDGE_SITE_ACL_ROLES = [
  "tenant_admin",
  "tenant_operator",
  "tenant_viewer",
];

export function cloneKnowledgeSiteAcl(
  acl: KnowledgeNodeSummary["acl"] | null | undefined,
): KnowledgeSiteAcl {
  if (!acl) {
    return { ...EMPTY_KNOWLEDGE_SITE_ACL };
  }

  return {
    isPublic: Boolean(acl.isPublic),
    roles: [...acl.roles],
    users: [...acl.users],
  };
}

export function buildKnowledgeSiteTree(nodes: KnowledgeNodeSummary[]) {
  const map = new Map<string, KnowledgeSiteTreeNode>();
  nodes.forEach((node) => {
    map.set(node.id, { ...node, children: [] });
  });

  const roots: KnowledgeSiteTreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  return roots.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function findKnowledgeSiteNode(
  tree: KnowledgeSiteTreeNode[],
  nodeId: string,
): KnowledgeSiteTreeNode | null {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }

    const child = findKnowledgeSiteNode(node.children, nodeId);
    if (child) {
      return child;
    }
  }

  return null;
}

export function collectKnowledgeSiteDescendantIds(
  node: KnowledgeSiteTreeNode,
): string[] {
  return node.children.flatMap((child) => [
    child.id,
    ...collectKnowledgeSiteDescendantIds(child),
  ]);
}

export function flattenKnowledgeSiteCollections(
  tree: KnowledgeSiteTreeNode[],
  excludeNodeId?: string,
): KnowledgeSiteTreeNode[] {
  return tree.flatMap((node) => {
    if (node.kind === "document") {
      return [];
    }
    if (excludeNodeId && node.id === excludeNodeId) {
      return [];
    }
    return [
      node,
      ...flattenKnowledgeSiteCollections(node.children, excludeNodeId),
    ];
  });
}

export function countKnowledgeSiteDocuments(
  tree: KnowledgeSiteTreeNode[],
): number {
  return tree.reduce((total, node) => {
    if (node.kind === "document") {
      return total + 1;
    }
    return total + countKnowledgeSiteDocuments(node.children);
  }, 0);
}

export function countKnowledgeSiteCollections(
  tree: KnowledgeSiteTreeNode[],
): number {
  return tree.reduce((total, node) => {
    if (node.kind === "document") {
      return total;
    }
    return total + 1 + countKnowledgeSiteCollections(node.children);
  }, 0);
}

export function knowledgeSiteRoleLabel(role: string) {
  const labels: Record<string, string> = {
    tenant_admin: "管理员",
    tenant_operator: "运营者",
    tenant_viewer: "观察者",
  };

  return labels[role] ?? role;
}

export function buildKnowledgeSitePermissionPreview(
  acl: KnowledgeSiteAcl,
  tenantUsers: TenantUserOption[],
): string[] {
  if (acl.isPublic) {
    return [
      "当前节点对租户内成员公开可见。",
      "检索和阅读链路不会对该节点追加额外可见性限制。",
    ];
  }

  const userMap = new Map(
    tenantUsers.map((user) => [user.id, user.username]),
  );
  const lines = ["当前节点为私有资源。"];
  lines.push(
    acl.roles.length > 0
      ? `授权角色：${acl.roles.map(knowledgeSiteRoleLabel).join(" / ")}`
      : "尚未选择授权角色，当前配置可能导致所有角色都不可见。",
  );

  if (acl.users.length > 0) {
    lines.push(
      `额外授权用户：${acl.users
        .map((userId) => userMap.get(userId) ?? userId)
        .join(" / ")}`,
    );
  }

  return lines;
}
