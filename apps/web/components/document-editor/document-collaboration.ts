"use client";

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { readSessionToken, readSessionUser } from "@/lib/session";

export type DocumentCollabStatus =
  | "collabConnecting"
  | "collabConnected"
  | "collabSyncing"
  | "collabSynced"
  | "collabDisconnected"
  | "error";

export interface DocumentCollabConfig {
  path: string;
  documentName: string;
  serverUrl?: string;
}

export interface DocumentCollabUser {
  name: string;
  color: string;
}

export type DocumentCollabProvider = HocuspocusProvider & {
  awareness: NonNullable<HocuspocusProvider["awareness"]>;
};

export interface DocumentCollabSession {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  provider: DocumentCollabProvider;
  user: DocumentCollabUser;
  serverUrl: string;
}

interface CreateDocumentCollabSessionOptions {
  collab: DocumentCollabConfig;
  origin?: string;
  token?: string | null;
  user?: DocumentCollabUser;
}

type ProviderStatusEvent = {
  status: "connected" | "disconnected" | "connecting";
};

type ProviderSyncedEvent = {
  state: boolean;
};

const DOCUMENT_YJS_FRAGMENT_NAME = "document-store";
const DEFAULT_COLLAB_USER_NAME = "我";
const URL_PATH_SEPARATOR = "/";
const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const WS_PROTOCOL = "ws:";
const WSS_PROTOCOL = "wss:";
const HASH_MULTIPLIER = 31;
const COLLAB_CURSOR_COLORS = [
  "var(--collab-cursor-1)",
  "var(--collab-cursor-2)",
  "var(--collab-cursor-3)",
  "var(--collab-cursor-4)",
  "var(--collab-cursor-5)",
  "var(--collab-cursor-6)",
] as const;

export { DOCUMENT_YJS_FRAGMENT_NAME };

function normalizeCollabPath(path: string): string {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return URL_PATH_SEPARATOR;
  }
  return trimmedPath.startsWith(URL_PATH_SEPARATOR)
    ? trimmedPath
    : `${URL_PATH_SEPARATOR}${trimmedPath}`;
}

function resolveWebsocketProtocol(protocol: string): string {
  if (protocol === HTTPS_PROTOCOL) {
    return WSS_PROTOCOL;
  }
  if (protocol === HTTP_PROTOCOL) {
    return WS_PROTOCOL;
  }
  return WS_PROTOCOL;
}

function readBrowserOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("当前环境无法建立协作连接。");
  }
  return window.location.origin;
}

export function buildDocumentCollabServerUrl(
  collabPath: string,
  origin = readBrowserOrigin(),
): string {
  const url = new URL(origin);
  url.protocol = resolveWebsocketProtocol(url.protocol);
  url.pathname = normalizeCollabPath(collabPath);
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function selectDocumentCollabCursorColor(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * HASH_MULTIPLIER + char.charCodeAt(0)) >>> 0;
  }
  return COLLAB_CURSOR_COLORS[hash % COLLAB_CURSOR_COLORS.length];
}

export function readDocumentCollabUser(seed: string): DocumentCollabUser {
  const sessionUser = readSessionUser();
  const name = sessionUser?.username?.trim() || DEFAULT_COLLAB_USER_NAME;
  const colorSeed = sessionUser?.id || sessionUser?.username || seed;
  return {
    name,
    color: selectDocumentCollabCursorColor(colorSeed),
  };
}

export function createDocumentCollabSession({
  collab,
  origin,
  token = readSessionToken(),
  user = readDocumentCollabUser(collab.documentName),
}: CreateDocumentCollabSessionOptions): DocumentCollabSession {
  if (!token) {
    throw new Error("登录状态已失效，请重新登录后继续编辑。");
  }
  if (!collab.serverUrl?.trim()) {
    throw new Error("协作服务地址缺失，请刷新页面后重试。");
  }

  const doc = new Y.Doc();
  const serverUrl = collab.serverUrl.trim();
  const provider = new HocuspocusProvider({
    url: serverUrl,
    name: collab.documentName,
    document: doc,
    token,
  }) as DocumentCollabProvider;

  return {
    doc,
    provider,
    serverUrl,
    user,
    fragment: doc.getXmlFragment(DOCUMENT_YJS_FRAGMENT_NAME),
  };
}

export function cleanupDocumentCollabSession(session: DocumentCollabSession): void {
  session.provider.disconnect();
  session.provider.destroy();
  session.doc.destroy();
}

export function bindDocumentCollabStatus(
  provider: DocumentCollabProvider,
  onStatusChange: (status: DocumentCollabStatus) => void,
): () => void {
  const handleStatus = (event: ProviderStatusEvent) => {
    if (event.status === "connecting") {
      onStatusChange("collabConnecting");
      return;
    }
    if (event.status === "connected") {
      onStatusChange("collabConnected");
      return;
    }
    onStatusChange("collabDisconnected");
  };
  const handleSynced = (event: ProviderSyncedEvent) => {
    onStatusChange(event.state ? "collabSynced" : "collabSyncing");
  };
  const handleDisconnected = () => {
    onStatusChange("collabDisconnected");
  };
  const handleAuthenticationFailed = () => {
    onStatusChange("error");
  };

  provider.on("status", handleStatus);
  provider.on("synced", handleSynced);
  provider.on("disconnect", handleDisconnected);
  provider.on("close", handleDisconnected);
  provider.on("authenticationFailed", handleAuthenticationFailed);

  return () => {
    provider.off("status", handleStatus);
    provider.off("synced", handleSynced);
    provider.off("disconnect", handleDisconnected);
    provider.off("close", handleDisconnected);
    provider.off("authenticationFailed", handleAuthenticationFailed);
  };
}
