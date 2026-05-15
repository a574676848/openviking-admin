import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeSiteHomePage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const { replaceMock, usePathnameMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));
const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/app-provider", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("@/components/theme-switcher", () => ({
  ThemeSwitcher: () => <button type="button">主题切换</button>,
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));



vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;
let nodeList: Array<{
  id: string;
  kbId: string;
  parentId: string | null;
  name: string;
  path: string;
  sortOrder: number;
  vikingUri: string | null;
  contentUri: string | null;
  kind: "collection" | "document";
  acl: { isPublic: boolean; roles: string[]; users: string[] } | null;
  createdAt: string;
}>;

async function flushRender() {
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  });
}

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <KnowledgeSiteHomePage params={Promise.resolve({ kbId: "kb-1" })} />,
    );
    await flushRender();
  });
}

function setInputValue(
  element: HTMLInputElement,
  value: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function setDragData(
  event: Event,
  dataTransfer: { effectAllowed?: string } = {},
) {
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: dataTransfer,
  });
}

function refreshPaths() {
  const byId = new Map(nodeList.map((node) => [node.id, node]));
  function resolvePath(nodeId: string): string {
    const node = byId.get(nodeId);
    if (!node) {
      return "";
    }
    if (!node.parentId) {
      return `/${node.name}`;
    }
    return `${resolvePath(node.parentId)}/${node.name}`;
  }

  nodeList = nodeList.map((node) => ({
    ...node,
    path: resolvePath(node.id),
  }));
}

