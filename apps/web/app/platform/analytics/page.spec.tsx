import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "./page";

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
    root.render(<AnalyticsPage />);
    await Promise.resolve();
  });
}

describe("Platform AnalyticsPage", () => {
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

  it("加载失败时展示页面级失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("统计服务暂不可用"));

    await renderPage();

    expect(container.textContent).toContain("分析数据加载失败");
    expect(container.textContent).toContain("统计服务暂不可用");
    expect(container.textContent).toContain("重试加载");
  });

  it("切换到 Query 热点后展示查询榜单", async () => {
    getMock.mockResolvedValueOnce({
      overview: {
        total: 120,
        hitCount: 96,
        zeroCount: 24,
        hitRate: 80,
        avgLatency: 320,
        helpfulCount: 11,
        unhelpfulCount: 2,
        feedbackTotal: 13,
      },
      topUris: [
        { uri: "viking://docs/a", count: 30, hits: 20, hitRate: 67 },
      ],
      daily: [
        { day: "2026-04-20T00:00:00.000Z", total: 10, hits: 8, hitRate: 80, avgLatency: 300 },
      ],
      topQueries: [
        { query: "如何配置 WebDAV", count: 12, hits: 10, hitRate: 83 },
      ],
    });

    await renderPage();

    expect(container.textContent).toContain("viking://docs/a");

    const queryButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Query 热点"),
    );
    expect(queryButton).toBeTruthy();

    await act(async () => {
      queryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("如何配置 WebDAV");
    expect(container.textContent).not.toContain("viking://docs/a");
  });
});
