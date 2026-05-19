"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { Node as TiptapNode } from "@tiptap/core";
import { zh } from "@blocknote/core/locales";
import {
  SuggestionMenuController,
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SideMenu,
  DragHandleButton,
  useExtensionState,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import {
  AlertCircle,
  FileCode2,
  LoaderCircle,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import { defaultBlockSpecs, BlockNoteSchema, createExtension } from "@blocknote/core";
import { MermaidBlock } from "./mermaid-block";
import { CustomCodeBlock } from "./code-block";
import { apiClient } from "@/lib/apiClient";
import { readSessionToken } from "@/lib/session";
import {
  createDocumentAssetObjectUrlStore,
  uploadDocumentAsset,
} from "./document-assets";
import {
  isEnterpriseClipboardHtml,
  normalizeEnterpriseClipboardBlocks,
  sanitizeEnterpriseClipboardHtmlToMarkdown,
} from "./document-paste";
import {
  bindDocumentCollabStatus,
  cleanupDocumentCollabSession,
  createDocumentCollabSession,
  type DocumentCollabConfig,
  type DocumentCollabSession,
  type DocumentCollabStatus,
} from "./document-collaboration";
import { DocumentToolbar } from "./document-toolbar";

export type DocumentEditorStatus =
  | "loading"
  | "ready"
  | "dirty"
  | "saving"
  | "saved"
  | "readonly"
  | "uploadingAsset"
  | "collabConnecting"
  | "collabConnected"
  | "collabSyncing"
  | "collabSynced"
  | "collabDisconnected"
  | "error";

export interface DocumentEditorState {
  status: DocumentEditorStatus;
  message?: string;
  updatedAt?: string;
}

interface DocumentContentSnapshot {
  nodeId: string;
  kbId: string;
  name: string;
  contentUri: string | null;
  blocks: PartialBlock[];
  updatedAt: string;
}

interface DocumentSaveResult {
  nodeId: string;
  contentUri: string | null;
  draftVersion: number;
  indexStatus: string;
  updatedAt: string;
}

interface DocumentIndexResult {
  nodeId: string;
  contentUri: string;
  draftVersion: number;
  indexedVersion: number;
  indexStatus: string;
  vectorCount: number | null;
  lastIndexedAt: string | null;
}

interface DocumentEditorProps {
  nodeId: string;
  readOnly: boolean;
  saveRequestId: number;
  indexRequestId?: number;
  reconnectRequestId?: number;
  collab?: DocumentCollabConfig;
  onStateChange: (state: DocumentEditorState) => void;
}

interface DocumentCollaborativeEditorProps {
  nodeId: string;
  collab: DocumentCollabConfig;
  readOnly: boolean;
  saveRequestId: number;
  indexRequestId?: number;
  reconnectRequestId?: number;
  onStateChange: (state: DocumentEditorState) => void;
}

interface DocumentCollaborativeEditorSurfaceProps {
  nodeId: string;
  session: DocumentCollabSession;
  readOnly: boolean;
  indexRequestId?: number;
  onStateChange: (state: DocumentEditorState) => void;
}

interface DocumentEditorSurfaceProps {
  nodeId: string;
  initialBlocks: PartialBlock[];
  readOnly: boolean;
  saveRequestId: number;
  indexRequestId?: number;
  onStateChange: (state: DocumentEditorState) => void;
}

const DOCUMENT_CONTENT_ENDPOINT_SUFFIX = "content";
const API_V1_PREFIX = "/api/v1";
const JSON_CONTENT_TYPE = "application/json";
const EMPTY_DOCUMENT_BLOCKS: PartialBlock[] = [{ type: "paragraph", content: "" }];
const ASSET_UPLOAD_MESSAGE = "图片上传中";
const ASSET_UPLOAD_DIRTY_MESSAGE = "图片已插入，尚未保存";
const ASSET_UPLOAD_READONLY_MESSAGE = "当前文档只读，不能上传图片。";
const ASSET_UPLOAD_ERROR_MESSAGE = "图片上传失败。";
const COLLAB_STATUS_MESSAGE: Record<DocumentCollabStatus, string> = {
  collabConnecting: "协作连接中",
  collabConnected: "协作已连接",
  collabSyncing: "同步到协作服务中",
  collabSynced: "已同步到协作服务",
  collabDisconnected: "协作连接已断开",
  error: "协作连接失败",
};
const COLLAB_CONNECTION_TIMEOUT_MS = 5000;
const BLOCKNOTE_THEME: Theme = {
  colors: {
    editor: {
      text: "var(--text-primary)",
      background: "transparent",
    },
    menu: {
      text: "var(--text-primary)",
      background: "var(--editor-toolbar-bg)",
    },
    tooltip: {
      text: "var(--text-primary)",
      background: "var(--editor-toolbar-bg)",
    },
    hovered: {
      text: "var(--text-primary)",
      background: "var(--brand-muted)",
    },
    selected: {
      text: "var(--text-primary)",
      background: "var(--brand-muted)",
    },
    disabled: {
      text: "var(--text-muted)",
      background: "var(--editor-surface)",
    },
    shadow: "var(--shadow-base)",
    border: "var(--border)",
  },
  borderRadius: 28, // 匹配 --radius-base
  fontFamily: "var(--font-stack-sans)",
};
const MARKDOWN_SLASH_MENU_KEYS = new Set([
  "heading",
  "heading_2",
  "heading_3",
  "paragraph",
  "quote",
  "bullet_list",
  "numbered_list",
  "check_list",
  "divider",
  "table",
  "image",
]);

const BLOCK_GROUP_NODE_NAME = "blockGroup";
const BLOCK_CONTAINER_NODE_NAME = "blockContainer";
const BLOCK_OUTER_NODE_TYPE = "blockOuter";
const BLOCK_GROUP_CLASS_NAME = "bn-block-group";
const BLOCK_CONTAINER_CLASS_NAME = "bn-block";
const BLOCK_OUTER_CLASS_NAME = "bn-block-outer";
const BLOCK_CONTAINER_DATA_ATTRIBUTES: Record<string, string> = {
  blockColor: "data-block-color",
  blockStyle: "data-block-style",
  id: "data-id",
  depth: "data-depth",
  depthChange: "data-depth-change",
};

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    mermaid: MermaidBlock(),
    procode: CustomCodeBlock(),
  },
});

