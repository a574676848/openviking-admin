import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import McpPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();
const clipboardWriteMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
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
    root.render(<McpPage />);
    await Promise.resolve();
  });
}

describe("McpPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    confirmMock.mockReset();
    clipboardWriteMock.mockReset();
    fetchMock.mockReset();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteMock,
      },
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it("列表为空时展示空状态", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ data: { capabilities: [] } });

    await renderPage();

    expect(container.textContent).toContain("暂无 Capability Key");
    expect(container.textContent).toContain("请先生成调用凭证，再让客户端或 IDE 发起连接。");
  });

  it("列表加载失败时展示失败态和重试入口", async () => {
    getMock.mockRejectedValueOnce(new Error("凭证中心暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("Capability Key 列表加载失败");
    expect(container.textContent).toContain("凭证中心暂不可用");
    expect(container.textContent).toContain("重新加载");
  });

  it("生成新 key 后可以执行连接测试并复制客户端配置", async () => {
    getMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ data: { capabilities: [] } })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ data: { capabilities: [] } });
    postMock.mockResolvedValueOnce({ apiKey: "cap_live_12345678" });
    fetchMock.mockResolvedValueOnce({ ok: true });

    await renderPage();

    const toggleButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("生成新 Key"),
    );
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = container.querySelector("input");
    expect(input).toBeTruthy();

    await act(async () => {
      input?.dispatchEvent(new Event("focus", { bubbles: true }));
      if (input) {
        input.value = "Desktop IDE";
      }
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const createButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("生成 Key"),
    );
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const testButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("测试当前连接"),
    );
    expect(testButton).toBeTruthy();

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/mcp/sse?key=cap_live_12345678",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
    );
    expect(container.textContent).toContain("连接测试通过");

    const copyConfigButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("复制客户端配置"),
    );
    expect(copyConfigButton).toBeTruthy();

    await act(async () => {
      copyConfigButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(clipboardWriteMock).toHaveBeenCalledWith(
      expect.stringContaining('"url": "http://localhost:3000/api/v1/mcp/sse?key=cap_live_12345678"'),
    );
  });
});
