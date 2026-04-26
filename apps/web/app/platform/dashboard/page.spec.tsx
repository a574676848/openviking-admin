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

describe("Platform DashboardPage", () => {
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

  it("加载失败时展示平台总览失败态", async () => {
    getMock.mockRejectedValueOnce(new Error("总览服务不可用")).mockResolvedValueOnce(null);

    await renderPage();

    expect(container.textContent).toContain("平台总览加载失败");
    expect(container.textContent).toContain("总览服务不可用");
  });

  it("成功加载后展示核心指标与系统采样流", async () => {
    getMock
      .mockResolvedValueOnce({
        kbCount: 8,
        taskCount: 1240,
        searchCount: 50,
        zeroCount: 5,
        failedTasks: 1,
        runningTasks: 2,
        recentTasks: [
          {
            targetUri: "https://docs.openviking.dev/runbook",
            createdAt: "2026-04-26T10:00:00.000Z",
            status: "done",
          },
          {
            sourceType: "webdav",
            createdAt: "2026-04-26T11:00:00.000Z",
            status: "running",
          },
        ],
        health: { ok: true, message: "ok" },
        queue: { Embedding: 1, Semantic: 0, "Semantic-Nodes": 0 },
      })
      .mockResolvedValueOnce(null);

    await renderPage();

    expect(container.textContent).toContain("平台总览");
    expect(container.textContent).toContain("向量总量");
    expect(container.textContent).toContain("活跃租户");
    expect(container.textContent).toContain("全局命中率");
    expect(container.textContent).toContain("系统采样流");
    expect(container.textContent).toContain("系统守望者");
    expect(container.textContent).toContain("https://docs.openviking.dev/runbook");
    expect(container.textContent).toContain("webdav");
    expect(container.textContent).toContain("核心在线");
  });
});