function mergeClassName(...classNames: Array<string | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function setAttributeIfPresent(
  element: HTMLElement,
  attribute: string,
  value: unknown,
): void {
  if (value !== null && value !== undefined && value !== "") {
    element.setAttribute(attribute, String(value));
  }
}

function setAttributes(element: HTMLElement, attributes: Record<string, unknown>): void {
  for (const [attribute, value] of Object.entries(attributes)) {
    if (attribute !== "class") {
      setAttributeIfPresent(element, attribute, value);
    }
  }
}

function createBlockGroupNodeView() {
  const blockGroup = document.createElement("div");
  blockGroup.className = BLOCK_GROUP_CLASS_NAME;
  blockGroup.setAttribute("data-node-type", BLOCK_GROUP_NODE_NAME);

  return {
    dom: blockGroup,
    contentDOM: blockGroup,
  };
}

function createBlockContainerNodeView({
  node,
  HTMLAttributes = {},
}: {
  node: { attrs: Record<string, unknown> };
  HTMLAttributes?: Record<string, unknown>;
}) {
  const blockOuter = document.createElement("div");
  blockOuter.className = BLOCK_OUTER_CLASS_NAME;
  blockOuter.setAttribute("data-node-type", BLOCK_OUTER_NODE_TYPE);
  setAttributes(blockOuter, HTMLAttributes);

  const block = document.createElement("div");
  block.className = mergeClassName(
    BLOCK_CONTAINER_CLASS_NAME,
    HTMLAttributes.class as string,
  );
  block.setAttribute("data-node-type", BLOCK_CONTAINER_NODE_NAME);
  setAttributes(block, HTMLAttributes);
  for (const [nodeAttribute, domAttribute] of Object.entries(
    BLOCK_CONTAINER_DATA_ATTRIBUTES,
  )) {
    setAttributeIfPresent(block, domAttribute, node.attrs[nodeAttribute]);
  }

  blockOuter.appendChild(block);

  return {
    dom: blockOuter,
    contentDOM: block,
  };
}

const BlockNoteContainerNodeViewExtension = createExtension({
  key: "blocknote-container-node-views",
  tiptapExtensions: [
    TiptapNode.create({
      name: BLOCK_GROUP_NODE_NAME,
      group: "childContainer",
      content: "blockGroupChild+",
      marks: "deletion insertion modification",
      parseHTML() {
        return [
          {
            tag: "div",
            getAttrs: (element) =>
              typeof element !== "string" &&
              element.getAttribute("data-node-type") === BLOCK_GROUP_NODE_NAME
                ? null
                : false,
          },
        ];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          {
            ...HTMLAttributes,
            "data-node-type": BLOCK_GROUP_NODE_NAME,
            class: mergeClassName(BLOCK_GROUP_CLASS_NAME, HTMLAttributes.class),
          },
          0,
        ];
      },
      addNodeView() {
        return createBlockGroupNodeView;
      },
    }),
    TiptapNode.create({
      name: BLOCK_CONTAINER_NODE_NAME,
      group: "blockGroupChild bnBlock",
      content: "blockContent blockGroup?",
      priority: 50,
      defining: true,
      marks: "insertion modification deletion",
      parseHTML() {
        return [
          {
            tag: `div[data-node-type="${BLOCK_CONTAINER_NODE_NAME}"]`,
            getAttrs: (element) => {
              if (typeof element === "string") {
                return false;
              }

              const attrs: Record<string, string> = {};
              for (const [nodeAttribute, domAttribute] of Object.entries(
                BLOCK_CONTAINER_DATA_ATTRIBUTES,
              )) {
                const value = element.getAttribute(domAttribute);
                if (value) {
                  attrs[nodeAttribute] = value;
                }
              }
              return attrs;
            },
          },
          {
            tag: `div[data-node-type="${BLOCK_OUTER_NODE_TYPE}"]`,
            skip: true,
          },
        ];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          {
            ...HTMLAttributes,
            "data-node-type": BLOCK_OUTER_NODE_TYPE,
            class: BLOCK_OUTER_CLASS_NAME,
          },
          [
            "div",
            {
              ...HTMLAttributes,
              "data-node-type": BLOCK_CONTAINER_NODE_NAME,
              class: mergeClassName(BLOCK_CONTAINER_CLASS_NAME, HTMLAttributes.class),
            },
            0,
          ],
        ];
      },
      addNodeView() {
        return createBlockContainerNodeView;
      },
    }),
  ],
});

