import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "./apiClient";
import { TOKEN_STORAGE_KEY } from "./session";

describe("apiClient", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("会将普通路径规范化到 /api/v1 并透传 token", async () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "token-123");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "kb-1" }],
          meta: {},
          traceId: "trace-1",
          error: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.get<{ id: string }[]>("/knowledge-bases");

    expect(result).toEqual([{ id: "kb-1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/knowledge-bases");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("会保留显式传入的 /api/v1 路径", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, items: [1, 2] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiClient.get<{ ok: boolean; items: number[] }>("/api/v1/search/debug");

    expect(result).toEqual({ ok: true, items: [1, 2] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/search/debug");
  });

  it("401 时会清理会话并返回空对象", async () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "expired");
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign: assignMock },
      writable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
          statusText: "Unauthorized",
        }),
      ),
    );

    const result = await apiClient.get("/auth/profile");

    expect(result).toEqual({});
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it("非 401 错误会抛出 ApiError 并保留错误消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "KB_NOT_FOUND",
              message: "知识库不存在",
              statusCode: 404,
            },
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
            statusText: "Not Found",
          },
        ),
      ),
    );

    await expect(apiClient.get("/knowledge-bases/kb-404")).rejects.toMatchObject({
      status: 404,
      message: "知识库不存在",
    });
  });

  it("204 响应会返回空对象", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
        }),
      ),
    );

    const result = await apiClient.delete("/knowledge-bases/kb-1");

    expect(result).toEqual({});
  });
});
