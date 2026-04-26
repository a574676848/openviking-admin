import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "./page";

const postMock = vi.fn();
const getSearchParamMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => getSearchParamMock(key),
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
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
    root.render(<SearchPage />);
  });
}

describe("SearchPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    postMock.mockReset();
    getSearchParamMock.mockReset();
    getSearchParamMock.mockReturnValue(null);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("检索失败时展示显式失败态和重试入口", async () => {
    postMock.mockRejectedValueOnce(new Error("核心检索服务不可用"));

    await renderPage();

    const input = container.querySelector('input[placeholder*="输入检索问题"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(input, "如何配置 WebDAV？");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenCalledWith("/search/find", {
      query: "如何配置 WebDAV？",
      uri: undefined,
      topK: 10,
      scoreThreshold: 0.3,
      useRerank: true,
    });
    expect(container.textContent).toContain("检索请求失败");
    expect(container.textContent).toContain("核心检索服务不可用");
    expect(container.textContent).toContain("重新加载");
  });

  it("检索成功后展示高亮结果、rerank 状态并支持反馈", async () => {
    postMock
      .mockResolvedValueOnce({
        resources: [
          {
            uri: "viking://docs/webdav",
            title: "WebDAV 配置指南",
            content: "WebDAV 配置需要先完成挂载。",
            score: 0.91,
            stage1Score: 0.62,
            reranked: true,
          },
        ],
        latencyMs: 88,
        logId: "log-1",
        rerankApplied: true,
      })
      .mockResolvedValueOnce({});

    await renderPage();

    const input = container.querySelector('input[placeholder*="输入检索问题"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    await act(async () => {
      setValue?.call(input, "WebDAV 配置");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Rerank 已启用");
    expect(container.textContent).toContain("结果反馈");
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);

    const noteInput = container.querySelector('input[placeholder*="补充说明"]') as HTMLInputElement;
    await act(async () => {
      setValue?.call(noteInput, "命中结果准确");
      noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const helpfulButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("结果有帮助"),
    );
    expect(helpfulButton).toBeTruthy();

    await act(async () => {
      helpfulButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(postMock).toHaveBeenNthCalledWith(2, "/search/logs/log-1/feedback", {
      feedback: "helpful",
      note: "命中结果准确",
    });
    expect(container.textContent).toContain("已记录为有帮助结果。");
  });

  it("支持从 URL 参数预填检索条件", async () => {
    getSearchParamMock.mockImplementation((key: string) => {
      if (key === "query") return "预填问题";
      if (key === "uri") return "viking://prefill";
      return null;
    });

    await renderPage();

    const inputs = Array.from(container.querySelectorAll("input"));
    expect((inputs[0] as HTMLInputElement).value).toBe("预填问题");
    expect((inputs[1] as HTMLInputElement).value).toBe("viking://prefill");
  });
});
