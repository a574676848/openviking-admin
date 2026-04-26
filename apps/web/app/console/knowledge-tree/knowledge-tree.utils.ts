import type { KnowledgeAcl, KnowledgeNode, TreeNode } from "./knowledge-tree.types";

export const EMPTY_ACL: KnowledgeAcl = { isPublic: true, roles: [], users: [] };
export const ACL_ROLES = ["tenant_admin", "tenant_operator", "tenant_viewer"];
export const PIPELINE_STEPS = ["清洗", "分段", "切片", "向量化"];

export function buildTree(nodes: KnowledgeNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  nodes.forEach((node) => map.set(node.id, { ...node, children: [] }));

  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });

  return roots.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    tenant_admin: "管理员",
    tenant_operator: "运营者",
    tenant_viewer: "观察者",
  };
  return labels[role] ?? role;
}

export function collectDescendantIds(node: TreeNode): string[] {
  return node.children.flatMap((child) => [child.id, ...collectDescendantIds(child)]);
}

export function buildPermissionPreview(acl: KnowledgeAcl) {
  if (acl.isPublic) {
    return ["当前节点对租户内成员公开可见。", "检索链路不会额外收紧该节点的可见范围。"];
  }

  const lines = ["当前节点为私有受控资源。"];
  lines.push(
    acl.roles.length > 0
      ? `授权角色：${acl.roles.map(roleLabel).join(" / ")}`
      : "尚未选择授权角色，当前配置可能导致没有角色可见。",
  );
  lines.push(
    acl.users.length > 0
      ? `额外授权用户：${acl.users.join(" / ")}`
      : "未配置额外用户白名单。",
  );
  return lines;
}

export function findNode(tree: TreeNode[], nodeId: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }

    const child = findNode(node.children, nodeId);
    if (child) {
      return child;
    }
  }

  return null;
}
