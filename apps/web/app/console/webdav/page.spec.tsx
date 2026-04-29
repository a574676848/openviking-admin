import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebdavConfigPage from "./page";

const getMock = vi.fn();

vi.mock("@/components/app-provider", () => ({
  useApp: () => ({
    user: { tenantId: "tenant-demo" },
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<WebdavConfigPage />);
    await Promise.resolve();
  });
}

describe("WebdavConfigPage", () => {
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

  it("核心健康度降级时仍允许查看 WebDAV 配置", async () => {
    getMock.mockResolvedValueOnce({
      health: {
        ok: false,
        message: "当前租户未启用自定义 OpenViking 引擎配置",
      },
    });

    await renderPage();

    expect(getMock).toHaveBeenCalledWith("/system/dashboard");
    expect(container.textContent).toContain("核心健康度降级");
    expect(container.textContent).toContain("DEGRADED");
    expect(container.textContent).toContain('"address": "http://localhost:3000/webdav/tenant-demo/"');
    expect(container.textContent).toContain("OBSIDIAN");
    expect(container.querySelector(".pointer-events-none")).toBeNull();
  });
});
