import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("WebDAV 配置接口", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("使用 BACKEND_URL 生成客户端 WebDAV 地址", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com/base");

    const response = await GET(
      new NextRequest(
        "http://localhost/console/webdav/config?tenantId=tenant-demo",
      ),
    );

    await expect(response.json()).resolves.toEqual({
      webdavUrl: "https://backend.example.com/webdav/tenant-demo/",
    });
  });

  it("缺少运行期地址时返回配置错误", async () => {
    vi.stubEnv("BACKEND_URL", "");

    const response = await GET(
      new NextRequest(
        "http://localhost/console/webdav/config?tenantId=tenant-demo",
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "服务端未配置 BACKEND_URL，无法生成 WebDAV 地址。",
    });
  });
});
