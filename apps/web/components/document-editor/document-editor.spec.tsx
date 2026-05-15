import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocumentEditor,
  getDocumentSlashMenuItems,
  type DocumentEditorStatus,
} from "./document-editor";
import {
  isEnterpriseClipboardHtml,
  sanitizeEnterpriseClipboardHtmlToMarkdown,
} from "./document-paste";

const getMock = vi.fn();
const requestMock = vi.fn();
const stateMock = vi.fn();
const {
  bindDocumentCollabStatusMock,
  blockNoteEditorMock,
  cleanupDocumentCollabSessionMock,
  collabSessionMock,
  createDocumentAssetObjectUrlStoreMock,
  createDocumentCollabSessionMock,
  documentAssetRememberUploadedAssetMock,
  documentAssetResolveFileUrlMock,
  documentAssetRevokeAllMock,
  unbindDocumentCollabStatusMock,
  uploadDocumentAssetMock,
  useCreateBlockNoteMock,
} = vi.hoisted(() => ({
  bindDocumentCollabStatusMock: vi.fn(),
  blockNoteEditorMock: {
    document: [
      {
        id: "saved-block",
        type: "paragraph",
        content: [{ type: "text", text: "保存内容", styles: {} }],
        children: [],
      },
    ],
    getSelection: vi.fn(),
    getTextCursorPosition: vi.fn(),
    insertBlocks: vi.fn(),
    replaceBlocks: vi.fn(),
    tryParseMarkdownToBlocks: vi.fn(),
  } as any,
  cleanupDocumentCollabSessionMock: vi.fn(),
  collabSessionMock: {
    doc: { id: "mock-doc" },
    fragment: { name: "document-store" },
    provider: { awareness: {} },
    serverUrl: "ws://localhost:6002/collab",
    user: { name: "张三", color: "var(--collab-cursor-1)" },
  },
  createDocumentAssetObjectUrlStoreMock: vi.fn(),
  createDocumentCollabSessionMock: vi.fn(),
  documentAssetRememberUploadedAssetMock: vi.fn(),
  documentAssetResolveFileUrlMock: vi.fn(),
  documentAssetRevokeAllMock: vi.fn(),
  unbindDocumentCollabStatusMock: vi.fn(),
  uploadDocumentAssetMock: vi.fn(),
  useCreateBlockNoteMock: vi.fn(),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: (...args: unknown[]) => useCreateBlockNoteMock(...args),
  SuggestionMenuController: () => null,
  SideMenuController: () => null,
  SideMenu: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  DragHandleButton: () => null,
  useExtensionState: vi.fn(() => null),
  getDefaultReactSlashMenuItems: vi.fn((editor: any) => editor.__slashItems ?? []),
  createReactBlockSpec: vi.fn((config: any, impl: any) => () => ({ config, implementation: impl })),
}));

const insertOrUpdateBlockForSlashMenuMock = vi.fn();

