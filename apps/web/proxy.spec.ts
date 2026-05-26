import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy } from "./proxy";

describe("web proxy CSP", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("使用 BACKEND_URL 派生 HTTP 与 WebSocket connect-src", () => {
    vi.stubEnv("BACKEND_URL", "https://intra-t-op-knowledge-server.exexm.com");

    expect(buildContentSecurityPolicy()).toContain(
      "connect-src 'self' https://intra-t-op-knowledge-server.exexm.com wss://intra-t-op-knowledge-server.exexm.com",
    );
  });

  it("保留 CSP_CONNECT_SRC 额外白名单并支持通配域名", () => {
    vi.stubEnv(
      "CSP_CONNECT_SRC",
      "https://exexm.com https://*.exexm.com wss://exexm.com wss://*.exexm.com",
    );

    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("https://*.exexm.com");
    expect(csp).toContain("wss://*.exexm.com");
  });

  it("BACKEND_URL 优先于 NEXT_PUBLIC_BACKEND_URL", () => {
    vi.stubEnv("BACKEND_URL", "https://server.example.com");
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://public.example.com");

    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("https://server.example.com");
    expect(csp).not.toContain("https://public.example.com");
  });
});
