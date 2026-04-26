import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeTreePage from "./page";

const getMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
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
    patchMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
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
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
          acl: { isPublic: false, roles: ["tenant_viewer"], users: [] },
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
    expect(container.textContent).toContain("结构调整");
    expect(container.textContent).toContain("调整节点位置");
  });

  it("拖拽节点到目标节点后先确认再调用移动接口", async () => {
    confirmMock.mockResolvedValue(true);
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "知识库一", tenantId: "tenant-a" }])
      .mockResolvedValueOnce([
        {
          id: "node-root",
          kbId: "kb-1",
          parentId: null,
          name: "根节点",
          path: "/",
          sortOrder: 1,
          vikingUri: "viking://kb-1/root",
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
});
