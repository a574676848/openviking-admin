import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseMigrationsPage from "./page";
import { API_ENDPOINTS, IsolationLevel } from "@/lib/constants";

const getMock = vi.fn();
const postMock = vi.fn();

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

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DatabaseMigrationsPage />);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockPageData() {
  getMock.mockImplementation((endpoint: string) => {
    if (endpoint === API_ENDPOINTS.TENANT_MIGRATIONS.TENANTS) {
      return Promise.resolve([
        {
          id: "tenant-record-1",
          tenantId: "tenant-alpha",
          displayName: "Alpha",
          status: "active",
          isolationLevel: IsolationLevel.SMALL,
          dbConfig: null,
        },
      ]);
    }

    if (endpoint === API_ENDPOINTS.TENANT_MIGRATIONS.TASKS) {
      return Promise.resolve([
        {
          id: "task-1",
          scope: "tenant",
          tenantId: "tenant-alpha",
          sourceLevel: IsolationLevel.SMALL,
          targetLevel: IsolationLevel.SMALL,
          status: "failed",
          step: "迁移失败",
          progress: 30,
          errorMessage: "目标库连接失败",
          createdByName: "admin",
          createdAt: "2026-05-18T02:59:31.000Z",
        },
      ]);
    }

    return Promise.resolve([]);
  });
}

describe("DatabaseMigrationsPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    mockPageData();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("展示迁移入口并加载租户", async () => {
    await renderPage();

    expect(container.textContent).toContain("统一管理平台控制库升级与租户存储校准");
    expect(container.textContent).toContain("平台公共库");
    expect(container.textContent).toContain("操作人");
    expect(container.textContent).toContain("错误消息");
    expect(container.textContent).toContain("admin");
    expect(container.textContent).toContain("目标库连接失败");
    expect(container.textContent).toContain("SMALL");
    expect(container.textContent).not.toContain("SMALL / SMALL");
  });

  it("点击预检时调用迁移预检接口", async () => {
    postMock.mockResolvedValue({
      passed: true,
      scope: "platform",
      items: [{ name: "待执行 migration", passed: true, message: "允许迁移" }],
    });

    await renderPage();

    const button = Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("执行预检"),
    );
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith(
      API_ENDPOINTS.TENANT_MIGRATIONS.PLATFORM_PRECHECK,
      {},
    );
  });
});
