import { callApi, uploadMultipartApi } from "../api";
import type { CredentialStore } from "../state-store";
import { emitOutput, resolveOutputMode } from "../output";
import { readFileSync } from "fs";

const CAPABILITY_API_BASE = "/api/v1/capability";
const IMPORT_TASKS_API = `${CAPABILITY_API_BASE}/import-tasks`;

export async function handleDocuments(
  command: string | undefined,
  options: Record<string, string | boolean>,
  store: CredentialStore,
) {
  const output = resolveOutputMode(options);
  if (command !== "import") {
    if (command === "index") {
      await handleDocumentIndex(options, store, output);
      return;
    }
    if (command === "draft") {
      await handleDocumentDraft(options, store, output);
      return;
    }
    throw new Error("未知 documents 命令，请使用 ova documents import、index 或 draft");
  }

  const action =
    typeof options._ === "string"
      ? options._
      : String(options.action ?? "create");
  if (
    !options.source &&
    !options.url &&
    options.value &&
    !["status", "list", "cancel", "retry"].includes(action)
  ) {
    options.source = options.value;
  }
  if (
    !options.source &&
    !options.url &&
    typeof options._ === "string" &&
    !["status", "list", "cancel", "retry"].includes(action)
  ) {
    options.source = options._;
  }
  if (action === "status") {
    await emitStatus(options, store, output);
    return;
  }
  if (action === "list") {
    const response = await callApi(IMPORT_TASKS_API, {}, options, store);
    const items = ((response.data as Record<string, unknown>).items ??
      []) as Array<Record<string, unknown>>;
    emitOutput(
      output,
      response,
      () =>
        [
          `traceId: ${String(response.traceId ?? "")}`,
          ...items.map(formatTask),
        ].join("\n"),
      items,
    );
    return;
  }
  if (action === "cancel" || action === "retry") {
    const response = await callApi(
      `${IMPORT_TASKS_API}/${encodeURIComponent(String(options.task ?? options.taskId ?? ""))}/${action}`,
      { method: "POST" },
      options,
      store,
    );
    emitOutput(
      output,
      response,
      () =>
        formatTask(
          (response.data as Record<string, unknown>).item as Record<
            string,
            unknown
          >,
        ),
      [response.data as Record<string, unknown>],
    );
    return;
  }

  const sourceType = String(options.sourceType ?? options.type ?? "url");
  if (sourceType === "local") {
    await uploadLocalDocument(options, store, output);
    return;
  }

  const response = await callApi(
    `${IMPORT_TASKS_API}/documents`,
    {
      method: "POST",
      body: JSON.stringify({
        sourceType,
        knowledgeBaseId: options.kb ?? options.knowledgeBaseId,
        parentNodeId: options.parent ?? options.parentNodeId,
        sourceUrl: options.source ?? options.url,
        sourceName: options.sourceName ?? options.name,
        sourceUrls: options.sources
          ? String(options.sources).split(",")
          : undefined,
        sourceNames: (options.sourceNames ?? options.names)
          ? String(options.sourceNames ?? options.names).split(",")
          : undefined,
      }),
    },
    options,
    store,
  );
  emitOutput(
    output,
    response,
    () =>
      formatTask(
        (response.data as Record<string, unknown>).item as Record<
          string,
          unknown
        >,
      ),
    [response.data as Record<string, unknown>],
  );
}

async function handleDocumentIndex(
  options: Record<string, string | boolean>,
  store: CredentialStore,
  output: ReturnType<typeof resolveOutputMode>,
) {
  const action =
    typeof options._ === "string"
      ? options._
      : String(options.action ?? "status");
  const nodeId = String(options.node ?? options.nodeId ?? options.id ?? "");
  if (!nodeId) {
    throw new Error("文档索引命令必须提供 --node <nodeId>。");
  }

  const response = await callApi(
    `${CAPABILITY_API_BASE}/documents/${encodeURIComponent(nodeId)}/index${action === "rebuild" ? "/rebuild" : ""}`,
    { method: action === "rebuild" ? "POST" : "GET" },
    options,
    store,
  );
  const item = (response.data as Record<string, unknown>).item as Record<
    string,
    unknown
  >;
  emitOutput(
    output,
    response,
    () =>
      [
        `traceId: ${String(response.traceId ?? "")}`,
        `${String(item.nodeId)} ${String(item.indexStatus)} draft=${String(item.draftVersion)} indexed=${String(item.indexedVersion)} vectors=${String(item.vectorCount ?? "-")}`,
      ].join("\n"),
    [item],
  );
}

