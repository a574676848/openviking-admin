import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebdavConfigPage from "./page";

const fetchMock = vi.fn();

vi.mock("@/components/app-provider", () => ({
  useApp: () => ({
    user: { tenantId: "tenant-demo" },
  }),
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
    await Promise.resolve();
  });
}

describe("WebdavConfigPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://localhost:6001");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("连接自检成功时不在页面回显完整 API key", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 207 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await renderPage();
    expect(container.textContent).toContain(
      '"address": "http://localhost:6001/webdav/tenant-demo/"',
    );
    expect(container.textContent).toContain("OBSIDIAN");
    const input = container.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    const button = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.includes("连接自检"),
    ) as HTMLButtonElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    await act(async () => {
      valueSetter?.call(input, "ov-sk-secret-value");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/console/webdav/check",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          tenantId: "tenant-demo",
          apiKey: "ov-sk-secret-value",
        }),
      }),
    );
    expect(container.textContent).toContain("连接自检通过");
    expect(container.textContent).not.toContain("ov-sk-secret-value");
  });
});
