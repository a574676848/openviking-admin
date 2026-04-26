"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Network, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { KnowledgeTreeBrowser } from "./knowledge-tree-browser";
import { KnowledgeTreeEditor } from "./knowledge-tree-editor";
import { KnowledgeTreeInspector } from "./knowledge-tree-inspector";
import type { KnowledgeAcl, KnowledgeBase, KnowledgeNode, TreeNode } from "./knowledge-tree.types";
import { buildPermissionPreview, buildTree, collectDescendantIds, EMPTY_ACL, findNode } from "./knowledge-tree.utils";

export default function KnowledgeTreePage() {
  const confirm = useConfirm();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState("");
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUri, setEditUri] = useState("");
  const [editAcl, setEditAcl] = useState<KnowledgeAcl>(EMPTY_ACL);
  const [saving, setSaving] = useState(false);
  const [moveParentId, setMoveParentId] = useState<string>("__KEEP__");
  const [moving, setMoving] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const selectedKbName = kbs.find((kb) => kb.id === selectedKb)?.name ?? "未选择知识库";

  function selectNode(node: TreeNode | null) {
    setSelectedNode(node);
    if (!node) {
      setEditName("");
      setEditUri("");
      setEditAcl(EMPTY_ACL);
      setMoveParentId("__KEEP__");
      return;
    }
    setEditName(node.name);
    setEditUri(node.vikingUri ?? "");
    setEditAcl(node.acl ?? EMPTY_ACL);
    setMoveParentId(node.parentId ?? "__ROOT__");
  }

  useEffect(() => {
    queueMicrotask(() => {
      void apiClient
        .get<KnowledgeBase[]>("/knowledge-bases")
        .then((list) => {
          const safeList = Array.isArray(list) ? list : [];
          setKbs(safeList);
          if (safeList.length > 0) setSelectedKb(safeList[0].id);
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "知识库列表加载失败");
        });
    });
  }, []);

  const loadNodes = useCallback(() => {
    if (!selectedKb) return;
    setLoading(true);
    apiClient
      .get<KnowledgeNode[]>(`/knowledge-tree?kbId=${selectedKb}`)
      .then((list) => setNodes(Array.isArray(list) ? list : []))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "知识树加载失败");
      })
      .finally(() => setLoading(false));
  }, [selectedKb]);

  useEffect(() => {
    queueMicrotask(() => {
      loadNodes();
    });
  }, [loadNodes]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !selectedKb) return;

    setSubmitting(true);
    try {
      await apiClient.post("/knowledge-tree", {
        kbId: selectedKb,
        parentId: selectedNode?.id ?? null,
        name: newName.trim(),
      });
      toast.success("知识节点已创建");
      setNewName("");
      setShowForm(false);
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
        name: editName,
        vikingUri: editUri,
        acl: editAcl,
      });
      toast.success("节点属性与访问权限已同步");
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

  function toggleRole(role: string, checked: boolean) {
    const roles = checked
      ? Array.from(new Set([...(editAcl.roles ?? []), role]))
      : (editAcl.roles ?? []).filter((item) => item !== role);
    setEditAcl({ ...editAcl, roles });
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

    setMoving(true);
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
      setMoving(false);
      setDraggingNodeId(null);
      setDragOverNodeId(null);
      setDragOverRoot(false);
    }
  }

  async function handleMove() {
    if (!selectedNode) return;
    const nextParentId = moveParentId === "__ROOT__" ? null : moveParentId;
    if (moveParentId === "__KEEP__" || nextParentId === selectedNode.parentId) {
      toast.error("请先选择新的父节点");
      return;
    }
    await moveNode(selectedNode, nextParentId);
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

  const detailCards = selectedNode
    ? [
        { label: "系统唯一标识", value: selectedNode.id, className: "text-[var(--text-primary)]" },
        { label: "所属知识库", value: selectedKbName, className: "text-[var(--brand)]" },
        {
          label: "访问权限状态",
          value: selectedNode.acl?.isPublic ? "公开可见" : "私有受控",
          className: selectedNode.acl?.isPublic ? "text-[var(--success)]" : "text-[var(--danger)]",
        },
        { label: "排序权重", value: String(selectedNode.sortOrder), className: "text-[var(--warning)]" },
        { label: "引擎资源 URI", value: selectedNode.vikingUri || "未挂载", className: "text-[var(--info)]", full: true },
      ]
    : [];
  const permissionPreview = selectedNode ? buildPermissionPreview(editAcl) : [];
  const moveCandidates = selectedNode
    ? nodes.filter((node) => node.id !== selectedNode.id && !collectDescendantIds(selectedNode).includes(node.id))
    : [];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="mb-6 flex shrink-0 items-end justify-between border-b-[var(--border-width)] border-[var(--border)] pb-4">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-[var(--brand)]">
            <Network size={14} strokeWidth={2} /> Graph Tree Console
          </div>
          <h1 className="flex items-center font-sans text-4xl font-black tracking-tighter text-[var(--text-primary)] md:text-6xl">
            知识树编排
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-widest shadow-[var(--shadow-base)]">
            {loading ? "同步中" : `节点 ${nodes.length}`}
          </div>
          <button
            type="button"
            onClick={loadNodes}
            className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none"
            aria-label="刷新知识树"
            title="刷新知识树"
          >
            <RefreshCw size={18} strokeWidth={2} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] lg:grid-cols-[320px_minmax(0,1fr)_288px]">
        <KnowledgeTreeBrowser
          kbs={kbs}
          selectedKb={selectedKb}
          tree={tree}
          selectedNodeId={selectedNode?.id ?? null}
          loading={loading}
          showForm={showForm}
          newName={newName}
          submitting={submitting}
          draggingNodeId={draggingNodeId}
          dragOverNodeId={dragOverNodeId}
          dragOverRoot={dragOverRoot}
          onKbChange={(value) => {
            setSelectedKb(value);
            setSelectedNode(null);
          }}
          onToggleForm={() => setShowForm((value) => !value)}
          onNewNameChange={setNewName}
          onCreate={handleCreate}
          onCancelCreate={() => setShowForm(false)}
          onRefresh={loadNodes}
          onSelectNode={selectNode}
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
          onSelectNode={selectNode}
        />

        {selectedNode && (
          <KnowledgeTreeEditor
            selectedNode={selectedNode}
            editName={editName}
            editUri={editUri}
            editAcl={editAcl}
            moveParentId={moveParentId}
            moveCandidates={moveCandidates}
            permissionPreview={permissionPreview}
            saving={saving}
            moving={moving}
            onEditNameChange={setEditName}
            onEditUriChange={setEditUri}
            onEditAclChange={setEditAcl}
            onMoveParentChange={setMoveParentId}
            onToggleRole={toggleRole}
            onMove={handleMove}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
