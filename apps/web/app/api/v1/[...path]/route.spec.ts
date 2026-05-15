import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("/api/v1 代理接口", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("会代理 /api/v1/auth/me 到后端服务", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:6001");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "user-1" }, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost:6002/api/v1/auth/me?fresh=1", {
        headers: { Authorization: "Bearer token-demo" },
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:6001/api/v1/auth/me?fresh=1"),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "manual",
      }),
    );
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Headers).get("authorization")).toBe("Bearer token-demo");
  });
});
