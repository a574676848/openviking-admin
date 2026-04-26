import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemPage from "./page";

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
    root.render(<SystemPage />);
    await Promise.resolve();
  });
}

describe("Platform SystemPage", () => {
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

  it("加载失败时展示系统状态失败态和重试入口", async () => {
    getMock.mockRejectedValueOnce(new Error("遥测服务不可用"));

    await renderPage();

    expect(container.textContent).toContain("系统状态加载失败");
    expect(container.textContent).toContain("遥测服务不可用");
    expect(container.textContent).toContain("重试加载");
  });

  it("无图存储统计时展示空态，并渲染 OpenViking 与队列状态", async () => {
    getMock
      .mockResolvedValueOnce({
        ok: true,
        openviking: {
          host: "http://openviking.local",
          version: "1.4.2",
          commit: "abc1234def",
          dimension: 1536,
          embeddingModel: "text-embedding-3-large",
        },
      })
      .mockResolvedValueOnce({
        queue: {
          Embedding: 3,
          Semantic: 1,
          "Semantic-Nodes": 0,
        },
        dbStats: null,
      });

    await renderPage();

    expect(container.textContent).toContain("底层状态监控_");
    expect(container.textContent).toContain("OpenViking 核心引擎");
    expect(container.textContent).toContain("在线");
    expect(container.textContent).toContain("http://openviking.local");
    expect(container.textContent).toContain("异步任务队列");
    expect(container.textContent).toContain("暂无图存储遥测");
    expect(container.textContent).toContain("当前未返回可展示的图存储指标。");
  });
});