const BLOCKNOTE_EXTENSIONS = [BlockNoteContainerNodeViewExtension];

function buildDocumentContentEndpoint(nodeId: string): string {
  return `/editor/${encodeURIComponent(nodeId)}/${DOCUMENT_CONTENT_ENDPOINT_SUFFIX}`;
}

function buildDocumentContentRequestUrl(nodeId: string): string {
  return `${API_V1_PREFIX}${buildDocumentContentEndpoint(nodeId)}`;
}

function buildDocumentIndexEndpoint(nodeId: string): string {
  return `/editor/${encodeURIComponent(nodeId)}/index`;
}

function normalizeBlocks(blocks: unknown): PartialBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return EMPTY_DOCUMENT_BLOCKS;
  }
  return blocks.map((block) => normalizeBlock(block)) as PartialBlock[];
}

function normalizeBlock(block: unknown): unknown {
  if (!block || typeof block !== "object") {
    return block;
  }

  const nextBlock = { ...(block as Record<string, unknown>) };
  const content = nextBlock.content;
  if (isTableContent(content)) {
    nextBlock.content = {
      ...content,
      columnWidths: normalizeTableColumnWidths(content.columnWidths),
    };
  }

  if (Array.isArray(nextBlock.children)) {
    nextBlock.children = nextBlock.children.map((child) =>
      normalizeBlock(child),
    );
  }

  return nextBlock;
}

function isTableContent(
  content: unknown,
): content is { type: "tableContent"; columnWidths?: unknown } {
  return (
    Boolean(content) &&
    typeof content === "object" &&
    (content as { type?: unknown }).type === "tableContent"
  );
}

function normalizeTableColumnWidths(
  columnWidths: unknown,
): Array<number | undefined> {
  if (!Array.isArray(columnWidths)) {
    return [];
  }

  return columnWidths.map((width) =>
    typeof width === "number" && Number.isFinite(width) ? width : undefined,
  );
}

function toSerializableBlocks(blocks: any[]): PartialBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as PartialBlock[];
}

function triggerDocumentExitSave(
  nodeId: string,
  blocks: PartialBlock[],
): void {
  const headers = new Headers();
  headers.set("Content-Type", JSON_CONTENT_TYPE);

  const token = readSessionToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  void fetch(buildDocumentContentRequestUrl(nodeId), {
    method: "PUT",
    headers,
    body: JSON.stringify({ blocks }),
    keepalive: true,
  }).catch(() => undefined);
}

