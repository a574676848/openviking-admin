import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "./page";

const getMock = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AuditPage />);
    await Promise.resolve();
  });
}

describe("Platform AuditPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("加载失败时展示失败态和重试入口", async () => {
    getMock.mockRejectedValueOnce(new Error("审计中心暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("审计日志加载失败：审计中心暂不可用");
    expect(container.textContent).toContain("重试加载");
  });

  it("多页结果会显示分页控件并能切换到下一页", async () => {
    getMock
      .mockResolvedValueOnce({
        items: [
          {
            id: "log-1",
            userId: "u-1",
            username: "alice",
            action: "login",
            target: "platform",
            meta: { traceId: "trace-1" },
            ip: "127.0.0.1",
            success: true,
            createdAt: "2026-04-26T10:00:00.000Z",
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        pages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "log-2",
            userId: "u-2",
            username: "bob",
            action: "user_delete",
            target: "tenant-a/user-2",
            meta: { traceId: "trace-2" },
            ip: "127.0.0.2",
            success: false,
            createdAt: "2026-04-26T11:00:00.000Z",
          },
        ],
        total: 2,
        page: 2,
        pageSize: 20,
        pages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "log-2",
            userId: "u-2",
            username: "bob",
            action: "user_delete",
            target: "tenant-a/user-2",
            meta: { traceId: "trace-2" },
            ip: "127.0.0.2",
            success: false,
            createdAt: "2026-04-26T11:00:00.000Z",
          },
        ],
        total: 2,
        page: 2,
        pageSize: 20,
        pages: 2,
      });

    await renderPage();

    expect(container.textContent).toContain("alice");
    expect(container.textContent).toContain("P.1/2");

    const nextButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("下一页"),
    );
    expect(nextButton).toBeTruthy();

    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("bob");
    expect(container.textContent).toContain("P.2/2");
  });
});
