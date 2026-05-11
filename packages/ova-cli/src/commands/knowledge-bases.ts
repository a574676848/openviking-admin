import { callApi } from "../api";
import type { CredentialStore } from "../state-store";
import { readProfile } from "../state-store";
import { emitOutput, resolveOutputMode } from "../output";

const CAPABILITY_API_BASE = "/api/v1/capability";
const KNOWLEDGE_BASES_API = `${CAPABILITY_API_BASE}/knowledge-bases`;

export async function handleKnowledgeBases(
  command: string,
  options: Record<string, string | boolean>,
  store: CredentialStore,
) {
  const output = resolveOutputMode(options);
  const { profileName } = readProfile(store, options);
  const response = await callApi(
    command === "detail"
      ? `${KNOWLEDGE_BASES_API}/${encodeURIComponent(String(options.id ?? ""))}`
      : KNOWLEDGE_BASES_API,
    {},
    options,
    store,
  );
  const data = response.data as Record<string, unknown>;
  const items =
    command === "detail"
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
            `${String(item.id)} ${String(item.name)} ${String(item.status)}`,
        ),
      ].join("\n"),
    items.map((item) => ({
      profile: profileName,
      traceId: response.traceId,
      ...item,
    })),
  );
}