function useDocumentAssetUpload(
  nodeId: string,
  readOnly: boolean,
  rememberUploadedAsset: (assetPath: string, file: File) => string,
  onStateChange: (state: DocumentEditorState) => void,
  successStatus: DocumentEditorStatus,
  successMessage: string,
) {
  return useCallback(
    async (file: File) => {
      if (readOnly) {
        onStateChange({
          status: "readonly",
          message: ASSET_UPLOAD_READONLY_MESSAGE,
        });
        throw new Error(ASSET_UPLOAD_READONLY_MESSAGE);
      }

      onStateChange({
        status: "uploadingAsset",
        message: ASSET_UPLOAD_MESSAGE,
      });

      try {
        const assetPath = await uploadDocumentAsset(nodeId, file);
        rememberUploadedAsset(assetPath, file);
        onStateChange({
          status: successStatus,
          message: successMessage,
        });
        return assetPath;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : ASSET_UPLOAD_ERROR_MESSAGE;
        onStateChange({ status: "error", message });
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [
      nodeId,
      onStateChange,
      readOnly,
      rememberUploadedAsset,
      successMessage,
      successStatus,
    ],
  );
}

function useDocumentAssetResolver(nodeId: string) {
  const assetObjectUrlStore = useMemo(
    () => createDocumentAssetObjectUrlStore(nodeId),
    [nodeId],
  );

  useEffect(() => {
    return () => {
      assetObjectUrlStore.revokeAll();
    };
  }, [assetObjectUrlStore]);

  return assetObjectUrlStore;
}

function createDocumentPasteHandler() {
  return ({
    event,
    editor,
    defaultPasteHandler,
  }: {
    event: ClipboardEvent;
    editor: any;
    defaultPasteHandler: (context?: {
      prioritizeMarkdownOverHTML?: boolean;
      plainTextAsMarkdown?: boolean;
    }) => boolean | undefined;
  }) => {
    const clipboardHtml = event.clipboardData?.getData("text/html") ?? "";
    if (!clipboardHtml || !isEnterpriseClipboardHtml(clipboardHtml)) {
      return defaultPasteHandler();
    }

    const markdown = sanitizeEnterpriseClipboardHtmlToMarkdown(clipboardHtml);
    if (!markdown) {
      return true;
    }

    const parsedBlocks = editor.tryParseMarkdownToBlocks?.(markdown) ?? [];
    const normalizedBlocks = normalizeEnterpriseClipboardBlocks(parsedBlocks as any);
    const containsCustomBlocks = normalizedBlocks.some(
      (block) => block.type === "mermaid" || block.type === "procode",
    );

    if (containsCustomBlocks) {
      const selectionBlocks = editor.getSelection?.()?.blocks ?? [];
      if (selectionBlocks.length > 0) {
        editor.replaceBlocks?.(selectionBlocks, normalizedBlocks);
        return true;
      }

      const cursorBlock = editor.getTextCursorPosition?.()?.block;
      if (cursorBlock) {
        const isEmptyParagraph =
          cursorBlock.type === "paragraph" &&
          (cursorBlock.content === "" ||
            (Array.isArray(cursorBlock.content) &&
              cursorBlock.content.length === 0));

        if (isEmptyParagraph) {
          editor.replaceBlocks?.([cursorBlock], normalizedBlocks);
        } else {
          editor.insertBlocks?.(normalizedBlocks, cursorBlock, "after");
        }
        return true;
      }
    }

    editor.pasteMarkdown?.(markdown);
    return true;
  };
}

export function getDocumentSlashMenuItems(editor: any, query: string) {
  const defaultItems = getDefaultReactSlashMenuItems(editor).filter((item) =>
    MARKDOWN_SLASH_MENU_KEYS.has(String((item as { key?: string }).key ?? "")),
  );
  const mermaidItem = {
    title: "文本绘图（Mermaid）",
    subtext: "插入 Mermaid 文本绘图代码块",
    aliases: ["mermaid", "diagram", "flowchart", "文本绘图"],
    group: "Markdown 增强",
    icon: <FileCode2 size={18} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "mermaid",
        props: {
          code: "graph TD\n  A[开始] --> B[结束]",
          viewMode: "split"
        }
      } as any);
    },
  };

  const procodeItem = {
    title: "代码块",
    subtext: "插入代码块",
    aliases: ["code", "代码", "代码块"],
    group: "Markdown 增强",
    icon: <FileCode2 size={18} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "procode",
        props: {
          code: "",
          language: "plain"
        }
      } as any);
    },
  };

  return filterSuggestionItems([...defaultItems, mermaidItem, procodeItem], query);
}

export function DocumentEditor({
  nodeId,
  readOnly,
  saveRequestId,
  indexRequestId = 0,
  reconnectRequestId = 0,
  collab,
  onStateChange,
}: DocumentEditorProps) {
  if (collab) {
    return (
      <DocumentCollaborativeEditor
        key={collab.documentName}
        nodeId={nodeId}
        collab={collab}
        readOnly={readOnly}
        saveRequestId={saveRequestId}
        indexRequestId={indexRequestId}
        reconnectRequestId={reconnectRequestId}
        onStateChange={onStateChange}
      />
    );
  }

  return (
    <DocumentRestEditor
      nodeId={nodeId}
      readOnly={readOnly}
      saveRequestId={saveRequestId}
      indexRequestId={indexRequestId}
      onStateChange={onStateChange}
    />
  );
}

