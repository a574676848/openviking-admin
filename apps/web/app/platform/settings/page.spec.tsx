import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const getMock = vi.fn();
const patchMock = vi.fn();

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
    root.render(<SettingsPage />);
    await Promise.resolve();
  });
}

describe("Platform SettingsPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    patchMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("加载失败时展示配置失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("配置服务不可用"));

    await renderPage();

    expect(container.textContent).toContain("配置加载失败");
    expect(container.textContent).toContain("配置服务不可用");
    expect(container.textContent).toContain("重新加载");
  });

  it("保存后展示成功提示并调用 patch", async () => {
    vi.useFakeTimers();
    getMock.mockResolvedValueOnce([
      {
        key: "search.top_k",
        value: "10",
        description: "默认召回条数",
        updatedAt: "2026-04-26T10:00:00.000Z",
      },
      {
        key: "search.rerank_enabled",
        value: "false",
        description: "是否启用 rerank",
        updatedAt: "2026-04-26T10:00:00.000Z",
      },
    ]);
    patchMock.mockResolvedValueOnce({});

    await renderPage();

    expect(container.textContent).toContain("默认召回数 Top K");

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("保存配置"),
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(patchMock).toHaveBeenCalledWith("/settings", {
      "search.top_k": "10",
      "search.rerank_enabled": "false",
    });
    expect(container.textContent).toContain("配置已保存");

    await act(async () => {
      vi.runAllTimers();
    });

    vi.useRealTimers();
  });
});
