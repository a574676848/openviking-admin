import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnalysisPage from "./page";

const getMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

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
    root.render(<AnalysisPage />);
    await Promise.resolve();
  });
}

describe("AnalysisPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("加载失败时展示页面级失败态和重试入口", async () => {
    getMock
      .mockRejectedValueOnce(new Error("分析服务暂不可用"))
      .mockResolvedValueOnce(null);

    await renderPage();

    expect(container.textContent).toContain("无答案洞察加载失败");
    expect(container.textContent).toContain("分析服务暂不可用");
    expect(container.textContent).toContain("重新加载");
  });

  it("缺口样本支持导入、验证和关联知识库入口", async () => {
    getMock
      .mockResolvedValueOnce({
        total: 10,
        noAnswerLogs: [
          {
            id: "log-1",
            query: "WebDAV 配置失败",
            scope: "viking://webdav",
            tenantId: "tenant-a",
            latencyMs: 120,
            createdAt: "2026-04-26T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        overview: {
          total: 10,
          zeroCount: 3,
        },
        topQueries: [],
        daily: [],
      })
      .mockResolvedValueOnce([
        {
          id: "kb-1",
          name: "WebDAV 知识库",
          tenantId: "tenant-a",
        },
      ]);

    await renderPage();

    expect(container.textContent).toContain("缺口处理工作台");
    expect(container.textContent).toContain("关联知识库");
    expect(container.textContent).toContain("WebDAV 知识库");

    const validateButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("补充资源后验证"),
    );
    const openTreeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("打开知识树"),
    );

    expect(validateButton).toBeTruthy();
    expect(openTreeButton).toBeTruthy();

    await act(async () => {
      validateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith(
      "/console/search?query=WebDAV%20%E9%85%8D%E7%BD%AE%E5%A4%B1%E8%B4%A5&uri=viking%3A%2F%2Fwebdav",
    );

    await act(async () => {
      openTreeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(pushMock).toHaveBeenCalledWith("/console/knowledge-tree?kbId=kb-1");
  });

  it("深度统计缺失时仍能用基础分析数据兜底渲染", async () => {
    getMock
      .mockResolvedValueOnce({
        total: 4,
        noAnswerLogs: [
          {
            id: "log-1",
            query: "权限配置",
            scope: "viking://auth",
            tenantId: "tenant-a",
            latencyMs: 80,
            createdAt: "2026-04-26T00:00:00.000Z",
          },
        ],
      })
      .mockRejectedValueOnce(new Error("深度统计暂不可用"))
      .mockResolvedValueOnce([]);

    await renderPage();

    expect(container.textContent).toContain("总检索量");
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("零命中");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("空窗占比");
    expect(container.textContent).toContain("25.0%");
    expect(container.textContent).toContain("高频问题 [0]");
  });
});