function DocumentRestEditor({
  nodeId,
  readOnly,
  saveRequestId,
  indexRequestId = 0,
  onStateChange,
}: DocumentEditorProps) {
  const [blocks, setBlocks] = useState<PartialBlock[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadContent = useCallback(async () => {
    setBlocks(null);
    setLoadError("");
    onStateChange({ status: "loading", message: "正在读取正文" });

    try {
      const snapshot = await apiClient.get<DocumentContentSnapshot>(
        buildDocumentContentEndpoint(nodeId),
      );
      setBlocks(normalizeBlocks(snapshot.blocks));
      onStateChange({
        status: readOnly ? "readonly" : "saved",
        message: readOnly ? "只读模式" : "已保存",
        updatedAt: snapshot.updatedAt,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "文档正文加载失败。";
      setLoadError(message);
      onStateChange({ status: "error", message });
    }
  }, [nodeId, onStateChange, readOnly]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadContent();
    });
  }, [loadContent]);

  if (loadError) {
    return (
      <div className="space-y-5 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--editor-surface)] text-[var(--danger)]">
          <AlertCircle size={22} strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">正文加载失败</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadContent()}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-text)] transition-colors hover:bg-[var(--brand-hover)]"
        >
          <RefreshCw size={15} strokeWidth={1.8} />
          重新加载
        </button>
      </div>
    );
  }

  if (!blocks) {
    return (
      <div className="flex min-h-[240px] items-center gap-3 text-sm font-semibold text-[var(--text-muted)]">
        <LoaderCircle size={18} strokeWidth={1.8} className="animate-spin" />
        正文加载中
      </div>
    );
  }

  return (
    <DocumentEditorSurface
      key={nodeId}
      nodeId={nodeId}
      initialBlocks={blocks}
      readOnly={readOnly}
      saveRequestId={saveRequestId}
      indexRequestId={indexRequestId}
      onStateChange={onStateChange}
    />
  );
}

