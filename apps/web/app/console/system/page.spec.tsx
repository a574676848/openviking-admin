import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemPage from "./page";

const getMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
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

describe("Console SystemPage", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    getMock.mockReset();
    replaceMock.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("已启用自定义 OV 的租户应展示完整系统状态指标", async () => {
    getMock
      .mockResolvedValueOnce({
        hasCustomOvConfig: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        openviking: {
          status: "ok",
          healthy: true,
          version: "0.3.9",
          auth_mode: "api_key",
        },
        resolvedBaseUrl: "http://tenant-ov.local",
      })
      .mockResolvedValueOnce({
        queue: {
          Embedding: 3,
          Semantic: 1,
          "Semantic-Nodes": 0,
        },
        vikingdb: {
          collections: [
            { Collection: "context", "Index Count": "1", "Vector Count": "4032", Status: "OK" },
          ],
          totalCollections: 1,
          totalIndexCount: 1,
          totalVectorCount: 4032,
        },
      });

    await renderPage();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("异步任务队列");
    expect(container.textContent).toContain("向量总数");
    expect(container.textContent).toContain("实时队列负荷");
    expect(container.textContent).toContain("底层图存储统计");
    expect(container.textContent).toContain("4,032");
  });

  it("未启用自定义 OV 的租户进入页面时应回到工作台", async () => {
    getMock.mockResolvedValueOnce({
      hasCustomOvConfig: false,
    });

    await renderPage();

    expect(replaceMock).toHaveBeenCalledWith("/console/dashboard");
  });
});
