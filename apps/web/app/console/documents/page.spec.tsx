import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentsPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    promise: (promise: Promise<unknown>) => promise,
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
    post: (...args: unknown[]) => postMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DocumentsPage />);
    await Promise.resolve();
  });
}

describe("DocumentsPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    vi.spyOn(globalThis, "setInterval").mockImplementation(() => 1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.restoreAllMocks();
  });

  it("加载失败时展示页面内失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("任务中心暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("任务中心暂不可用");
  });

  it("根据任务状态展示重试、取消、删除和批量操作入口", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "task-pending",
        kbId: "kb-1",
        sourceType: "git",
        sourceUrl: "https://example.com/repo.git",
        targetUri: "viking://kb-1/docs",
        status: "pending",
        nodeCount: 0,
        vectorCount: 0,
        errorMsg: null,
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
      {
        id: "task-failed",
        kbId: "kb-1",
        sourceType: "url",
        sourceUrl: "https://example.com/page",
        targetUri: "viking://kb-1/page",
        status: "failed",
        nodeCount: 0,
        vectorCount: 0,
        errorMsg: "抓取失败",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
      {
        id: "task-done",
        kbId: "kb-1",
        sourceType: "url",
        sourceUrl: "https://example.com/done",
        targetUri: "viking://kb-1/done",
        status: "done",
        nodeCount: 10,
        vectorCount: 20,
        errorMsg: null,
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
    ]);

    await renderPage();

    expect(container.textContent).toContain("同步");
    expect(container.textContent).toContain("重试");
    expect(container.textContent).toContain("取消");
    expect(container.textContent).toContain("抓取失败");
    expect(container.textContent).toContain("任务进度");

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const doneRow = rows.find((row) => row.textContent?.includes("https://example.com/done"));
    expect(doneRow).toBeDefined();

    const failedRow = rows.find((row) => row.textContent?.includes("https://example.com/page"));
    expect(failedRow).toBeDefined();
    expect(failedRow?.textContent).toContain("0%");

    const actionButtons = Array.from(doneRow?.querySelectorAll("button") ?? []).filter((button) =>
      ["同步", "重试", "取消", "删除"].includes(button.textContent?.trim() ?? ""),
    );
    expect(actionButtons.map((button) => button.textContent?.trim())).toEqual(["同步", "重试", "取消", "删除"]);
    expect(actionButtons[0]?.disabled).toBe(false);
    expect(actionButtons.slice(1).every((button) => button.disabled)).toBe(true);

    const failedDeleteButton = Array.from(failedRow?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent?.trim() === "删除",
    );
    expect(failedDeleteButton).toBeDefined();
    expect(failedDeleteButton?.disabled).toBe(false);
  });

  it("确认后会删除失败任务", async () => {
    getMock.mockResolvedValueOnce([
      {
        id: "task-failed",
        kbId: "kb-1",
        sourceType: "url",
        sourceUrl: "https://example.com/page",
        targetUri: "viking://kb-1/page",
        status: "failed",
        nodeCount: 0,
        vectorCount: 0,
        errorMsg: "抓取失败",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
    ]);
    confirmMock.mockResolvedValueOnce(true);
    deleteMock.mockResolvedValueOnce({});

    await renderPage();

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "删除",
    );
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "删除失败任务",
        confirmText: "确认删除",
      }),
    );
    expect(deleteMock).toHaveBeenCalledWith("/import-tasks/task-failed");
  });
});
