import { describe, expect, it } from "vitest";
import { resolvePostLoginRoute } from "./page";

describe("resolvePostLoginRoute", () => {
  it("优先返回安全的 next 站点路由", () => {
    expect(resolvePostLoginRoute("/site/kb-1/doc/node-doc", "tenant_admin", "site")).toBe(
      "/site/kb-1/doc/node-doc",
    );
  });

  it("非法 next 值时回退默认后台首页", () => {
    expect(resolvePostLoginRoute("https://evil.example.com", "tenant_admin", "console")).toBe(
      "/console/dashboard",
    );
  });

  it("超级管理员无 next 时回退平台首页", () => {
    expect(resolvePostLoginRoute(null, "super_admin", "console")).toBe("/platform/dashboard");
  });

  it("知识空间模式无 next 时回退空间首页", () => {
    expect(resolvePostLoginRoute(null, "tenant_admin", "site")).toBe("/site");
  });
});