vi.mock("@blocknote/core/extensions", () => ({
  filterSuggestionItems: (items: any[], query: string) =>
    items.filter((item) =>
      String(item.title ?? "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  insertOrUpdateBlockForSlashMenu: (...args: unknown[]) =>
    insertOrUpdateBlockForSlashMenuMock(...args),
}));

vi.mock("./document-assets", () => ({
  createDocumentAssetObjectUrlStore: (...args: unknown[]) =>
    createDocumentAssetObjectUrlStoreMock(...args),
  uploadDocumentAsset: (...args: unknown[]) => uploadDocumentAssetMock(...args),
}));

vi.mock("./document-collaboration", () => ({
  bindDocumentCollabStatus: (...args: unknown[]) =>
    bindDocumentCollabStatusMock(...args),
  cleanupDocumentCollabSession: (...args: unknown[]) =>
    cleanupDocumentCollabSessionMock(...args),
  createDocumentCollabSession: (...args: unknown[]) =>
    createDocumentCollabSessionMock(...args),
}));

vi.mock("@blocknote/mantine", () => ({
  BlockNoteView: ({
    editable,
    onChange,
    slashMenu,
    children,
  }: {
    editable?: boolean;
    onChange?: () => void;
    slashMenu?: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      aria-label="BlockNote 编辑器"
      data-editable={String(editable)}
      data-slash-menu={String(slashMenu)}
    >
      <button type="button" onClick={onChange}>
        模拟编辑
      </button>
      {children}
    </div>
  ),
}));

let container: HTMLDivElement;
let root: Root | null;

function createImageFile(name = "截图.png", type = "image/png"): File {
  return new File([new Uint8Array([1])], name, { type });
}

function readLatestBlockNoteOptions() {
  const calls = useCreateBlockNoteMock.mock.calls;
  return calls.at(-1)?.[0] as
    | {
        initialContent?: unknown[];
        pasteHandler?: (context: {
          event: ClipboardEvent;
          editor: any;
          defaultPasteHandler: () => boolean | undefined;
        }) => boolean | undefined;
        resolveFileUrl?: (assetPath: string) => Promise<string>;
        uploadFile?: (file: File) => Promise<string>;
      }
    | undefined;
}

function createNode(
  saveRequestId: number,
  readOnly = false,
  collab?: { path: string; documentName: string },
) {
  return (
    <DocumentEditor
      nodeId="node-doc"
      readOnly={readOnly}
      saveRequestId={saveRequestId}
      collab={collab}
      onStateChange={stateMock}
    />
  );
}

async function renderEditor(
  saveRequestId = 0,
  readOnly = false,
  collab?: { path: string; documentName: string },
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createNode(saveRequestId, readOnly, collab));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function rerenderEditor(
  saveRequestId: number,
  readOnly = false,
  collab?: { path: string; documentName: string },
) {
  await act(async () => {
    root?.render(createNode(saveRequestId, readOnly, collab));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function triggerCollabStatus(status: DocumentEditorStatus) {
  const statusHandler = bindDocumentCollabStatusMock.mock.calls.at(-1)?.[1] as
    | ((status: DocumentEditorStatus) => void)
    | undefined;
  await act(async () => {
    statusHandler?.(status);
    await Promise.resolve();
  });
}

describe("DocumentEditor", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    requestMock.mockReset();
    stateMock.mockReset();
    bindDocumentCollabStatusMock.mockReset();
    bindDocumentCollabStatusMock.mockReturnValue(unbindDocumentCollabStatusMock);
    cleanupDocumentCollabSessionMock.mockReset();
    createDocumentAssetObjectUrlStoreMock.mockReset();
    createDocumentAssetObjectUrlStoreMock.mockReturnValue({
      rememberUploadedAsset: documentAssetRememberUploadedAssetMock,
      resolveFileUrl: documentAssetResolveFileUrlMock,
      revokeAll: documentAssetRevokeAllMock,
    });
    createDocumentCollabSessionMock.mockReset();
    createDocumentCollabSessionMock.mockReturnValue(collabSessionMock);
    documentAssetRememberUploadedAssetMock.mockReset();
    documentAssetResolveFileUrlMock.mockReset();
    documentAssetRevokeAllMock.mockReset();
    (blockNoteEditorMock as any).document = [
      {
        id: "saved-block",
        type: "paragraph",
        content: [{ type: "text", text: "保存内容", styles: {} }],
        children: [],
      },
    ];
    (blockNoteEditorMock as any).getSelection.mockReturnValue(undefined);
    (blockNoteEditorMock as any).getTextCursorPosition.mockReturnValue({
      block: {
        id: "saved-block",
        type: "paragraph",
        content: "",
      },
    });
    (blockNoteEditorMock as any).insertBlocks.mockReset();
    (blockNoteEditorMock as any).replaceBlocks.mockReset();
    (blockNoteEditorMock as any).tryParseMarkdownToBlocks.mockReset();
    unbindDocumentCollabStatusMock.mockReset();
    uploadDocumentAssetMock.mockReset();
    useCreateBlockNoteMock.mockReset();
    useCreateBlockNoteMock.mockReturnValue(blockNoteEditorMock);
    insertOrUpdateBlockForSlashMenuMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
  });

  it("加载正文 blocks 后创建可编辑 BlockNote 实例", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "协作方案",
      contentUri: "viking://content.md",
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });

    await renderEditor();

    expect(getMock).toHaveBeenCalledWith("/editor/node-doc/content");
    expect(useCreateBlockNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialContent: [{ id: "block-1", type: "paragraph", content: [] }],
        resolveFileUrl: documentAssetResolveFileUrlMock,
      }),
      expect.any(Array),
    );
    expect(container.querySelector("[data-editable='true']")).toBeTruthy();
    expect(container.querySelector("[data-slash-menu='false']")).toBeTruthy();
    expect(stateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "saved" }),
    );
  });

  it("加载表格正文时应兼容 JSON 中的空列宽", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "表格文档",
      contentUri: "viking://content.md",
      blocks: [
        {
          id: "table-1",
          type: "table",
          content: {
            type: "tableContent",
            columnWidths: [null, 120],
            headerRows: 1,
            rows: [
              {
                cells: [
                  { type: "tableCell", props: {}, content: [] },
                  { type: "tableCell", props: {}, content: [] },
                ],
              },
            ],
          },
          children: [],
        },
      ],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });

    await renderEditor();

    expect(readLatestBlockNoteOptions()?.initialContent).toEqual([
      expect.objectContaining({
        content: expect.objectContaining({
          columnWidths: [undefined, 120],
        }),
      }),
    ]);
  });

  it("编辑后进入未保存状态，并在保存请求到达时 PUT blocks", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "协作方案",
      contentUri: "viking://content.md",
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });
    requestMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      contentUri: "viking://next.md",
      updatedAt: "2026-05-12T08:01:00.000Z",
    });

    await renderEditor();

    const editButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("模拟编辑"),
    );
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(stateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dirty" }),
    );

    await rerenderEditor(1);

    expect(requestMock).toHaveBeenCalledWith("/editor/node-doc/content", {
      method: "PUT",
      body: JSON.stringify({ blocks: blockNoteEditorMock.document }),
    });
    expect(stateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "saved", updatedAt: "2026-05-12T08:01:00.000Z" }),
    );
  });

  it("REST 模式通过 uploadFile 上传图片并写入相对路径", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "协作方案",
      contentUri: "viking://content.md",
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });
    uploadDocumentAssetMock.mockResolvedValueOnce("assets/asset-1.png");

    await renderEditor();

    const uploadFile = readLatestBlockNoteOptions()?.uploadFile;
    expect(readLatestBlockNoteOptions()?.resolveFileUrl).toBe(
      documentAssetResolveFileUrlMock,
    );
    const file = createImageFile();

    await expect(uploadFile?.(file)).resolves.toBe("assets/asset-1.png");

    expect(uploadDocumentAssetMock).toHaveBeenCalledWith("node-doc", file);
    expect(documentAssetRememberUploadedAssetMock).toHaveBeenCalledWith(
      "assets/asset-1.png",
      file,
    );
    expect(stateMock).toHaveBeenCalledWith({
      status: "uploadingAsset",
      message: "图片上传中",
    });
    expect(stateMock).toHaveBeenCalledWith({
      status: "dirty",
      message: "图片已插入，尚未保存",
    });
  });

  it("卸载 REST 编辑器时释放图片预览 Object URL", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "协作方案",
      contentUri: "viking://content.md",
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });

    await renderEditor();

    expect(createDocumentAssetObjectUrlStoreMock).toHaveBeenCalledWith(
      "node-doc",
    );

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(documentAssetRevokeAllMock).toHaveBeenCalledTimes(1);
  });

  it("只读模式下不触发保存请求", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "只读文档",
      contentUri: null,
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });

    await renderEditor(0, true);
    await rerenderEditor(1, true);

    expect(container.querySelector("[data-editable='false']")).toBeTruthy();
    expect(requestMock).not.toHaveBeenCalled();
    expect(stateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "readonly" }),
    );
  });

  it("只读模式下 uploadFile 拒绝上传并给出中文提示", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "只读文档",
      contentUri: null,
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });

    await renderEditor(0, true);

    const uploadFile = readLatestBlockNoteOptions()?.uploadFile;

    await expect(uploadFile?.(createImageFile())).rejects.toThrow(
      "当前文档只读，不能上传图片。",
    );

    expect(uploadDocumentAssetMock).not.toHaveBeenCalled();
    expect(stateMock).toHaveBeenCalledWith({
      status: "readonly",
      message: "当前文档只读，不能上传图片。",
    });
  });

  it("协作模式使用 Provider fragment，不并行调用 REST 正文接口", async () => {
    const collab = {
      path: "/collab",
      documentName: "document:tenant-a:node-doc",
    };

    await renderEditor(0, false, collab);

    expect(getMock).not.toHaveBeenCalled();
    expect(createDocumentCollabSessionMock).toHaveBeenCalledWith({ collab });
    expect(bindDocumentCollabStatusMock).toHaveBeenCalledWith(
      collabSessionMock.provider,
      expect.any(Function),
    );
    expect(useCreateBlockNoteMock).not.toHaveBeenCalled();
    expect(stateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "collabConnecting" }),
    );

    await triggerCollabStatus("collabConnected");

    expect(useCreateBlockNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collaboration: expect.objectContaining({
          provider: collabSessionMock.provider,
          fragment: collabSessionMock.fragment,
          user: collabSessionMock.user,
          showCursorLabels: "activity",
        }),
        pasteHandler: expect.any(Function),
        resolveFileUrl: documentAssetResolveFileUrlMock,
        uploadFile: expect.any(Function),
      }),
      [
        expect.objectContaining({
          rememberUploadedAsset: documentAssetRememberUploadedAssetMock,
          resolveFileUrl: documentAssetResolveFileUrlMock,
          revokeAll: documentAssetRevokeAllMock,
        }),
        collabSessionMock,
        expect.any(Function),
      ],
    );
    expect(container.querySelector("[data-editable='true']")).toBeTruthy();

    await rerenderEditor(1, false, collab);

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("协作模式通过 uploadFile 上传图片后进入协作同步状态", async () => {
    const collab = {
      path: "/collab",
      documentName: "document:tenant-a:node-doc",
    };
    uploadDocumentAssetMock.mockResolvedValueOnce("assets/asset-2.png");

    await renderEditor(0, false, collab);
    await triggerCollabStatus("collabConnected");

    const uploadFile = readLatestBlockNoteOptions()?.uploadFile;
    const file = createImageFile("协作截图.png");

    await expect(uploadFile?.(file)).resolves.toBe("assets/asset-2.png");

    expect(uploadDocumentAssetMock).toHaveBeenCalledWith("node-doc", file);
    expect(documentAssetRememberUploadedAssetMock).toHaveBeenCalledWith(
      "assets/asset-2.png",
      file,
    );
    expect(stateMock).toHaveBeenCalledWith({
      status: "uploadingAsset",
      message: "图片上传中",
    });
    expect(stateMock).toHaveBeenCalledWith({
      status: "collabSyncing",
      message: "同步到协作服务中",
    });
  });

  it("协作模式卸载时释放 Provider", async () => {
    await renderEditor(0, false, {
      path: "/collab",
      documentName: "document:tenant-a:node-doc",
    });

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(unbindDocumentCollabStatusMock).toHaveBeenCalledTimes(1);
    expect(cleanupDocumentCollabSessionMock).toHaveBeenCalledWith(
      collabSessionMock,
    );
  });

  it("企业文档 HTML 粘贴时仅保留 Markdown 语义文本", () => {
    const html = `
      <div data-from="feishu-doc">
        <h1>方案标题</h1>
        <p>正文 <strong>加粗</strong> <em>斜体</em></p>
        <ul><li>第一项</li><li>第二项</li></ul>
        <pre><code class="language-mermaid">flowchart TD
A-->B</code></pre>
        <table>
          <tr><th>列 1</th><th>列 2</th></tr>
          <tr><td>值 1</td><td>值 2</td></tr>
        </table>
        <video src="demo.mp4"></video>
      </div>
    `;

    expect(isEnterpriseClipboardHtml(html)).toBe(true);
    expect(sanitizeEnterpriseClipboardHtmlToMarkdown(html)).toBe(
      [
        "# 方案标题",
        "",
        "正文 **加粗** *斜体*",
        "",
        "- 第一项",
        "- 第二项",
        "",
        "```mermaid",
        "flowchart TD",
        "A-->B",
        "```",
        "",
        "| 列 1 | 列 2 |",
        "| --- | --- |",
        "| 值 1 | 值 2 |",
      ].join("\n"),
    );
  });

  it("企业文档代码块粘贴时应优先映射为 Mermaid 和自定义代码块", async () => {
    getMock.mockResolvedValueOnce({
      nodeId: "node-doc",
      kbId: "kb-1",
      name: "协作方案",
      contentUri: "viking://content.md",
      blocks: [{ id: "block-1", type: "paragraph", content: [] }],
      updatedAt: "2026-05-12T08:00:00.000Z",
    });
    (blockNoteEditorMock as any).tryParseMarkdownToBlocks.mockReturnValue([
      {
        id: "code-1",
        type: "codeBlock",
        props: { language: "mermaid" },
        content: "graph TD\nA-->B",
      },
      {
        id: "code-2",
        type: "codeBlock",
        props: { language: "typescript" },
        content: "const answer = 42;",
      },
    ]);

    await renderEditor();

    const pasteHandler = readLatestBlockNoteOptions()?.pasteHandler;
    const handled = pasteHandler?.({
      event: {
        clipboardData: {
          getData: (type: string) =>
            type === "text/html"
              ? '<div data-from="feishu-doc"><pre><code class="language-mermaid">graph TD\nA-->B</code></pre></div>'
              : "",
        },
      } as unknown as ClipboardEvent,
      editor: blockNoteEditorMock,
      defaultPasteHandler: vi.fn(),
    });

    expect(handled).toBe(true);
    expect((blockNoteEditorMock as any).replaceBlocks).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "saved-block",
        }),
      ],
      [
        {
          type: "mermaid",
          props: {
            code: "graph TD\nA-->B",
            viewMode: "split",
            title: "",
          },
        },
        {
          type: "procode",
          props: {
            code: "const answer = 42;",
            language: "typescript",
            title: "",
          },
        },
      ],
    );
  });

  it("slash 菜单应移除视频音频文件并保留 Mermaid 入口", () => {
    const editor = {
      __slashItems: [
        { key: "paragraph", title: "正文" },
        { key: "image", title: "图片" },
        { key: "video", title: "视频" },
        { key: "audio", title: "音频" },
        { key: "file", title: "文件" },
        { key: "toggle_heading", title: "可折叠标题" },
      ],
    };

    const items = getDocumentSlashMenuItems(editor, "");
    const titles = items.map((item) => item.title);

    expect(titles).toContain("正文");
    expect(titles).toContain("图片");
    expect(titles).toContain("文本绘图（Mermaid）");
    expect(
      items.filter((item) => item.group === "Markdown 增强"),
    ).toHaveLength(2);
    expect(titles).not.toContain("视频");
    expect(titles).not.toContain("音频");
    expect(titles).not.toContain("文件");
    expect(titles).not.toContain("可折叠标题");
  });

  it("Mermaid slash 菜单项点击后应插入 mermaid 代码块", () => {
    const editor = {
      __slashItems: [],
    };

    const items = getDocumentSlashMenuItems(editor, "mermaid");
    const mermaidItem = items.find((item) => item.title.includes("Mermaid"));

    mermaidItem?.onItemClick?.();

    expect(insertOrUpdateBlockForSlashMenuMock).toHaveBeenCalledWith(
      editor,
      expect.objectContaining({
        type: "mermaid",
        props: {
          code: expect.stringContaining("graph TD"),
          viewMode: "split"
        }
      }),
    );
  });
});