async function handleDocumentDraft(
  options: Record<string, string | boolean>,
  store: CredentialStore,
  output: ReturnType<typeof resolveOutputMode>,
) {
  const action =
    typeof options._ === "string"
      ? options._
      : String(options.action ?? "grep");
  if (action !== "grep") {
    throw new Error("未知 documents draft 命令，请使用 ova documents draft grep");
  }
  await handleDocumentDraftGrep(options, store, output);
}

async function handleDocumentDraftGrep(
  options: Record<string, string | boolean>,
  store: CredentialStore,
  output: ReturnType<typeof resolveOutputMode>,
) {
  const nodeId = String(options.node ?? options.nodeId ?? options.id ?? "");
  const pattern = String(options.pattern ?? options.query ?? options.value ?? "");
  if (!nodeId) {
    throw new Error("文档草稿 grep 命令必须提供 --node <nodeId>。");
  }
  if (!pattern) {
    throw new Error("文档草稿 grep 命令必须提供 --pattern <keyword>。");
  }

  const response = await callApi(
    `${CAPABILITY_API_BASE}/documents/${encodeURIComponent(nodeId)}/draft/grep`,
    {
      method: "POST",
      body: JSON.stringify({
        pattern,
        caseInsensitive:
          options["case-insensitive"] === undefined
            ? undefined
            : options["case-insensitive"] === "true",
      }),
    },
    options,
    store,
  );
  const items = ((response.data as Record<string, unknown>).items ?? []) as Array<
    Record<string, unknown>
  >;
  emitOutput(
    output,
    response,
    () =>
      [
        `traceId: ${String(response.traceId ?? "")}`,
        ...items.map((item) => `L${String(item.line)} ${String(item.nodeId)}\n  ${String(item.content)}`),
      ].join("\n"),
    items,
  );
}

async function uploadLocalDocument(
  options: Record<string, string | boolean>,
  store: CredentialStore,
  output: ReturnType<typeof resolveOutputMode>,
) {
  const filePath = String(options.source ?? options.url ?? "");
  if (!filePath) {
    throw new Error("本地导入必须提供 Markdown 文件路径。");
  }

  const fileName = String(options.sourceName ?? options.name ?? extractFileName(filePath));
  const file = new File([readFileSync(filePath)], fileName, {
    type: "text/markdown",
  });
  const body = new FormData();
  body.set("kbId", String(options.kb ?? options.knowledgeBaseId ?? ""));
  if (!body.get("kbId")) {
    throw new Error("本地导入必须提供知识库 ID。");
  }

  const targetUri = await resolveParentTargetUri(options, store);
  if (targetUri) {
    body.set("targetUri", targetUri);
  }
  body.append("files", file);

  const response = await uploadMultipartApi(
    "/api/v1/import-tasks/local-upload",
    body,
    options,
    store,
  );
  emitOutput(
    output,
    response,
    () => JSON.stringify(response.data ?? response, null, 2),
    [response.data as Record<string, unknown>],
  );
}

async function resolveParentTargetUri(
  options: Record<string, string | boolean>,
  store: CredentialStore,
) {
  const parentNodeId = String(options.parent ?? options.parentNodeId ?? "");
  if (!parentNodeId) {
    return "";
  }

  const response = await callApi(
    `${CAPABILITY_API_BASE}/knowledge-tree/${encodeURIComponent(parentNodeId)}`,
    {},
    options,
    store,
  );
  const data = response.data as Record<string, unknown>;
  const item = data.item as Record<string, unknown> | undefined;
  return String(item?.vikingUri ?? "");
}

function extractFileName(filePath: string) {
  return filePath.replace(/\\/g, "/").split("/").at(-1) ?? "document.md";
}

async function emitStatus(
  options: Record<string, string | boolean>,
  store: CredentialStore,
  output: ReturnType<typeof resolveOutputMode>,
) {
  const taskId = encodeURIComponent(
    String(options.task ?? options.taskId ?? ""),
  );
  const response = await callApi(
    `${IMPORT_TASKS_API}/${taskId}`,
    {},
    options,
    store,
  );
  emitOutput(
    output,
    response,
    () => {
      const data = response.data as Record<string, unknown>;
      return [
        `traceId: ${String(response.traceId ?? "")}`,
        `${String(data.taskId)} ${String(data.status)} ${String(data.progress)}%`,
      ].join("\n");
    },
    [response.data as Record<string, unknown>],
  );
}

function formatTask(task: Record<string, unknown> | null | undefined) {
  if (!task) return "无任务";
  return `${String(task.id)} ${String(task.status)} ${String(task.sourceType)} -> ${String(task.targetUri)}`;
}
