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

describe("KnowledgeBasesPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    patchMock.mockReset();
    confirmMock.mockReset();
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

  it("归档知识库后会刷新列表并隐藏该项", async () => {
    confirmMock.mockResolvedValue(true);
    patchMock.mockResolvedValue({});
    getMock
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce({
        kbCount: 1,
        quota: { maxDocs: 10 },
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        kbCount: 0,
        quota: { maxDocs: 10 },
      });

    await renderPage();

    expect(container.textContent).toContain("归档");

    const archiveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("归档"),
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
});
