import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeSiteFolderPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const { replaceMock, usePathnameMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));
const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));
const confirmMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({
    replace: replaceMock,
  }),
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
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function flushRender() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
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
      <KnowledgeSiteFolderPage
        params={Promise.resolve({ kbId: "kb-1", nodeId: "folder-1" })}
      />,
    );
    await flushRender();
  });
}

describe("KnowledgeSiteFolderPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    replaceMock.mockReset();
    usePathnameMock.mockReset();
    useAppMock.mockReset();
    confirmMock.mockReset();
    usePathnameMock.mockReturnValue("/site/kb-1/folder/folder-1");
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
    postMock.mockResolvedValue({
      item: { nodeId: "doc-dirty", indexStatus: "clean" },
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

  it("展示文档索引状态，并允许对未索引文档执行行级更新索引", async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === "/knowledge-bases") {
        return Promise.resolve([{ id: "kb-1", name: "产品知识库", tenantId: "tenant-a" }]);
      }
      if (endpoint.startsWith("/knowledge-tree/folder-1/lineage")) {
        return Promise.resolve([
          {
            id: "folder-1",
            kbId: "kb-1",
            parentId: null,
            name: "研发规范",
            path: "/研发规范",
            sortOrder: 1,
            vikingUri: "viking://folder/",
            contentUri: null,
            kind: "collection",
            acl: { isPublic: true, roles: [], users: [] },
            createdAt: "2026-05-13T02:00:00.000Z",
          },
          {
            id: "doc-dirty",
            kbId: "kb-1",
            parentId: "folder-1",
            name: "版本发布记录.md",
            path: "/研发规范/版本发布记录.md",
            sortOrder: 1,
            vikingUri: "viking://doc/",
            contentUri: "viking://doc/content.md",
            kind: "document",
            indexStatus: "dirty",
            acl: { isPublic: true, roles: [], users: [] },
            createdAt: "2026-05-13T02:00:00.000Z",
          },
        ]);
      }
      if (endpoint === "/knowledge-tree?kbId=kb-1&parentId=root") {
        return Promise.resolve([]);
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    });

    await renderPage();

    expect(container.textContent).toContain("版本发布记录.md");
    expect(container.textContent).toContain("待索引");

    const button = container.querySelector<HTMLButtonElement>('button[title="更新索引"]');
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushRender();
    });

    expect(postMock).toHaveBeenCalledWith("/editor/doc-dirty/index", {});
  });
});