function DocumentCollaborativeEditor({
  nodeId,
  collab,
  readOnly,
  saveRequestId,
  indexRequestId = 0,
  reconnectRequestId = 0,
  onStateChange,
}: DocumentCollaborativeEditorProps) {
  const collabPath = collab.path;
  const collabDocumentName = collab.documentName;
  const [session, setSession] = useState<DocumentCollabSession | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  // 协作连接超时后降级为离线 REST 编辑模式（拥有完整的撤销/恢复功能）
  const [fallbackToRest, setFallbackToRest] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const handledReconnectRequestRef = useRef(reconnectRequestId);

  useEffect(() => {
    if (reconnectRequestId === handledReconnectRequestRef.current) {
      return;
    }
    handledReconnectRequestRef.current = reconnectRequestId;
    if (reconnectRequestId > 0) {
      setConnectionAttempt((value) => value + 1);
    }
  }, [reconnectRequestId]);

  useEffect(() => {
    setSession(null);
    setConnectionError("");
    setFallbackToRest(false);
    setFallbackReason(null);
    onStateChange({
      status: "collabConnecting",
      message: COLLAB_STATUS_MESSAGE.collabConnecting,
    });

    let sessionToCleanup: DocumentCollabSession | null = null;
    let unbindStatus: (() => void) | null = null;
    let connected = false;
    let activated = false;

    const activateSession = (nextSession: DocumentCollabSession) => {
      if (activated) {
        return;
      }
      activated = true;
      setSession(nextSession);
    };

    try {
      const nextSession = createDocumentCollabSession({
        collab,
      });
      sessionToCleanup = nextSession;
      unbindStatus = bindDocumentCollabStatus(nextSession.provider, (status) => {
        if (status === "collabConnected" || status === "collabSynced") {
          connected = true;
          activateSession(nextSession);
        }
        onStateChange({
          status,
          message: COLLAB_STATUS_MESSAGE[status],
        });
      });

      const websocketStatus = (nextSession.provider as any)?.configuration?.websocketProvider?.status;
      const alreadySynced = Boolean((nextSession.provider as any)?.isSynced);
      if (alreadySynced) {
        connected = true;
        activateSession(nextSession);
        onStateChange({
          status: "collabSynced",
          message: COLLAB_STATUS_MESSAGE.collabSynced,
        });
      } else if (websocketStatus === "connected") {
        connected = true;
        activateSession(nextSession);
        onStateChange({
          status: "collabConnected",
          message: COLLAB_STATUS_MESSAGE.collabConnected,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "协作连接初始化失败。";
      setConnectionError(message);
      onStateChange({ status: "error", message });
    }

    // 协作连接超时检测：如果 5 秒内未成功连接，自动降级为离线 REST 编辑模式
    const fallbackTimer = setTimeout(() => {
      if (!connected && sessionToCleanup) {
        console.warn("[DocumentEditor] 协作连接超时，降级为离线编辑模式");
        unbindStatus?.();
        cleanupDocumentCollabSession(sessionToCleanup);
        sessionToCleanup = null;
        unbindStatus = null;
        setSession(null);
        setFallbackReason(
          "协作服务在 5 秒内未完成连接，无法确认实时同步状态。为避免阻塞编辑，系统已自动切换到本地编辑模式。",
        );
        setFallbackToRest(true);
      }
    }, COLLAB_CONNECTION_TIMEOUT_MS);

    return () => {
      clearTimeout(fallbackTimer);
      unbindStatus?.();
      if (sessionToCleanup) {
        cleanupDocumentCollabSession(sessionToCleanup);
      }
    };
  }, [collabDocumentName, collabPath, connectionAttempt, onStateChange]);

  // 协作连接超时后降级为 REST 编辑器（拥有完整的 Prosemirror History 撤销/恢复支持）
  if (fallbackToRest) {
    return (
      <div className="space-y-4 py-4">
        <div className="rounded-[var(--radius-base)] border border-[color:color-mix(in_srgb,var(--warning)_36%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_11%,var(--bg-card))] px-4 py-4 shadow-[var(--shadow-base)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]">
              <AlertCircle size={18} strokeWidth={1.9} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-semibold tracking-[0.01em] text-[var(--text-primary)]">
                已切换到本地编辑模式
              </p>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                {fallbackReason ?? "协作服务暂时不可用，已切换到本地编辑模式。"}
              </p>
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                你可以继续编辑并保存草稿，待协作服务恢复后，可点击上方“重连”重新进入在线协作。
              </p>
            </div>
          </div>
        </div>
        <DocumentRestEditor
          nodeId={nodeId}
          readOnly={readOnly}
          saveRequestId={saveRequestId}
          onStateChange={onStateChange}
        />
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="space-y-5 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-tile)] border border-[var(--border)] bg-[var(--editor-surface)] text-[var(--danger)]">
          <AlertCircle size={22} strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">协作连接失败</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{connectionError}</p>
        </div>
        <button
          type="button"
          onClick={() => setConnectionAttempt((value) => value + 1)}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-text)] transition-colors hover:bg-[var(--brand-hover)]"
        >
          <RefreshCw size={15} strokeWidth={1.8} />
          重新连接
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[240px] items-center gap-3 text-sm font-semibold text-[var(--text-muted)]">
        <LoaderCircle size={18} strokeWidth={1.8} className="animate-spin" />
        协作连接中
      </div>
    );
  }

  return (
    <DocumentCollaborativeEditorSurface
      key={collabDocumentName}
      nodeId={nodeId}
      session={session}
      readOnly={readOnly}
      indexRequestId={indexRequestId}
      onStateChange={onStateChange}
    />
  );
}

function DocumentCollaborativeEditorSurface({
  nodeId,
  session,
  readOnly,
  indexRequestId = 0,
  onStateChange,
}: DocumentCollaborativeEditorSurfaceProps) {
  const assetStore = useDocumentAssetResolver(nodeId);
  const uploadFile = useDocumentAssetUpload(
    nodeId,
    readOnly,
    assetStore.rememberUploadedAsset,
    onStateChange,
    "collabSyncing",
    COLLAB_STATUS_MESSAGE.collabSyncing,
  );
  const editor = useCreateBlockNote(
    {
      dictionary: zh,
      uploadFile,
      resolveFileUrl: assetStore.resolveFileUrl,
      pasteHandler: createDocumentPasteHandler(),
      schema,
      extensions: BLOCKNOTE_EXTENSIONS,
      collaboration: {
        provider: session.provider,
        fragment: session.fragment,
        user: session.user,
        showCursorLabels: "activity",
      },
    },
    [assetStore, session, uploadFile],
  );
  const [indexing, setIndexing] = useState(false);
  const handledIndexRequestRef = useRef(indexRequestId);
  const hasLocalChangesRef = useRef(false);
  const exitSaveTriggeredRef = useRef(false);

  const triggerExitSave = useCallback(() => {
    if (
      readOnly ||
      exitSaveTriggeredRef.current ||
      !hasLocalChangesRef.current
    ) {
      return;
    }

    exitSaveTriggeredRef.current = true;
    hasLocalChangesRef.current = false;
    session.provider.forceSync();
    triggerDocumentExitSave(
      nodeId,
      toSerializableBlocks(editor.document),
    );
  }, [editor, nodeId, readOnly, session]);

  const indexContent = useCallback(async () => {
    if (readOnly || indexing) {
      return;
    }

    setIndexing(true);
    onStateChange({ status: "saving", message: "正在更新索引" });
    try {
      const result = await apiClient.request<DocumentIndexResult>(
        buildDocumentIndexEndpoint(nodeId),
        { method: "POST" },
      );
      onStateChange({
        status: "saved",
        message: "索引已更新",
        updatedAt: result.lastIndexedAt ?? undefined,
      });
    } catch (error: unknown) {
      onStateChange({
        status: "error",
        message: error instanceof Error ? error.message : "索引更新失败。",
      });
    } finally {
      setIndexing(false);
    }
  }, [indexing, nodeId, onStateChange, readOnly]);

  useEffect(() => {
    if (indexRequestId === handledIndexRequestRef.current) {
      return;
    }
    handledIndexRequestRef.current = indexRequestId;
    if (indexRequestId > 0) {
      void indexContent();
    }
  }, [indexContent, indexRequestId]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    const handlePageHide = () => {
      triggerExitSave();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      triggerExitSave();
    };
  }, [readOnly, triggerExitSave]);

  // 简单标志位方案：Ctrl+A 置标记 → Backspace/Delete 清空编辑器 → 其他操作重置标记
  const selectAllFlagRef = useRef(false);

  useEffect(() => {
    if (readOnly) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Ctrl+A / Cmd+A
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        selectAllFlagRef.current = true;
        return;
      }

      // 当标志位为 true 时，Backspace/Delete 清空整个编辑器
      if (selectAllFlagRef.current && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectAllFlagRef.current = false;
        editor.replaceBlocks(editor.document, [{ type: "paragraph" as const }]);
        editor.focus();
        return;
      }

      // 任何其他按键操作，重置标志
      selectAllFlagRef.current = false;
    };

    const handleMouseDown = () => {
      selectAllFlagRef.current = false;
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [editor, readOnly]);

  const CustomSideMenu = useCallback(
    (props: any) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const block = useExtensionState(SideMenuExtension, {
        editor,
        selector: (state) => state?.block,
      });

      return (
        <SideMenu {...props}>
          <button
            className="bn-button p-1 hover:bg-[var(--brand-muted)] text-[var(--text-secondary)] hover:text-[var(--brand)] transition-colors rounded-md"
            onClick={() => {
              if (!block) return;
              editor.focus();
              
              const isBlockEmpty =
                !block.content ||
                (Array.isArray(block.content) && block.content.length === 0) ||
                (typeof block.content === "string" && block.content === "");
              
              if (!isBlockEmpty) {
                const insertedBlock = editor.insertBlocks(
                  [{ type: "paragraph", content: "" }],
                  block,
                  "after",
                )[0];
                editor.setTextCursorPosition(insertedBlock);
              }
              
              // 使用 execCommand 模拟原生输入，以确保触发 SuggestionMenu 的监听器
              document.execCommand("insertText", false, "/");
            }}
            title="添加块"
          >
            <Plus size={20} />
          </button>
          <DragHandleButton dragHandleMenu={props.dragHandleMenu} />
        </SideMenu>
      );
    },
    [editor],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full w-full">
      <DocumentToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto min-h-0 w-full">
        <BlockNoteView
          className="ov-document-editor"
          data-testid="document-blocknote-editor"
          editor={editor}
          editable={!readOnly}
          slashMenu={false}
          onChange={() => {
            if (!readOnly) {
              hasLocalChangesRef.current = true;
              onStateChange({
                status: "collabSyncing",
                message: COLLAB_STATUS_MESSAGE.collabSyncing,
              });
            }
          }}
          theme={BLOCKNOTE_THEME}
        >
          <SideMenuController sideMenu={CustomSideMenu} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => getDocumentSlashMenuItems(editor, query)}
            shouldOpen={(state) =>
              !state.selection.$from.parent.type.isInGroup("tableContent")
            }
          />
        </BlockNoteView>
      </div>
    </div>
  );
}

