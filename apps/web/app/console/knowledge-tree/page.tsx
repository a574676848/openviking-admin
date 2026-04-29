"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KnowledgeTreeBrowser } from "./knowledge-tree-browser";
import { KnowledgeTreeInspector } from "./knowledge-tree-inspector";
import { AddNodeModal } from "./add-node-modal";
import type { KnowledgeAcl, KnowledgeBase, KnowledgeNode, TenantUserOption, TreeNode } from "./knowledge-tree.types";
import { buildPermissionPreview, buildTree, collectDescendantIds, EMPTY_ACL, findNode } from "./knowledge-tree.utils";

export default function KnowledgeTreePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState("");
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editAcl, setEditAcl] = useState<KnowledgeAcl>(EMPTY_ACL);
  const [saving, setSaving] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [tenantUsersLoading, setTenantUsersLoading] = useState(false);
  const [tenantUsersError, setTenantUsersError] = useState("");
  const [nodesLoadedForKb, setNodesLoadedForKb] = useState("");
  const pendingNodeIdRef = useRef(searchParams.get("nodeId"));
  const initialKbId = searchParams.get("kbId");

  const tree = buildTree(nodes);
  const selectedKbName = kbs.find((kb) => kb.id === selectedKb)?.name ?? "未选择知识库";

  function selectNode(node: TreeNode | null) {
    setSelectedNode(node);
    if (!node) {
      setEditAcl(EMPTY_ACL);
      return;
    }
    setEditAcl(node.acl ?? EMPTY_ACL);
  }

  async function handleInlineRename(node: TreeNode, nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === node.name) {
      return;
    }

    try {
      await apiClient.patch(`/knowledge-tree/${node.id}`, {
        name: trimmedName,
      });
      if (selectedNode?.id === node.id) {
        setSelectedNode({ ...selectedNode, name: trimmedName });
      }
      toast.success("节点名称已更新");
      loadNodes();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "更新节点名称失败");
    }
  }

  useEffect(() => {
    pendingNodeIdRef.current = searchParams.get("nodeId");
  }, [searchParams]);

  useEffect(() => {
    queueMicrotask(() => {
      void apiClient
        .get<KnowledgeBase[]>("/knowledge-bases")
        .then((list) => {
          const safeList = Array.isArray(list) ? list : [];
          setKbs(safeList);
          const nextKbId = safeList.find((kb) => kb.id === initialKbId)?.id ?? safeList[0]?.id ?? "";
          setSelectedKb(nextKbId);
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "知识库列表加载失败");
        });
    });
  }, [initialKbId]);

  useEffect(() => {
    queueMicrotask(() => {
      setTenantUsersLoading(true);
      setTenantUsersError("");
      void apiClient
        .get<Array<{ id: string; username: string; role: string; active: boolean }>>("/users")
        .then((list) => {
          setTenantUsers(Array.isArray(list) ? list : []);
        })
        .catch((error: unknown) => {
          setTenantUsers([]);
          setTenantUsersError(error instanceof Error ? error.message : "租户用户列表加载失败");
        })
        .finally(() => setTenantUsersLoading(false));
    });
  }, []);

  const loadNodes = useCallback(() => {
    if (!selectedKb) return;
    setLoading(true);
    setNodesLoadedForKb("");
    apiClient
      .get<KnowledgeNode[]>(`/knowledge-tree?kbId=${selectedKb}`)
      .then((list) => setNodes(Array.isArray(list) ? list : []))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "知识树加载失败");
      })
      .finally(() => {
        setLoading(false);
        setNodesLoadedForKb(selectedKb);
      });
  }, [selectedKb]);

  useEffect(() => {
    queueMicrotask(() => {
      loadNodes();
    });
  }, [loadNodes]);

  useEffect(() => {
    if (!pendingNodeIdRef.current) {
      return;
    }
    if (!selectedKb || loading) {
      return;
    }
    if (nodesLoadedForKb !== selectedKb) {
      return;
    }

    const targetNode = findNode(tree, pendingNodeIdRef.current);
    if (!targetNode) {
      pendingNodeIdRef.current = null;
      return;
    }

    selectNode(targetNode);
    pendingNodeIdRef.current = null;
  }, [loading, nodesLoadedForKb, selectedKb, tree]);

  async function handleCreate(name: string, parentId: string | null) {
    if (!name.trim() || !selectedKb) return;

    setSubmitting(true);
    try {
      await apiClient.post("/knowledge-tree", {
        kbId: selectedKb,
        parentId,
        name: name.trim(),
      });
      toast.success("知识节点已创建");
      setShowAddModal(false);
      loadNodes();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建节点失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave() {
    if (!selectedNode) return;
    setSaving(true);
    try {
      await apiClient.patch(`/knowledge-tree/${selectedNode.id}`, {
        acl: editAcl,
      });
      toast.success("保存成功");
      loadNodes();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "保存节点失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedNode) return;
    const approved = await confirm({
      title: "删除知识节点",
      description: `将永久删除「${selectedNode.name}」及其子节点，相关索引资源需要重新同步。`,
      confirmText: "删除节点",
      cancelText: "保留",
      tone: "danger",
    });
    if (!approved) return;

    try {
      await apiClient.delete(`/knowledge-tree/${selectedNode.id}`);
      toast.success("知识节点已删除");
      selectNode(null);
      loadNodes();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "删除节点失败");
    }
  }

  async function moveNode(node: TreeNode, nextParentId: string | null) {
    const targetLabel = nextParentId === null ? "根目录" : findNode(tree, nextParentId)?.name ?? "目标节点";
    const approved = await confirm({
      title: "确认调整节点结构",
      description: `将把「${node.name}」移动到「${targetLabel}」下方，知识树路径与子节点继承关系会随之变化。`,
      confirmText: "确认移动",
      cancelText: "返回",
      tone: "danger",
    });
    if (!approved) {
      setDragOverNodeId(null);
      setDragOverRoot(false);
      return;
    }

    try {
      await apiClient.patch(`/knowledge-tree/${node.id}/move`, {
        parentId: nextParentId,
        sortOrder: node.sortOrder,
      });
      toast.success("节点层级已更新");
      loadNodes();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "移动节点失败");
    } finally {
      setDraggingNodeId(null);
      setDragOverNodeId(null);
      setDragOverRoot(false);
    }
  }

  function handleDragStart(node: TreeNode) {
    setDraggingNodeId(node.id);
    setDragOverNodeId(null);
    setDragOverRoot(false);
    selectNode(node);
  }

  function handleDragHover(node: TreeNode) {
    if (!draggingNodeId || draggingNodeId === node.id) {
      return;
    }
    setDragOverRoot(false);
    setDragOverNodeId(node.id);
  }

  function handleDragEnd() {
    setDraggingNodeId(null);
    setDragOverNodeId(null);
    setDragOverRoot(false);
  }

  function handleDropTarget(targetNode: TreeNode) {
    if (!draggingNodeId) return;

    const draggingNode = findNode(tree, draggingNodeId);
    if (!draggingNode) {
      handleDragEnd();
      return;
    }
    if (draggingNode.id === targetNode.id || collectDescendantIds(draggingNode).includes(targetNode.id)) {
      toast.error("不能将节点移动到自身或其子节点下");
      handleDragEnd();
      return;
    }

    setDragOverNodeId(targetNode.id);
    void moveNode(draggingNode, targetNode.id);
  }

  function handleDropRoot() {
    if (!draggingNodeId) return;

    const draggingNode = findNode(tree, draggingNodeId);
    if (!draggingNode) {
      handleDragEnd();
      return;
    }
    if (draggingNode.parentId === null) {
      toast.error("当前节点已经位于根目录");
      handleDragEnd();
      return;
    }

    setDragOverRoot(true);
    void moveNode(draggingNode, null);
  }

  const permissionPreview = selectedNode ? buildPermissionPreview(editAcl, tenantUsers) : [];
  const detailCards = selectedNode
    ? [
        { label: "系统唯一标识", value: selectedNode.id, className: "text-[var(--text-primary)]" },
        { label: "所属知识库", value: selectedKbName, className: "text-[var(--text-primary)]" },
        { label: "引擎资源 URI", value: selectedNode.vikingUri || "未挂载", className: "text-[var(--info)]", full: true },
        {
          label: "节点状态",
          value: editAcl.isPublic ? "公开节点" : "私有节点",
          className: editAcl.isPublic ? "text-[var(--success)]" : "text-[var(--brand)]",
        },
        {
          label: "访问预览",
          lines: permissionPreview,
          className: "text-[var(--brand)]",
        },
      ]
    : [];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="mb-6 flex shrink-0 items-end justify-between border-b-[var(--border-width)] border-[var(--border)] pb-4">
        <div>
          <h1 className="flex items-center gap-4 font-sans text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            图谱知识树
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--text-muted)]">
            统一管理租户知识库、容量使用与知识树入口
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!selectedKb) {
                return;
              }
              void router.push(`/console/graph?kbId=${encodeURIComponent(selectedKb)}`);
            }}
            disabled={!selectedKb}
            className="rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-sans text-sm font-bold text-[var(--text-primary)] shadow-[var(--shadow-base)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            title="切换到图谱视图"
          >
            图谱视图
          </button>
          <div className="rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-widest shadow-[var(--shadow-base)]">
            {loading ? "同步中" : `节点 ${nodes.length}`}
          </div>
          <button
            type="button"
            onClick={loadNodes}
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-pill)] border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-hover)]"
            aria-label="刷新知识树"
            title="刷新知识树"
          >
            <RefreshCw size={18} strokeWidth={2} className={loading ? "animate-theme-pulse" : ""} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--border-width)] overflow-hidden rounded-[var(--radius-base)] border-[var(--border-width)] border-[var(--border)] bg-[var(--border)] shadow-[var(--shadow-base)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <KnowledgeTreeBrowser
          kbs={kbs}
          selectedKb={selectedKb}
          tree={tree}
          selectedNodeId={selectedNode?.id ?? null}
          draggingNodeId={draggingNodeId}
          dragOverNodeId={dragOverNodeId}
          dragOverRoot={dragOverRoot}
          onKbChange={(value) => {
            setSelectedKb(value);
            setSelectedNode(null);
          }}
          onAddNode={() => setShowAddModal(true)}
          onSelectNode={selectNode}
          onRenameNode={handleInlineRename}
          onDragStart={handleDragStart}
          onDragHover={handleDragHover}
          onDragEnd={handleDragEnd}
          onDropToNode={handleDropTarget}
          onRootDragOver={(event) => {
            event.preventDefault();
            setDragOverRoot(true);
            setDragOverNodeId(null);
          }}
          onRootDragLeave={() => setDragOverRoot(false)}
          onDropRoot={(event) => {
            event.preventDefault();
            handleDropRoot();
          }}
        />

        <KnowledgeTreeInspector
          selectedNode={selectedNode}
          detailCards={detailCards}
          editAcl={editAcl}
          tenantUsers={tenantUsers}
          tenantUsersLoading={tenantUsersLoading}
          tenantUsersError={tenantUsersError}
          saving={saving}
          onEditAclChange={setEditAcl}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>

      <AddNodeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreate}
        tree={tree}
        defaultParentId={selectedNode?.id ?? null}
        submitting={submitting}
      />
    </div>
  );
}
