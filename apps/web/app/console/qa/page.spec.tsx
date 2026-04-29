import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QaPage from "./page";

const getMock = vi.fn();
const postMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/watcher", () => ({
  VikingWatcher: ({ isThinking }: { isThinking: boolean }) => <div>{isThinking ? "thinking" : "idle"}</div>,
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<QaPage />);
  });
}

describe("QaPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    getMock.mockResolvedValue([]);
    postMock.mockReset();
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

  it("检索失败时展示页面内失败态和重试入口", async () => {
    postMock.mockRejectedValue(new Error("engine offline"));

    await renderPage();

    const input = container.querySelector('input[placeholder*="输入问题或检索指令"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, "如何导入知识库？");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("检索服务响应异常，请检查底层引擎 (OpenViking Core) 是否在线。");
    expect(container.textContent).toContain("重新发起检索请求");
    expect(toastErrorMock).toHaveBeenCalledWith("检索请求失败，核心引擎可能已离线");
  });
});