function DocumentEditorSurface({
  nodeId,
  initialBlocks,
  readOnly,
  saveRequestId,
  indexRequestId = 0,
  onStateChange,
}: DocumentEditorSurfaceProps) {
  const handledSaveRequestRef = useRef(saveRequestId);
  const handledIndexRequestRef = useRef(indexRequestId);
  const hasLocalChangesRef = useRef(false);
  const exitSaveTriggeredRef = useRef(false);
  const assetStore = useDocumentAssetResolver(nodeId);
  const uploadFile = useDocumentAssetUpload(
    nodeId,
    readOnly,
    assetStore.rememberUploadedAsset,
    onStateChange,
    "dirty",
    ASSET_UPLOAD_DIRTY_MESSAGE,
  );
  const editor = useCreateBlockNote(
    {
      initialContent: initialBlocks,
      dictionary: zh,
      uploadFile,
      resolveFileUrl: assetStore.resolveFileUrl,
      pasteHandler: createDocumentPasteHandler(),
      schema,
      extensions: BLOCKNOTE_EXTENSIONS,
    },
    [assetStore, initialBlocks, uploadFile],
  );
  const [indexing, setIndexing] = useState(false);

  const saveContent = useCallback(async () => {
    if (readOnly) {
      onStateChange({ status: "readonly", message: "只读模式" });
      return;
    }

    onStateChange({ status: "saving", message: "保存中" });
    try {
      const result = await apiClient.request<DocumentSaveResult>(
        buildDocumentContentEndpoint(nodeId),
        {
          method: "PUT",
          body: JSON.stringify({
            blocks: toSerializableBlocks(editor.document),
          }),
        },
      );
      onStateChange({
        status: "saved",
        message: "已保存",
        updatedAt: result.updatedAt,
      });
      hasLocalChangesRef.current = false;
      exitSaveTriggeredRef.current = false;
    } catch (error: unknown) {
      onStateChange({
        status: "error",
        message: error instanceof Error ? error.message : "文档保存失败。",
      });
    }
  }, [editor, nodeId, onStateChange, readOnly]);

  const triggerExitSave = useCallback(() => {
    if (
      readOnly ||
      exitSaveTriggeredRef.current ||
      !hasLocalChangesRef.current
    ) {
      return;
    }

    exitSaveTriggeredRef.current = true;
    hasLocalChangesRef.current = false;
    triggerDocumentExitSave(
      nodeId,
      toSerializableBlocks(editor.document),
    );
  }, [editor, nodeId, readOnly]);

  const indexContent = useCallback(async () => {
    if (readOnly || indexing) {
      return;
    }

    setIndexing(true);
    await saveContent();
    onStateChange({ status: "saving", message: "正在更新索引" });
    try {
      const result = await apiClient.request<DocumentIndexResult>(
        buildDocumentIndexEndpoint(nodeId),
        { method: "POST" },
      );
      onStateChange({
        status: "saved",
        message: "索引已更新",
        updatedAt: result.lastIndexedAt ?? undefined,
      });
    } catch (error: unknown) {
      onStateChange({
        status: "error",
        message: error instanceof Error ? error.message : "索引更新失败。",
      });
    } finally {
      setIndexing(false);
    }
  }, [indexing, nodeId, onStateChange, readOnly, saveContent]);

  useEffect(() => {
    if (saveRequestId === handledSaveRequestRef.current) {
      return;
    }
    handledSaveRequestRef.current = saveRequestId;
    if (saveRequestId > 0) {
      void saveContent();
    }
  }, [saveContent, saveRequestId]);

  useEffect(() => {
    if (indexRequestId === handledIndexRequestRef.current) {
      return;
    }
    handledIndexRequestRef.current = indexRequestId;
    if (indexRequestId > 0) {
      void indexContent();
    }
  }, [indexContent, indexRequestId]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    const handlePageHide = () => {
      triggerExitSave();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      triggerExitSave();
    };
  }, [readOnly, triggerExitSave]);

  // 简单标志位方案：Ctrl+A 置标记 → Backspace/Delete 清空编辑器 → 其他操作重置标记
  const selectAllFlagRef = useRef(false);

  useEffect(() => {
    if (readOnly) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 检测 Ctrl+A / Cmd+A
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        selectAllFlagRef.current = true;
        return;
      }

      // 当标志位为 true 时，Backspace/Delete 清空整个编辑器
      if (selectAllFlagRef.current && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectAllFlagRef.current = false;
        editor.replaceBlocks(editor.document, [{ type: "paragraph" as const }]);
        editor.focus();
        return;
      }

      // 任何其他按键操作，重置标志
      selectAllFlagRef.current = false;
    };

    const handleMouseDown = () => {
      selectAllFlagRef.current = false;
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [editor, readOnly]);

  const CustomSideMenu = useCallback(
    (props: any) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const block = useExtensionState(SideMenuExtension, {
        editor,
        selector: (state) => state?.block,
      });

      return (
        <SideMenu {...props}>
          <button
            className="bn-button p-1 hover:bg-[var(--brand-muted)] text-[var(--text-secondary)] hover:text-[var(--brand)] transition-colors rounded-md"
            onClick={() => {
              if (!block) return;
              editor.focus();
              
              const isBlockEmpty =
                !block.content ||
                (Array.isArray(block.content) && block.content.length === 0) ||
                (typeof block.content === "string" && block.content === "");
              
              if (!isBlockEmpty) {
                const insertedBlock = editor.insertBlocks(
                  [{ type: "paragraph", content: "" }],
                  block,
                  "after",
                )[0];
                editor.setTextCursorPosition(insertedBlock);
              }
              
              // 使用 execCommand 模拟原生输入，以确保触发 SuggestionMenu 的监听器
              document.execCommand("insertText", false, "/");
            }}
            title="添加块"
          >
            <Plus size={20} />
          </button>
          <DragHandleButton dragHandleMenu={props.dragHandleMenu} />
        </SideMenu>
      );
    },
    [editor],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full w-full">
      <DocumentToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto min-h-0 w-full">
        <BlockNoteView
          className="ov-document-editor"
          data-testid="document-blocknote-editor"
          editor={editor}
          editable={!readOnly}
          slashMenu={false}
          onChange={() => {
            if (!readOnly) {
              hasLocalChangesRef.current = true;
              onStateChange({ status: "dirty", message: "未保存" });
            }
          }}
          theme={BLOCKNOTE_THEME}
        >
          <SideMenuController sideMenu={CustomSideMenu} />
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => getDocumentSlashMenuItems(editor, query)}
            shouldOpen={(state) =>
              !state.selection.$from.parent.type.isInGroup("tableContent")
            }
          />
        </BlockNoteView>
      </div>
    </div>
  );
}
