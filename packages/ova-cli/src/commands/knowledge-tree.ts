import { callApi } from "../api";
import type { CredentialStore } from "../state-store";
import { readProfile } from "../state-store";
import { emitOutput, resolveOutputMode } from "../output";

const CAPABILITY_API_BASE = "/api/v1/capability";
const KNOWLEDGE_BASES_API = `${CAPABILITY_API_BASE}/knowledge-bases`;
const KNOWLEDGE_TREE_API = `${CAPABILITY_API_BASE}/knowledge-tree`;

export async function handleKnowledgeTree(
  command: string,
  options: Record<string, string | boolean>,
  store: CredentialStore,
) {
  const output = resolveOutputMode(options);
  const { profileName } = readProfile(store, options);
  const isDetail = command === "detail";
  const isDelete = command === "delete";
  const nodeId = String(options.id ?? "");
  if ((isDetail || isDelete) && !nodeId) {
    throw new Error("知识树命令必须提供 --id <nodeId>。");
  }
  const response = await callApi(
    isDetail || isDelete
      ? `${KNOWLEDGE_TREE_API}/${encodeURIComponent(nodeId)}`
      : `${KNOWLEDGE_BASES_API}/${encodeURIComponent(String(options.kb ?? options.kbId ?? ""))}/tree`,
    isDelete ? { method: "DELETE" } : {},
    options,
    store,
  );
  const data = response.data as Record<string, unknown>;
  const items =
    isDetail || isDelete
      ? [data.item as Record<string, unknown>]
      : ((data.items ?? []) as Array<Record<string, unknown>>);

  emitOutput(
    output,
    response,
    () =>
      [
        `traceId: ${String(response.traceId ?? "")}`,
        ...items.map(
          (item) =>
            `${String(item.id)} ${String(item.name)} ${String(item.vikingUri ?? "")}`,
        ),
      ].join("\n"),
    items.map((item) => ({
      profile: profileName,
      traceId: response.traceId,
      ...item,
    })),
  );
}
