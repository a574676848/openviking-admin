import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

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
    root.render(<DashboardPage />);
    await Promise.resolve();
  });
}

describe("Console DashboardPage", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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

  it("加载失败时展示租户工作台失败态", async () => {
    getMock
      .mockRejectedValueOnce(new Error("租户总览服务不可用"))
      .mockResolvedValueOnce(null);

    await renderPage();

    expect(container.textContent).toContain("租户工作台加载失败");
    expect(container.textContent).toContain("租户总览服务不可用");
  });

  it("成功加载后展示热门检索词与日检索曲线", async () => {
    getMock
      .mockResolvedValueOnce({
        kbCount: 5,
        taskCount: 38,
        searchCount: 24,
        zeroCount: 6,
        failedTasks: 2,
        runningTasks: 3,
        recentTasks: [
          {
            targetUri: "https://docs.openviking.dev/console",
            createdAt: "2026-04-28T08:00:00.000Z",
            status: "done",
          },
        ],
        health: { ok: true, message: "核心状态正常" },
      })
      .mockResolvedValueOnce({
        topQueries: [
          { query: "知识库接入", count: 12, hits: 10, hitRate: 83.3 },
          { query: "飞书导入", count: 9, hits: 7, hitRate: 77.8 },
          { query: "租户权限", count: 6, hits: 5, hitRate: 83.3 },
        ],
        daily: [
          { day: "2026-04-22", total: 3, hits: 2, hitRate: 66.7, avgLatency: 120 },
          { day: "2026-04-23", total: 5, hits: 4, hitRate: 80, avgLatency: 110 },
          { day: "2026-04-24", total: 6, hits: 5, hitRate: 83.3, avgLatency: 115 },
          { day: "2026-04-25", total: 8, hits: 7, hitRate: 87.5, avgLatency: 109 },
          { day: "2026-04-26", total: 7, hits: 5, hitRate: 71.4, avgLatency: 130 },
          { day: "2026-04-27", total: 9, hits: 8, hitRate: 88.9, avgLatency: 102 },
          { day: "2026-04-28", total: 11, hits: 9, hitRate: 81.8, avgLatency: 98 },
        ],
      });

    await renderPage();

    expect(container.textContent).toContain("租户工作台");
    expect(container.textContent).toContain("知识库数量");
    expect(container.textContent).toContain("核心健康度");
    expect(container.textContent).toContain("刷新");
    expect(container.textContent).toContain("热门检索词 Top 5");
    expect(container.textContent).toContain("日检索曲线");
    expect(container.textContent).toContain("知识库接入");
    expect(container.textContent).toContain("飞书导入");
    expect(container.textContent).toContain("租户权限");
    expect(container.querySelector('svg[aria-label="日检索曲线图"]')).not.toBeNull();
  });

  it("点击刷新按钮后应重新请求租户工作台数据", async () => {
    getMock
      .mockResolvedValueOnce({
        kbCount: 5,
        taskCount: 38,
        searchCount: 24,
        zeroCount: 6,
        failedTasks: 2,
        runningTasks: 3,
        recentTasks: [],
        health: { ok: true, message: "核心状态正常" },
      })
      .mockResolvedValueOnce({
        topQueries: [],
        daily: [],
      })
      .mockResolvedValueOnce({
        kbCount: 6,
        taskCount: 40,
        searchCount: 30,
        zeroCount: 7,
        failedTasks: 2,
        runningTasks: 4,
        recentTasks: [],
        health: { ok: true, message: "核心状态正常" },
      })
      .mockResolvedValueOnce({
        topQueries: [],
        daily: [],
      });

    await renderPage();

    const refreshButton = container.querySelector("button");
    expect(refreshButton?.textContent).toContain("刷新");

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(getMock).toHaveBeenCalledTimes(4);
    expect(getMock.mock.calls[2]?.[0]).toBe("/system/dashboard");
    expect(getMock.mock.calls[3]?.[0]).toBe("/search/stats-deep");
  });
});
