import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeBasesPage from "./page";

const getMock = vi.fn();
const patchMock = vi.fn();
const confirmMock = vi.fn();
const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
const { openKnowledgeSiteInNewTabMock } = vi.hoisted(() => ({
  openKnowledgeSiteInNewTabMock: vi.fn(),
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
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

vi.mock("@/lib/knowledge-site-launch", () => ({
  KNOWLEDGE_SITE_POPUP_BLOCKED_MESSAGE: "blocked",
  openKnowledgeSiteInNewTab: (...args: unknown[]) =>
    openKnowledgeSiteInNewTabMock(...args),
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<KnowledgeBasesPage />);
    await Promise.resolve();
  });
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("KnowledgeBasesPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    patchMock.mockReset();
    confirmMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    openKnowledgeSiteInNewTabMock.mockReset();
    openKnowledgeSiteInNewTabMock.mockReturnValue(true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("归档知识库后会刷新列表并隐藏该项", async () => {
    confirmMock.mockResolvedValue(true);
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce({
        items: [
          {
            id: "kb-1",
            name: "知识库一",
            tenantId: "tenant-alpha",
            status: "active",
            vikingUri: "viking://resources/tenants/tenant-alpha/kb-1/",
            docCount: 3,
            vectorCount: 9,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        pages: 1,
      })
      .mockResolvedValueOnce({
        kbCount: 1,
        quota: { maxDocs: 10 },
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        pages: 1,
      })
      .mockResolvedValueOnce({
        kbCount: 0,
        quota: { maxDocs: 10 },
      });

    await renderPage();

    expect(container.textContent).toContain("进入空间");

    const moreButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="更多操作"]',
    );
    expect(moreButton).toBeTruthy();

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const archiveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("归档知识库"),
    );
    expect(archiveButton).toBeTruthy();

    await act(async () => {
      archiveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "归档知识库",
      }),
    );
    expect(patchMock).toHaveBeenCalledWith("/knowledge-bases/kb-1", {
      status: "archived",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("知识库已归档");
    expect(container.textContent).toContain("暂无匹配知识库");
    expect(container.textContent).not.toContain("知识库一");
  });

  it("列表页提供进入知识空间主入口", async () => {
    getMock
      .mockResolvedValueOnce({
        items: [
          {
            id: "kb-1",
            name: "知识库一",
            tenantId: "tenant-alpha",
            status: "active",
            vikingUri: "viking://resources/tenants/tenant-alpha/kb-1/",
            docCount: 3,
            vectorCount: 9,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        pages: 1,
      })
      .mockResolvedValueOnce({
        kbCount: 1,
        quota: { maxDocs: 10 },
      });

    await renderPage();

    const enterSiteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("进入空间"),
    );
    expect(enterSiteButton).toBeTruthy();

    await act(async () => {
      enterSiteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(openKnowledgeSiteInNewTabMock).toHaveBeenCalledWith("/site/kb-1");
  });

  it("支持在更多菜单中重命名知识库", async () => {
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce({
        items: [
          {
            id: "kb-1",
            name: "知识库一",
            tenantId: "tenant-alpha",
            status: "active",
            vikingUri: "viking://resources/tenants/tenant-alpha/kb-1/",
            docCount: 3,
            vectorCount: 9,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        pages: 1,
      })
      .mockResolvedValueOnce({
        kbCount: 1,
        quota: { maxDocs: 10 },
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "kb-1",
            name: "知识库一-新版",
            tenantId: "tenant-alpha",
            status: "active",
            vikingUri: "viking://resources/tenants/tenant-alpha/kb-1/",
            docCount: 3,
            vectorCount: 9,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        pages: 1,
      })
      .mockResolvedValueOnce({
        kbCount: 1,
        quota: { maxDocs: 10 },
      });

    await renderPage();

    const moreButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="更多操作"]',
    );
    expect(moreButton).toBeTruthy();

    await act(async () => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const renameButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("重命名知识库"),
    );
    expect(renameButton).toBeTruthy();

    await act(async () => {
      renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const renameInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="输入新的知识库名称"]',
    );
    expect(renameInput).toBeTruthy();

    await act(async () => {
      setInputValue(renameInput!, "知识库一-新版");
      renameInput?.closest("form")?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(patchMock).toHaveBeenCalledWith("/knowledge-bases/kb-1", {
      name: "知识库一-新版",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("知识库名称已更新");
  });
});
