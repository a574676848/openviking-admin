"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Save,
  UsersRound,
  User,
  Clock,
  DatabaseZap,
} from "lucide-react";
import { NodeRenameDialog } from "@/components/knowledge-site/knowledge-site-dialogs";
import { findKnowledgeSiteNode } from "@/components/knowledge-site/knowledge-site-admin-utils";
import { DocumentEditor, type DocumentEditorState, type DocumentEditorStatus } from "@/components/document-editor/document-editor";
import {
  KnowledgeSiteShell,
  useKnowledgeSite,
} from "@/components/knowledge-site/knowledge-site-shell";
import { apiClient } from "@/lib/apiClient";
import {
  buildKnowledgeSiteDocRoute,
  buildKnowledgeSiteFolderRoute,
  buildKnowledgeSiteHomeRoute,
  buildKnowledgeSiteIndexRoute,
} from "@/lib/knowledge-site-routes";
import { KNOWLEDGE_NODE_KIND_COLLECTION } from "@/app/console/knowledge-tree/knowledge-tree.constants";
import { writeRecentKnowledgeDocument } from "@/lib/knowledge-site-recent";
import { useRouter } from "next/navigation";

interface DocumentMetadata {
  nodeId: string;
  kbId: string;
  name: string;
  contentUri: string | null;
  readOnly: boolean;
  canWrite: boolean;
  draftReady: boolean;
  collab: {
    path: string;
    documentName: string;
    serverUrl?: string;
  };
  updatedAt: string;
}

type LoadStatus = "loading" | "ready" | "error";

const EDITOR_METADATA_ENDPOINT_PREFIX = "/editor";
const COLLABORATOR_PLACEHOLDERS = ["我"];
const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});
const COLLAB_RECONNECT_STATUSES = new Set<DocumentEditorStatus>([
  "collabDisconnected",
  "error",
]);
const LOCAL_EDITOR_STATUSES = new Set<DocumentEditorStatus>([
  "ready",
  "dirty",
  "saving",
  "saved",
  "readonly",
  "uploadingAsset",
]);
const INITIAL_EDITOR_STATE: DocumentEditorState = {
  status: "loading",
  message: "正文加载中",
};

const DRAFT_WARM_POLL_INTERVAL_MS = 2500;
const DRAFT_WARM_MAX_POLLS = 24; // 最多轮询 60 秒

const META_BADGE_BASE_CLASS =
  "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-elevated)]/72 px-3 text-[13px] text-[var(--text-muted)] shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm";
const META_ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-[13px] font-medium transition-colors";

function buildEditorMetadataEndpoint(nodeId: string): string {
  return `${EDITOR_METADATA_ENDPOINT_PREFIX}/${encodeURIComponent(nodeId)}`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return DATE_FORMATTER.format(date);
}

function getStatusView(
  status: LoadStatus,
  metadata: DocumentMetadata | null,
  editorState: DocumentEditorState,
  useLocalEditorLabel = false,
) {
  if (status === "loading") {
    return {
      label: "加载中",
      className: "text-[var(--text-muted)]",
      icon: LoaderCircle,
      spinning: true,
    };
  }
  if (status === "error") {
    return {
      label: "加载失败",
      className: "text-[var(--danger)]",
      icon: AlertCircle,
      spinning: false,
    };
  }

  const editorStatusView: Record<
    DocumentEditorStatus,
    { label: string; className: string; icon: typeof LoaderCircle; spinning: boolean }
  > = {
    loading: { label: "正文加载中", className: "text-[var(--text-muted)]", icon: LoaderCircle, spinning: true },
    ready: { label: "已加载", className: "text-[var(--text-muted)]", icon: CheckCircle2, spinning: false },
    dirty: { label: "未保存", className: "text-[var(--brand)]", icon: CheckCircle2, spinning: false },
    saving: { label: "保存中", className: "text-[var(--text-muted)]", icon: LoaderCircle, spinning: true },
    saved: { label: "已保存", className: "text-[var(--text-muted)]", icon: CheckCircle2, spinning: false },
    readonly: { label: "只读", className: "text-[var(--text-muted)]", icon: Lock, spinning: false },
    uploadingAsset: { label: "图片上传中", className: "text-[var(--text-muted)]", icon: LoaderCircle, spinning: true },
    collabConnecting: { label: "协作连接中", className: "text-[var(--text-muted)]", icon: LoaderCircle, spinning: true },
    collabConnected: { label: "已连接", className: "text-[var(--text-muted)]", icon: UsersRound, spinning: false },
    collabSyncing: { label: "同步中", className: "text-[var(--text-muted)]", icon: LoaderCircle, spinning: true },
    collabSynced: { label: "已同步", className: "text-[var(--text-muted)]", icon: CheckCircle2, spinning: false },
    collabDisconnected: { label: "已断开", className: "text-[var(--warning)]", icon: AlertCircle, spinning: false },
    error: { label: "操作失败", className: "text-[var(--danger)]", icon: AlertCircle, spinning: false },
  };

  if (metadata) {
    if (editorState.status === "saving" && editorState.message === "正在更新索引") {
      return {
        label: "更新索引中",
        className: "text-[var(--text-muted)]",
        icon: LoaderCircle,
        spinning: true,
      };
    }

    if (useLocalEditorLabel) {
      if (editorState.status === "dirty") {
        return {
          label: "本地未保存",
          className: "text-[var(--brand)]",
          icon: CheckCircle2,
          spinning: false,
        };
      }
      if (editorState.status === "saving") {
        return {
          label: "本地保存中",
          className: "text-[var(--text-muted)]",
          icon: LoaderCircle,
          spinning: true,
        };
      }
      if (editorState.status === "saved") {
        return {
          label: "本地已保存",
          className: "text-[var(--text-muted)]",
          icon: CheckCircle2,
          spinning: false,
        };
      }
      if (editorState.status === "loading") {
        return {
          label: "本地编辑器加载中",
          className: "text-[var(--text-muted)]",
          icon: LoaderCircle,
          spinning: true,
        };
      }
    }
    return editorStatusView[editorState.status];
  }

  return editorStatusView.saved;
}

