"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  DatabaseZap,
  FolderTree,
  Network,
  Plus,
  RefreshCw,
  Search,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/apiClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface KnowledgeBase {
  id: string;
  name: string;
  tenantId: string;
}

type KnowledgeAcl = {
  isPublic: boolean;
  roles: string[];
  users: string[];
};

interface KnowledgeNode {
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

interface TreeNode extends KnowledgeNode {
  children: TreeNode[];
}

const EMPTY_ACL: KnowledgeAcl = { isPublic: true, roles: [], users: [] };
const ACL_ROLES = ["tenant_admin", "tenant_operator", "tenant_viewer"];
const PIPELINE_STEPS = ["清洗", "分段", "切片", "向量化"];

function buildTree(nodes: KnowledgeNode[]): TreeNode[] {
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

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    tenant_admin: "管理员",
    tenant_operator: "运营者",
    tenant_viewer: "观察者",
  };
  return labels[role] ?? role;
}

function TreeItem({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (node: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selected === node.id;

  return (
    <div className="font-mono text-[11px] tracking-widest">
      <button
        type="button"
        className={`mb-1 flex w-full cursor-pointer items-center gap-2 border-[var(--border-width)] px-3 py-2.5 text-left transition-all ${
          isSelected
            ? "translate-x-2 border-[var(--border)] bg-[var(--text-primary)] text-[var(--bg-card)] shadow-[var(--shadow-base)]"
            : "border-transparent bg-[var(--bg-card)] text-[var(--text-primary)] hover:translate-x-1 hover:border-[var(--border)]"
        }`}
        style={{ marginLeft: `${depth * 12}px` }}
        onClick={() => onSelect(node)}
      >
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />
          ) : (
            <span className="h-1.5 w-1.5 bg-current" />
          )}
        </span>
        <FolderTree size={14} className={isSelected ? "text-[var(--brand)]" : "text-[var(--text-primary)]"} />
        <span className="min-w-0 flex-1 truncate font-black uppercase">{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div className="mb-2 ml-4 border-l-[var(--border-width)] border-dashed border-[var(--border)] pl-2">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

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

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const selectedKbName = kbs.find((kb) => kb.id === selectedKb)?.name ?? "未选择知识库";

  function selectNode(node: TreeNode | null) {
    setSelectedNode(node);
    if (!node) {
      setEditName("");
      setEditUri("");
      setEditAcl(EMPTY_ACL);
      return;
    }
    setEditName(node.name);
    setEditUri(node.vikingUri ?? "");
    setEditAcl(node.acl ?? EMPTY_ACL);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden theme-swiss">
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
          >
            <RefreshCw size={18} strokeWidth={2} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--border-width)] bg-[var(--border)] border-[var(--border-width)] border-[var(--border)] shadow-[var(--shadow-base)] lg:grid-cols-[320px_minmax(0,1fr)_288px]">
        <section className="flex min-h-0 flex-col bg-[var(--bg-card)]">
          <div className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <label className="mb-2 block font-mono text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              目标知识库
            </label>
            <select
              value={selectedKb}
              onChange={(event) => {
                setSelectedKb(event.target.value);
                setSelectedNode(null);
              }}
              className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs font-bold uppercase outline-none"
            >
              {kbs.map((kb) => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 border-b-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-3">
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="flex flex-1 items-center justify-center gap-2 border-[var(--border-width)] border-[var(--border)] bg-[var(--brand)] px-3 py-2 font-mono text-[10px] font-black uppercase text-[var(--brand-text)] shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none"
            >
              <Plus size={12} strokeWidth={3} /> 新建节点
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="border-b-[var(--border-width)] border-[var(--border)] bg-[var(--warning)] p-3">
              <input
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="输入节点名称"
                className="mb-2 w-full border-[var(--border-width)] border-[var(--border)] px-3 py-2 font-mono text-[10px] font-bold outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 border-[var(--border-width)] border-[var(--border)] bg-black py-1.5 font-mono text-[9px] font-black uppercase text-white shadow-[var(--shadow-base)] disabled:opacity-40"
                >
                  {submitting ? "创建中" : "提交创建"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="border-[var(--border-width)] border-[var(--border)] px-3 py-1.5 font-mono text-[9px] font-black uppercase"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            {tree.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[var(--text-muted)]">
                <Search size={42} strokeWidth={1.5} className="mb-4" />
                <p className="font-mono text-xs font-black uppercase tracking-widest">暂无节点数据</p>
              </div>
            ) : (
              tree.map((node) => (
                <TreeItem key={node.id} node={node} depth={0} selected={selectedNode?.id ?? null} onSelect={selectNode} />
              ))
            )}
          </div>
        </section>

        <section className="hidden-scrollbar min-h-0 overflow-y-auto bg-[var(--bg-base)] p-6">
          <div className="mb-6 flex items-center justify-between border-b-[var(--border-width)] border-[var(--border)] pb-4">
            <h2 className="font-mono text-sm font-black uppercase tracking-[0.2em] text-[var(--text-primary)]">
              {selectedNode ? `节点观察器 [${selectedNode.name}]` : "// 等待选择节点"}
            </h2>
            {selectedNode && (
              <div className="flex gap-2">
                {PIPELINE_STEPS.map((step) => (
                  <div key={step} className="flex items-center gap-1.5 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5">
                    <div className="h-2 w-2 animate-pulse bg-[var(--success)]" />
                    <span className="font-mono text-[9px] font-black">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!selectedNode ? (
            <div className="flex h-[60vh] flex-col items-center justify-center border-[var(--border-width)] border-dashed border-[var(--border)] bg-[var(--bg-card)] text-center">
              <AlertTriangle size={72} strokeWidth={1.5} className="mb-6 text-[var(--text-muted)]" />
              <h3 className="font-sans text-3xl font-black tracking-tighter">选择一个知识节点</h3>
              <p className="mt-3 max-w-md font-mono text-xs font-bold leading-6 text-[var(--text-secondary)]">
                左侧知识树用于定位节点，右侧面板用于调整权限与资源挂载。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-base)]">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <div className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.25em] text-[var(--brand)]">
                      {selectedNode.path || "/"}
                    </div>
                    <h3 className="font-sans text-5xl font-black tracking-tighter text-[var(--text-primary)]">
                      {selectedNode.name}
                    </h3>
                  </div>
                  <DatabaseZap size={48} strokeWidth={1.5} className="text-[var(--brand)]" />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {detailCards.map((item) => (
                    <div key={item.label} className={`border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-base)] ${item.full ? "md:col-span-2" : ""}`}>
                      <div className="mb-1 font-mono text-[9px] font-black uppercase text-[var(--text-muted)]">{item.label}</div>
                      <div className={`truncate font-mono text-xs font-black ${item.className}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedNode.children.length > 0 && (
                <div className="overflow-hidden border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-base)]">
                  <div className="flex justify-between bg-[var(--text-primary)] p-3 font-mono text-[10px] font-black uppercase text-[var(--bg-card)]">
                    <span>子节点列表</span>
                    <span>COUNT: {selectedNode.children.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {selectedNode.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => selectNode(child)}
                        className="group flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--brand-muted)]"
                      >
                        <span className="font-black text-[var(--brand)] transition-transform group-hover:translate-x-1">&gt;&gt;</span>
                        <span className="font-mono text-sm font-black uppercase">{child.name}</span>
                        <span className="ml-auto font-mono text-[10px] opacity-40">ID: {child.id.substring(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {selectedNode && (
          <aside className="flex min-h-0 flex-col overflow-hidden bg-[var(--bg-card)] p-6">
            <h3 className="mb-8 flex items-center border-b-[var(--border-width)] border-[var(--border)] pb-2 font-mono text-xs font-black uppercase">
              <TerminalSquare size={16} className="mr-2 text-[var(--brand)]" /> 节点属性与权限
            </h3>
            <div className="hidden-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
              <div className="space-y-2">
                <label className="block font-mono text-[10px] font-black uppercase">显示名称</label>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-sm font-bold outline-none" />
              </div>

              <div className="space-y-3 border-t-[var(--border-width)] border-dashed border-[var(--border)] pt-4">
                <label className="block font-mono text-[10px] font-black uppercase text-[var(--text-secondary)]">访问权限控制 ACL</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditAcl({ ...editAcl, isPublic: true })}
                    className={`flex-1 border-[var(--border-width)] border-[var(--border)] py-2 font-mono text-[10px] font-black transition-all ${editAcl.isPublic ? "bg-[var(--success)] text-white shadow-[var(--shadow-base)]" : "bg-[var(--bg-card)] text-[var(--text-primary)]"}`}
                  >
                    公开
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditAcl({ ...editAcl, isPublic: false })}
                    className={`flex-1 border-[var(--border-width)] border-[var(--border)] py-2 font-mono text-[10px] font-black transition-all ${!editAcl.isPublic ? "bg-[var(--text-primary)] text-[var(--bg-card)] shadow-[var(--shadow-base)]" : "bg-[var(--bg-card)] text-[var(--text-primary)]"}`}
                  >
                    私有
                  </button>
                </div>
                {!editAcl.isPublic && (
                  <div className="space-y-3 border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                    <label className="block font-mono text-[8px] font-black uppercase">授权角色</label>
                    <div className="flex flex-wrap gap-2">
                      {ACL_ROLES.map((role) => (
                        <label key={role} className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={editAcl.roles?.includes(role)}
                            onChange={(event) => toggleRole(role, event.target.checked)}
                            className="h-3 w-3 appearance-none border-2 border-[var(--border)] checked:bg-[var(--brand)]"
                          />
                          <span className="font-mono text-[9px] font-bold uppercase">{roleLabel(role)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block font-mono text-[10px] font-black uppercase">引擎资源 URI</label>
                <input value={editUri} onChange={(event) => setEditUri(event.target.value)} placeholder="viking://..." className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-xs font-bold outline-none" />
              </div>
            </div>
            <div className="mt-8 space-y-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full border-[var(--border-width)] border-[var(--border)] bg-[var(--text-primary)] py-4 font-mono text-xs font-black uppercase text-[var(--bg-card)] shadow-[var(--shadow-base)] transition-all hover:translate-y-1 hover:shadow-none disabled:opacity-30"
              >
                {saving ? "提交中" : "应用变更"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center justify-center gap-2 border-[var(--border-width)] border-[var(--border)] bg-[var(--danger)] py-3 font-mono text-[10px] font-black uppercase text-white shadow-[var(--shadow-base)] transition-all hover:translate-y-0.5 hover:shadow-none"
              >
                <Trash2 size={14} strokeWidth={2} /> 删除节点
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
