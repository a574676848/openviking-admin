import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeSiteDocumentPage from "./page";

const getMock = vi.fn();
const { replaceMock, usePathnameMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));
const { useAppMock, documentEditorPropsMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
  documentEditorPropsMock: vi.fn(),
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

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

vi.mock("@/components/ui/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/document-editor/document-editor", () => ({
  DocumentEditor: (props: {
    collab?: { path: string; documentName: string };
    readOnly: boolean;
    saveRequestId: number;
    reconnectRequestId?: number;
  }) => {
    documentEditorPropsMock(props);
    return <div data-testid="document-editor">文档编辑器</div>;
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <KnowledgeSiteDocumentPage
        params={Promise.resolve({ kbId: "kb-1", nodeId: "node-doc" })}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("KnowledgeSiteDocumentPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    getMock.mockReset();
    replaceMock.mockReset();
    usePathnameMock.mockReset();
    useAppMock.mockReset();
    documentEditorPropsMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    usePathnameMock.mockReturnValue("/site/kb-1/doc/node-doc");
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
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("渲染独立站点文档页并复用现有协作编辑器", async () => {
    getMock.mockImplementation((endpoint: string) => {
      if (endpoint === "/knowledge-bases") {
        return Promise.resolve([{ id: "kb-1", name: "产品知识库", tenantId: "tenant-a" }]);
      }
      if (endpoint === "/knowledge-tree?kbId=kb-1&parentId=root" || endpoint === "/knowledge-tree?kbId=kb-1" || (endpoint.startsWith("/knowledge-tree") && endpoint.includes("/lineage"))) {
        return Promise.resolve([
          {
            id: "node-doc",
            kbId: "kb-1",
            parentId: null,
            name: "协作方案",
            path: "/协作方案",
            sortOrder: 1,
            vikingUri: "viking://doc/",
            contentUri: "viking://doc/content.md",
            kind: "document",
            acl: { isPublic: true, roles: [], users: [] },
            createdAt: "2026-05-13T02:00:00.000Z",
          },
        ]);
      }
      if (endpoint === "/editor/node-doc") {
        return Promise.resolve({
          nodeId: "node-doc",
          kbId: "kb-1",
          name: "协作方案",
          contentUri: "viking://doc/content.md",
          readOnly: false,
          canWrite: true,
          collab: {
            path: "/collab",
            documentName: "document:tenant-a:node-doc",
          },
          updatedAt: "2026-05-13T02:00:00.000Z",
        });
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    });

    await renderPage();

    expect(container.textContent).toContain("产品知识库");
    expect(container.textContent).toContain("协作方案");
    expect(container.textContent).toContain("正文加载中");
    expect(container.textContent).toContain("1 位协作者在线");
    expect(container.textContent).toContain("重连");
    expect(container.textContent).toContain("手动保存");
    expect(container.textContent).not.toContain("租户工作台");
    expect(documentEditorPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        readOnly: false,
        collab: {
          path: "/collab",
          documentName: "document:tenant-a:node-doc",
        },
      }),
    );
  });
});