function getStatusBadgeClassName(className: string): string {
  return `${META_BADGE_BASE_CLASS} ${className}`;
}

function getActionButtonClassName(disabled: boolean, primary = false): string {
  if (disabled) {
    return `${META_ACTION_BUTTON_BASE_CLASS} cursor-not-allowed border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-disabled)] opacity-70`;
  }

  if (primary) {
    return `${META_ACTION_BUTTON_BASE_CLASS} border-[color:color-mix(in_srgb,var(--brand)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand)_10%,white)] text-[var(--brand)] hover:bg-[color:color-mix(in_srgb,var(--brand)_16%,white)]`;
  }

  return `${META_ACTION_BUTTON_BASE_CLASS} border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]`;
}

function isLocalFallbackEditorState(
  editorUsesCollab: boolean,
  editorState: DocumentEditorState,
): boolean {
  if (!editorUsesCollab) {
    return true;
  }

  if (LOCAL_EDITOR_STATUSES.has(editorState.status)) {
    return true;
  }

  return (
    editorState.status === "loading" && editorState.message === "正在读取正文"
  );
}

function KnowledgeSiteDocumentContent({
  kbId,
  nodeId,
}: {
  kbId: string;
  nodeId: string;
}) {
  const { tree, setActiveNodeMetadata } = useKnowledgeSite();
  const router = useRouter();
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [editorState, setEditorState] = useState<DocumentEditorState>(INITIAL_EDITOR_STATE);
  const [saveRequestId, setSaveRequestId] = useState(0);
  const [indexRequestId, setIndexRequestId] = useState(0);
  const [reconnectRequestId, setReconnectRequestId] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);

  const loadMetadata = useCallback(async () => {
    if (!nodeId) {
      setStatus("error");
      setErrorMessage("文档节点地址无效。");
      return;
    }

    // 路由回退行为拦截 (Fallback)
    const node = findKnowledgeSiteNode(tree, nodeId);
    if (node && node.kind === KNOWLEDGE_NODE_KIND_COLLECTION) {
      router.replace(buildKnowledgeSiteFolderRoute(kbId, nodeId));
      return;
    }

    setStatus("loading");
    setEditorState(INITIAL_EDITOR_STATE);
    setErrorMessage("");
    try {
      const nextMetadata = await apiClient.get<DocumentMetadata>(
        buildEditorMetadataEndpoint(nodeId),
      );
      if (nextMetadata.kbId !== kbId) {
        throw new Error("文档与当前站点不匹配。");
      }
      setMetadata(nextMetadata);
      setStatus("ready");
      writeRecentKnowledgeDocument({
        kbId: nextMetadata.kbId,
        nodeId: nextMetadata.nodeId,
        name: nextMetadata.name,
      });
    } catch (error: unknown) {
      setMetadata(null);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "文档元数据加载失败。",
      );
    }
  }, [kbId, nodeId, tree, router]);

  const editorReadOnly = Boolean(metadata?.readOnly || !metadata?.canWrite);
  const editorUsesCollab = Boolean(metadata?.collab.documentName);
  const isLocalFallbackEditor = isLocalFallbackEditorState(
    editorUsesCollab,
    editorState,
  );
  const effectiveUsesCollab = editorUsesCollab && !isLocalFallbackEditor;
  const reconnectEnabled =
    editorUsesCollab &&
    (isLocalFallbackEditor ||
      COLLAB_RECONNECT_STATUSES.has(editorState.status));
  const saveDisabled =
    status !== "ready" ||
    editorReadOnly ||
    editorState.status === "loading" ||
    editorState.status === "uploadingAsset" ||
    editorState.status === "saving" ||
    editorState.status === "error" ||
    effectiveUsesCollab;

  const isIndexing = editorState.status === "saving" && editorState.message === "正在更新索引";
  const indexDisabled =
    status !== "ready" ||
    editorReadOnly ||
    editorState.status === "loading" ||
    editorState.status === "uploadingAsset" ||
    editorState.status === "saving" ||
    editorState.status === "error";

  const statusView = getStatusView(
    status,
    metadata,
    editorState,
    isLocalFallbackEditor,
  );
  const StatusIcon = statusView.icon;
  const reconnectButtonTitle = reconnectEnabled
    ? isLocalFallbackEditor
      ? "重新连接协作服务，同时保留当前本地编辑入口"
      : "重新连接协作服务"
    : "当前协作连接正常";
  const manualSaveTitle = effectiveUsesCollab
    ? "协作在线时由服务端自动持久化，无需手动保存"
    : editorReadOnly
      ? "当前文档只读"
      : "保存本地编辑内容";
  const collaborators = effectiveUsesCollab ? COLLABORATOR_PLACEHOLDERS : [];
  const statusDetailMessage =
    editorState.status === "error" && editorState.message && editorState.message !== statusView.label
      ? editorState.message
      : "";
  const InfoIcon = effectiveUsesCollab ? UsersRound : StatusIcon;
  const infoLabel = effectiveUsesCollab
    ? `${statusView.label} · ${collaborators.length} 位协作者在线`
    : editorUsesCollab
      ? `已回退到本地编辑 · ${statusView.label}`
      : statusView.label;

  const breadcrumbLabels = useMemo(() => {
    const matchedNode = tree.flatMap(function walk(node): typeof node[] {
      if (node.id === nodeId) {
        return [node];
      }
      return node.children.flatMap(walk);
    })[0];

    return matchedNode?.path
      ? matchedNode.path.split("/").filter(Boolean)
      : metadata?.name
        ? [metadata.name]
        : [];
  }, [metadata?.name, nodeId, tree]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  // 草稿预热轮询：当 draftReady === false 时，每 2.5s 轮询一次直到就绪
  useEffect(() => {
    if (!metadata || metadata.draftReady !== false) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(async () => {
      if (cancelled || polls >= DRAFT_WARM_MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      polls += 1;
      try {
        const fresh = await apiClient.get<DocumentMetadata>(
          buildEditorMetadataEndpoint(nodeId),
        );
        if (!cancelled && fresh.draftReady) {
          setMetadata(fresh);
          clearInterval(timer);
        }
      } catch {
        // 静默重试
      }
    }, DRAFT_WARM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [metadata?.draftReady, nodeId]);

  useEffect(() => {
    if (metadata) {
      setActiveNodeMetadata({ updatedAt: metadata.updatedAt });
    }
    return () => setActiveNodeMetadata(null);
  }, [metadata, setActiveNodeMetadata]);

  async function handleInlineRename() {
    if (!metadata) return;
    const nextName = editingTitleValue.trim();
    if (!nextName || nextName === metadata.name.replace(/\.md$/, "")) {
      setIsEditingTitle(false);
      return;
    }

    setTitleSaving(true);
    try {
      const finalName = `${nextName}.md`;
      await apiClient.patch(`/knowledge-tree/${metadata.nodeId}`, {
        name: finalName,
      });
      await loadMetadata();
    } catch (error: unknown) {
      // 可以在此处静默失败或展示微小的错误提示
    } finally {
      setTitleSaving(false);
      setIsEditingTitle(false);
    }
  }

  const handleReconnect = useCallback(() => {
    if (!reconnectEnabled) {
      return;
    }
    setReconnectRequestId((value) => value + 1);
  }, [reconnectEnabled]);

  const handleManualSave = useCallback(() => {
    if (saveDisabled) {
      return;
    }
    setSaveRequestId((value) => value + 1);
  }, [saveDisabled]);

  const handleIndexContent = useCallback(() => {
    if (indexDisabled) {
      return;
    }
    setIndexRequestId((value) => value + 1);
  }, [indexDisabled]);

  return (
    <div className="flex min-h-0 flex-1 w-full flex-col">
      {status === "error" ? (
        <div className="space-y-6 py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--editor-surface)] text-[var(--danger)]">
            <AlertCircle size={22} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-[var(--text-primary)]">
              文档加载失败
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              {errorMessage || "当前无法读取文档元数据。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadMetadata()}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-text)] transition-colors hover:bg-[var(--brand-hover)]"
            >
              <RefreshCw size={15} strokeWidth={1.8} />
              重新加载
            </button>
            <Link
              href={buildKnowledgeSiteHomeRoute(kbId)}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              返回站点首页
            </Link>
          </div>
        </div>
      ) : (
        <article 
          aria-busy={status === "loading"} 
          aria-label="站点文档正文区域"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-base)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] overflow-hidden w-full">
            {/* Title & Meta Section */}
            <div className="pl-12 pr-4 pt-6 pb-2 md:pl-14 md:pr-6 lg:pl-16 lg:pr-8">
              {isEditingTitle ? (
                <input
                  value={editingTitleValue}
                  onChange={(e) => setEditingTitleValue(e.target.value)}
                  onBlur={handleInlineRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleInlineRename();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                  disabled={titleSaving}
                  className="w-full bg-transparent text-3xl font-bold leading-tight tracking-tight text-[var(--text-primary)] outline-none md:text-4xl"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingTitleValue(metadata?.name.replace(/\.md$/, "") || "");
                    setIsEditingTitle(true);
                  }}
                  className="group block w-full text-left outline-none"
                >
                  <h1 className="break-words text-3xl font-bold leading-tight tracking-tight text-[var(--text-primary)] transition-colors hover:text-[var(--brand)] md:text-4xl">
                    {metadata?.name.replace(/\.md$/, "") ?? "文档加载中"}
                  </h1>
                </button>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[var(--text-muted)]">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <User size={14} strokeWidth={2} />
                    <span>管理员编辑</span>
                  </div>
                  <div className="h-3 w-px bg-[var(--border)]" />
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} strokeWidth={2} />
                    <span>{metadata ? `${formatUpdatedAt(metadata.updatedAt)} 更新` : "读取中..."}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={getStatusBadgeClassName(statusView.className)}
                    aria-live="polite"
                  >
                    <InfoIcon
                      size={14}
                      strokeWidth={2}
                      className={statusView.spinning ? "animate-spin" : ""}
                    />
                    <span>{infoLabel}</span>
                    {statusDetailMessage ? (
                      <span className="text-[var(--text-disabled)]">· {statusDetailMessage}</span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={!reconnectEnabled}
                    title={reconnectButtonTitle}
                    className={getActionButtonClassName(!reconnectEnabled)}
                  >
                    <RefreshCw size={14} strokeWidth={2} />
                    <span>重连</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleIndexContent}
                    disabled={indexDisabled}
                    title="更新文档向量索引，使内容可被搜索"
                    className={getActionButtonClassName(indexDisabled)}
                  >
                    <DatabaseZap size={14} strokeWidth={2} className={isIndexing ? "animate-spin" : ""} />
                    <span>更新索引</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleManualSave}
                    disabled={saveDisabled}
                    title={manualSaveTitle}
                    className={getActionButtonClassName(
                      saveDisabled,
                      true,
                    )}
                  >
                    <Save size={14} strokeWidth={2} />
                    <span>手动保存</span>
                  </button>
                </div>
              </div>
              <div className="mt-4 border-b border-[var(--border)] opacity-50" />
            </div>

            {/* Editor Section */}
            <div className="min-h-0 flex-1 pl-12 pr-4 pb-10 md:pl-14 md:pr-6 lg:pl-16 lg:pr-8 flex flex-col">
              {metadata && !metadata.draftReady ? (
                <div className="flex flex-1 min-h-[600px] items-center justify-center">
                  <div className="flex flex-col items-center gap-5">
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[var(--brand-muted)] opacity-60" />
                      <span className="absolute inset-0 animate-[pulse_2s_ease-in-out_infinite] rounded-full border-2 border-[var(--brand)] opacity-30" />
                      <LoaderCircle
                        size={28}
                        strokeWidth={2}
                        className="relative animate-spin text-[var(--brand)]"
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        正在预热文档内容
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        首次加载时需从远端同步，请稍候…
                      </p>
                    </div>
                  </div>
                </div>
              ) : metadata ? (
                <div className="flex-1 min-h-[600px]">
                  <DocumentEditor
                    nodeId={metadata.nodeId}
                    readOnly={editorReadOnly}
                    saveRequestId={saveRequestId}
                    indexRequestId={indexRequestId}
                    reconnectRequestId={reconnectRequestId}
                    collab={editorUsesCollab ? metadata.collab : undefined}
                    onStateChange={setEditorState}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </article>
      )}
    </div>
  );
}

export default function KnowledgeSiteDocumentPage({
  params,
}: {
  params: Promise<{ kbId: string; nodeId: string }>;
}) {
  const { kbId, nodeId } = use(params);

  return (
    <KnowledgeSiteShell kbId={kbId} activeNodeId={nodeId}>
      <KnowledgeSiteDocumentContent
        kbId={kbId}
        nodeId={nodeId}
      />
    </KnowledgeSiteShell>
  );
}