describe("KnowledgeSiteHomePage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    nodeList = [
      {
        id: "node-folder",
        kbId: "kb-1",
        parentId: null,
        name: "目录",
        path: "/目录",
        sortOrder: 1,
        vikingUri: "viking://folder/",
        contentUri: null,
        kind: "collection",
        acl: { isPublic: true, roles: [], users: [] },
        createdAt: "2026-05-13T02:00:00.000Z",
      },
      {
        id: "node-doc",
        kbId: "kb-1",
        parentId: "node-folder",
        name: "产品路线图",
        path: "/目录/产品路线图",
        sortOrder: 1,
        vikingUri: "viking://doc/",
        contentUri: "viking://doc/content.md",
        kind: "document",
        acl: { isPublic: true, roles: [], users: [] },
        createdAt: "2026-05-13T02:00:00.000Z",
      },
    ];
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    replaceMock.mockReset();
    usePathnameMock.mockReset();
    useAppMock.mockReset();
    usePathnameMock.mockReturnValue("/site/kb-1");
    useAppMock.mockReturnValue({
      user: {
        id: "user-1",
        username: "alice",
        role: "tenant_admin",
        tenantId: "tenant-a",
      },
      isLoading: false,
      logout: vi.fn(),
    });
    confirmMock.mockResolvedValue(true);

    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === "/knowledge-bases") {
        return Promise.resolve([
          { id: "kb-1", name: "产品知识库", tenantId: "tenant-a" },
        ]);
      }
      if (endpoint === "/knowledge-tree?kbId=kb-1&parentId=root" || endpoint === "/knowledge-tree?kbId=kb-1") {
        return Promise.resolve(nodeList);
      }
      if (endpoint.startsWith("/knowledge-tree") && endpoint.includes("/lineage")) {
        return Promise.resolve(nodeList);
      }
      if (endpoint === "/users" || endpoint === "/tenant/users") {
        return Promise.resolve([
          {
            id: "user-1",
            username: "alice",
            role: "tenant_admin",
            active: true,
          },
          {
            id: "user-2",
            username: "bob",
            role: "tenant_operator",
            active: true,
          },
        ]);
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    });

    postMock.mockImplementation((endpoint: string, payload: Record<string, unknown>) => {
      if (endpoint !== "/knowledge-tree") {
        throw new Error(`unexpected post endpoint: ${endpoint}`);
      }

      const created = {
        id: payload.kind === "document" ? "node-doc-2" : "node-folder-2",
        kbId: "kb-1",
        parentId: (payload.parentId as string | undefined) ?? null,
        name: String(payload.name),
        path: "/",
        sortOrder: nodeList.length + 1,
        vikingUri: "viking://generated/",
        contentUri: payload.kind === "document" ? null : null,
        kind: payload.kind as "collection" | "document",
        acl: { isPublic: true, roles: [], users: [] },
        createdAt: "2026-05-13T04:00:00.000Z",
      };
      nodeList = [...nodeList, created];
      refreshPaths();
      return Promise.resolve(created);
    });

    patchMock.mockImplementation((endpoint: string, payload: Record<string, unknown>) => {
      if (endpoint.endsWith("/move")) {
        const nodeId = endpoint.split("/")[2];
        nodeList = nodeList.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                parentId: (payload.parentId as string | null) ?? null,
              }
            : node,
        );
        refreshPaths();
        return Promise.resolve({});
      }

      const nodeId = endpoint.split("/")[2];
      nodeList = nodeList.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }
        return {
          ...node,
          name: typeof payload.name === "string" ? payload.name : node.name,
          acl:
            payload.acl && typeof payload.acl === "object"
              ? (payload.acl as typeof node.acl)
              : node.acl,
        };
      });
      refreshPaths();
      return Promise.resolve({});
    });

    deleteMock.mockImplementation((endpoint: string) => {
      const nodeId = endpoint.split("/")[2];
      const descendantIds = new Set<string>([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of nodeList) {
          if (node.parentId && descendantIds.has(node.parentId) && !descendantIds.has(node.id)) {
            descendantIds.add(node.id);
            changed = true;
          }
        }
      }
      nodeList = nodeList.filter((node) => !descendantIds.has(node.id));
      refreshPaths();
      return Promise.resolve({});
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("渲染站点治理页并展示树与治理入口", async () => {
    await renderPage();

    expect(container.textContent).toContain("产品知识库");
    expect(container.textContent).toContain("工作空间");
    expect(container.textContent).toContain("新目录");
    expect(container.textContent).toContain("新文档");
    expect(container.textContent).toContain("产品路线图");
  });

  it("支持新增目录与新建文档", async () => {
    await renderPage();

    const addFolderButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("新目录"),
    );
    expect(addFolderButton).toBeTruthy();

    await act(async () => {
      addFolderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const folderNameInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="例如：研发规范"]',
    );
    expect(folderNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(folderNameInput!, "研发规范");
      folderNameInput?.closest("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushRender();
    });

    expect(postMock).toHaveBeenNthCalledWith(1, "/knowledge-tree", {
      kbId: "kb-1",
      parentId: null,
      name: "研发规范",
      kind: "collection",
    });
    expect(container.textContent).toContain("研发规范");

    const addDocumentButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("新文档"),
    );
    expect(addDocumentButton).toBeTruthy();

    await act(async () => {
      addDocumentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const documentNameInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="例如：版本发布记录"]',
    );
    expect(documentNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(documentNameInput!, "版本发布记录");
      documentNameInput?.closest("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushRender();
    });

    expect(postMock).toHaveBeenNthCalledWith(2, "/knowledge-tree", {
      kbId: "kb-1",
      parentId: null,
      name: "版本发布记录",
      kind: "document",
    });
    expect(container.textContent).toContain("版本发布记录");
  });

  it("支持重命名、ACL 保存和删除节点", async () => {
    await renderPage();

    const moreActionsButton = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "更多操作"
    );
    expect(moreActionsButton).toBeTruthy();

    await act(async () => {
      moreActionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const renameButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("重命名"),
    );
    expect(renameButton).toBeTruthy();

    await act(async () => {
      renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const renameInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="请输入名称"]',
    );
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput!, "空间总览");
      renameInput?.closest("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await flushRender();
    });

    expect(patchMock).toHaveBeenCalledWith("/knowledge-tree/node-folder", {
      name: "空间总览",
    });

    // 再次点击更多操作打开权限
    await act(async () => {
      moreActionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const permButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("权限设置"),
    );
    expect(permButton).toBeTruthy();

    await act(async () => {
      permButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    // 找到公开可见的开关
    const publicToggle = document.body.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(publicToggle).toBeTruthy();

    await act(async () => {
      publicToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const saveAclButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.type === "submit" && button.textContent?.includes("保存"),
    );
    expect(saveAclButton).toBeTruthy();

    await act(async () => {
      saveAclButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    expect(patchMock).toHaveBeenNthCalledWith(2, "/knowledge-tree/node-folder", {
      acl: {
        isPublic: false,
        roles: [],
        users: [],
      },
    });

    // 再次点击更多操作删除
    await act(async () => {
      moreActionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    const deleteButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("删除"),
    );
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除目录",
      }),
    );
    expect(deleteMock).toHaveBeenCalledWith("/knowledge-tree/node-folder");
  });

  // it("支持拖拽移动节点到根目录", async () => {
  //   await renderPage();
  //   ...
  // });

  it("未登录访问站点时跳转到带 next 参数的登录页", async () => {
    useAppMock.mockReturnValue({
      user: null,
      isLoading: false,
      logout: vi.fn(),
    });

    await renderPage();

    expect(replaceMock).toHaveBeenCalledWith("/login?mode=site&next=%2Fsite%2Fkb-1");
  });
});
