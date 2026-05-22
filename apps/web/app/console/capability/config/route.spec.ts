import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("Capability 配置接口", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("使用 BACKEND_URL 生成凭证中心 API 地址", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com/base");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      apiBaseUrl: "https://backend.example.com/api/v1",
      sseUrl: "https://backend.example.com/api/v1/mcp/sse",
    });
  });

  it("缺少运行期地址时返回配置错误", async () => {
    vi.stubEnv("BACKEND_URL", "");

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "服务端未配置 BACKEND_URL，无法生成凭证中心地址。",
    });
  });
});
