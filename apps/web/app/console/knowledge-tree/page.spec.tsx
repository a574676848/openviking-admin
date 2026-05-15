import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeTreePage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const { pushMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

function createDragEvent(type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const store = new Map<string, string>();
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "move",
      dropEffect: "move",
      setData: (key: string, value: string) => store.set(key, value),
      getData: (key: string) => store.get(key) ?? "",
    },
  });
  return event;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<KnowledgeTreePage />);
    await Promise.resolve();
  });
}

describe("KnowledgeTreePage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    pushMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("选择节点后展示权限预览和结构调整入口", async () => {
    getMock
      .mockResolvedValueOnce([
        { id: "kb-1", name: "知识库一", tenantId: "tenant-a" },
      ])
      .mockResolvedValueOnce([
        { id: "user-1", username: "admin", role: "tenant_admin", active: true },
      ])
      .mockResolvedValueOnce([
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
          contentUri: null,
          kind: "collection",
          acl: { isPublic: false, roles: ["tenant_viewer"], users: ["user-1"] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ]);

    await renderPage();

    const rootNodeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("根节点"),
    );
    expect(rootNodeButton).toBeTruthy();

    await act(async () => {
      rootNodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("访问预览");
    expect(container.textContent).toContain("当前节点为私有受控资源。");
    expect(container.textContent).toContain("额外授权用户：admin");
    expect(container.textContent).toContain("访问权限控制 ACL");
    expect(container.textContent).toContain("应用变更");
  });

  it("拖拽节点到目标节点后先确认再调用移动接口", async () => {
    confirmMock.mockResolvedValue(true);
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
          contentUri: null,
          kind: "collection",
          acl: { isPublic: true, roles: [], users: [] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
        {
          id: "node-child",
          kbId: "kb-1",
          parentId: "node-root",
          name: "子节点甲",
          path: "/根节点/子节点甲",
          sortOrder: 1,
          vikingUri: null,
          contentUri: null,
          kind: "collection",
          acl: { isPublic: true, roles: [], users: [] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
        {
          id: "node-target",
          kbId: "kb-1",
          parentId: null,
          name: "目标目录",
          path: "/目标目录",
          sortOrder: 2,
          vikingUri: null,
          contentUri: null,
          kind: "collection",
          acl: { isPublic: true, roles: [], users: [] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);

    await renderPage();

    const dragButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("子节点甲"),
    );
    const dropButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("目标目录"),
    );

    expect(dragButton).toBeTruthy();
    expect(dropButton).toBeTruthy();

    await act(async () => {
      dragButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      dragButton?.dispatchEvent(createDragEvent("dragstart"));
      await Promise.resolve();
    });

    await act(async () => {
      dropButton?.dispatchEvent(createDragEvent("dragover"));
      dropButton?.dispatchEvent(createDragEvent("drop"));
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "确认调整节点结构",
      }),
    );
    expect(patchMock).toHaveBeenCalledWith("/knowledge-tree/node-child/move", {
      parentId: "node-target",
      sortOrder: 1,
    });
  });

  it("保存 ACL 时应提交 acl 字段并提示保存成功", async () => {
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
          contentUri: null,
          kind: "collection",
          acl: { isPublic: false, roles: ["tenant_viewer"], users: ["user-1"] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
          contentUri: null,
          kind: "collection",
          acl: { isPublic: false, roles: ["tenant_viewer"], users: ["user-1"] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ]);

    await renderPage();

    const rootNodeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("根节点"),
    );

    await act(async () => {
      rootNodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("应用变更"),
    );

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(patchMock).toHaveBeenCalledWith("/knowledge-tree/node-root", {
      acl: { isPublic: false, roles: ["tenant_viewer"], users: ["user-1"] },
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("保存成功");
  });

  it("新建节点默认保持目录创建语义", async () => {
    postMock.mockResolvedValue({
      id: "node-folder",
      kbId: "kb-1",
      parentId: null,
      name: "资料目录",
      path: "/资料目录",
      sortOrder: 1,
      vikingUri: "viking://kb-1/node-folder/",
      contentUri: null,
      kind: "collection",
      acl: { isPublic: true, roles: [], users: [] },
      createdAt: "2026-04-26T00:00:00.000Z",
    });
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await renderPage();

    const addNodeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("新建节点"),
    );
    await act(async () => {
      addNodeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="输入节点名称"]');
    expect(nameInput).toBeTruthy();
    await act(async () => {
      setInputValue(nameInput!, "资料目录");
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("确认创建"),
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith("/knowledge-tree", {
      kbId: "kb-1",
      parentId: null,
      name: "资料目录",
      kind: "collection",
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("知识节点已创建");
  });

  it("新建文档调用知识树创建接口但不再从控制台跳转编辑页", async () => {
    postMock.mockResolvedValue({
      id: "node-doc",
      kbId: "kb-1",
      parentId: null,
      name: "协作文档",
      path: "/协作文档",
      sortOrder: 1,
      vikingUri: "viking://kb-1/node-doc/",
      contentUri: null,
      kind: "document",
      acl: { isPublic: true, roles: [], users: [] },
      createdAt: "2026-04-26T00:00:00.000Z",
    });
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([]);

    await renderPage();

    const addDocumentButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("新建文档"),
    );
    await act(async () => {
      addDocumentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("文档节点");
    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="输入节点名称"]');
    expect(nameInput).toBeTruthy();
    await act(async () => {
      setInputValue(nameInput!, "协作文档");
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("确认创建"),
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith("/knowledge-tree", {
      kbId: "kb-1",
      parentId: null,
      name: "协作文档",
      kind: "document",
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("文档已创建");
  });

  it("控制台知识树不再显示文档编辑入口", async () => {
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([
        {
          id: "node-folder",
          kbId: "kb-1",
          parentId: null,
          name: "资料目录",
          path: "/资料目录",
          sortOrder: 1,
          vikingUri: "viking://kb-1/node-folder/",
          contentUri: null,
          kind: "collection",
          acl: { isPublic: true, roles: [], users: [] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
        {
          id: "node-doc",
          kbId: "kb-1",
          parentId: null,
          name: "协作文档",
          path: "/协作文档",
          sortOrder: 2,
          vikingUri: "viking://kb-1/node-doc/",
          contentUri: null,
          kind: "document",
          acl: { isPublic: true, roles: [], users: [] },
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ]);

    await renderPage();

    expect(
      container.querySelector('button[aria-label="在站点中打开文档 资料目录"]'),
    ).toBeNull();
    expect(
      container.querySelector('button[aria-label="在站点中打开文档 协作文档"]'),
    ).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("文档节点展示索引状态并支持重建索引", async () => {
    postMock.mockResolvedValue({
      nodeId: "node-doc",
      contentUri: "viking://kb-1/node-doc/content.md",
      draftVersion: 2,
      indexedVersion: 2,
      indexStatus: "clean",
      vectorCount: 4,
      lastIndexedAt: "2026-05-14T10:00:00.000Z",
    });
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([{ id: "user-1", username: "admin", role: "tenant_admin", active: true }])
      .mockResolvedValueOnce([
        {
          id: "node-doc",
          kbId: "kb-1",
          parentId: null,
          name: "协作文档",
          path: "/协作文档",
          sortOrder: 1,
          vikingUri: "viking://kb-1/node-doc/",
          contentUri: null,
          kind: "document",
          acl: { isPublic: true, roles: [], users: [] },
          indexStatus: "dirty",
          vectorCount: 0,
          lastIndexedAt: null,
          indexError: "索引过期",
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "node-doc",
          kbId: "kb-1",
          parentId: null,
          name: "协作文档",
          path: "/协作文档",
          sortOrder: 1,
          vikingUri: "viking://kb-1/node-doc/",
          contentUri: "viking://kb-1/node-doc/content.md",
          kind: "document",
          acl: { isPublic: true, roles: [], users: [] },
          indexStatus: "clean",
          vectorCount: 4,
          lastIndexedAt: "2026-05-14T10:00:00.000Z",
          indexError: null,
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ]);

    await renderPage();

    expect(container.textContent).toContain("待索引");
    const docButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("协作文档"),
    );
    await act(async () => {
      docButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("索引状态");
    expect(container.textContent).toContain("索引错误");
    expect(container.textContent).toContain("索引过期");

    const rebuildButton = container.querySelector<HTMLButtonElement>('button[aria-label="重建索引 协作文档"]');
    expect(rebuildButton).toBeTruthy();

    await act(async () => {
      rebuildButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith("/editor/node-doc/index", {});
    expect(toastSuccessMock).toHaveBeenCalledWith("索引已更新");
    expect(container.textContent).toContain("已索引");
    expect(container.textContent).toContain("4");
    expect(container.textContent).not.toContain("索引过期");
  });
});
