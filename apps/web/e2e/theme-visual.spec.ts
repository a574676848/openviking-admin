import { expect, test, type Page, type Route } from "@playwright/test";

type MockUser = {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
};

type MockState = {
  usersByToken: Record<string, MockUser>;
  activeToken: string | null;
};

function createMockState(): MockState {
  return {
    usersByToken: {
      "super-admin-token": {
        id: "user-super",
        username: "root",
        role: "super_admin",
        tenantId: null,
      },
      "tenant-admin-token": {
        id: "user-tenant-admin",
        username: "tenant.admin",
        role: "tenant_admin",
        tenantId: "tenant-alpha",
      },
    },
    activeToken: null,
  };
}

function jsonResponse(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function readBody(route: Route) {
  const raw = route.request().postData();
  return raw ? JSON.parse(raw) : {};
}

async function installMockApi(page: Page, state: MockState) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = request.headers();
    const authHeader = headers.authorization ?? headers.Authorization ?? "";
    const auth = authHeader.replace("Bearer ", "");
    const currentUser = state.usersByToken[auth || state.activeToken || ""];

    if (path.endsWith("/auth/login") && method === "POST") {
      const body = await readBody(route);
      const token = body.tenantCode === "OV" ? "super-admin-token" : "tenant-admin-token";
      state.activeToken = token;
      return jsonResponse(route, {
        accessToken: token,
        user: state.usersByToken[token],
      });
    }

    if (path.endsWith("/auth/me") && method === "GET") {
      if (!currentUser) {
        return jsonResponse(route, { message: "未登录" }, 401);
      }
      return jsonResponse(route, currentUser);
    }

    if (path === "/api/v1/system/dashboard" && method === "GET") {
      return jsonResponse(route, {
        kbCount: 8,
        taskCount: 1240,
        searchCount: 64,
        zeroCount: 6,
        failedTasks: 1,
        runningTasks: 2,
        recentTasks: [
          {
            status: "running",
            sourceType: "url",
            targetUri: "viking://resources/default/",
            createdAt: "2026-04-26T03:00:00.000Z",
          },
          {
            status: "done",
            sourceType: "webdav",
            targetUri: "viking://resources/reference/",
            createdAt: "2026-04-26T04:15:00.000Z",
          },
        ],
        health: { ok: true, message: "核心引擎状态正常" },
        queue: {
          Embedding: 2,
          Semantic: 1,
          "Semantic-Nodes": 0,
        },
      });
    }

    if (path === "/api/v1/system/health" && method === "GET") {
      return jsonResponse(route, {
        ok: true,
        openviking: { status: "ok", healthy: true, version: "0.3.9" },
        resolvedBaseUrl: "viking-engine.local:1933",
        dbPool: { totalCount: 12 },
      });
    }

    if (path === "/api/v1/system/stats" && method === "GET") {
      return jsonResponse(route, {
        queue: {
          Embedding: 2,
          Semantic: 1,
          "Semantic-Nodes": 0,
        },
        vikingdb: {
          collections: [
            { Collection: "context", "Index Count": "1", "Vector Count": "6400", Status: "OK" },
          ],
          totalCollections: 1,
          totalIndexCount: 1,
          totalVectorCount: 6400,
        },
      });
    }

    if (path === "/api/v1/users" && method === "GET") {
      return jsonResponse(route, [
        {
          id: "user-super",
          username: "root",
          role: "super_admin",
          tenantId: null,
          active: true,
          createdAt: "2026-04-26T02:00:00.000Z",
        },
        {
          id: "user-tenant-admin",
          username: "tenant.admin",
          role: "tenant_admin",
          tenantId: "tenant-alpha",
          active: true,
          createdAt: "2026-04-26T02:30:00.000Z",
        },
      ]);
    }

    if (path === "/api/v1/search/analysis" && method === "GET") {
      return jsonResponse(route, {
        total: 64,
        zeroResults: 6,
        zeroRate: "9.4",
        noAnswerLogs: [],
        topQueries: [],
        daily: [],
      });
    }

    if (path.includes("/tenants/check-auth/") && method === "GET") {
      return jsonResponse(route, { oidc: false, feishu: false, ldap: false, dingtalk: false });
    }

    return jsonResponse(route, {});
  });
}

async function freezeVisualNoise(page: Page) {
  await page.addInitScript(() => {
    const fixedNow = new Date("2026-04-26T12:00:00.000Z").valueOf();
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedNow);
          return;
        }
        super(args[0] as string | number | Date);
      }

      static now() {
        return fixedNow;
      }
    }

    Object.setPrototypeOf(MockDate, RealDate);
    // @ts-expect-error replace global Date for deterministic screenshots
    window.Date = MockDate;
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function login(page: Page, tenantCode: string, username: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("请输入租户 ID").fill(tenantCode);
  await page.getByPlaceholder("请输入用户名").fill(username);
  await page.getByPlaceholder("••••••••").fill(password);
  const targetPath = await page.evaluate(async (payload) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    sessionStorage.setItem("ov_token", data.accessToken);
    sessionStorage.setItem("ov_token_iat", String(Date.now()));
    sessionStorage.setItem("ov_user", JSON.stringify(data.user));
    return data.user?.role === "super_admin" ? "/platform/dashboard" : "/console/dashboard";
  }, { tenantCode, username, password });
  await page.goto(targetPath);
}

async function openThemeMenu(page: Page) {
  await page.getByRole("button", { name: "切换界面主题" }).click();
  await expect(page.getByRole("menu", { name: "主题选项" })).toBeVisible();
}

async function switchTheme(page: Page, label: string) {
  await openThemeMenu(page);
  await page.getByRole("menuitemradio", { name: new RegExp(label) }).click();
}

test.describe("P1-10 主题视觉基线", () => {
  test.beforeEach(async ({ page }) => {
    const state = createMockState();
    await freezeVisualNoise(page);
    await installMockApi(page, state);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.addStyleTag({
      content: `
        *,
        *::before,
        *::after {
          transition: none !important;
          animation: none !important;
          caret-color: transparent !important;
        }
      `,
    });
  });

  test("console dashboard 在 neo 与 swiss 主题下保持稳定布局", async ({ page }) => {
    await login(page, "alpha", "tenant.admin", "secret");
    await expect(page).toHaveURL(/\/console\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "租户工作台" })).toBeVisible();
    await page.waitForTimeout(200);

    await expect(page.getByRole("main")).toHaveScreenshot("console-dashboard-neo.png");

    await switchTheme(page, "浩瀚星空");
    await expect(page.locator("html")).toHaveClass(/theme-starry/);
    await page.waitForTimeout(200);

    await expect(page.getByRole("main")).toHaveScreenshot("console-dashboard-starry.png");
  });

  test("platform dashboard 在 starry 与 neo 主题下保持稳定布局", async ({ page }) => {
    await login(page, "OV", "root", "secret");
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "平台总览" })).toBeVisible();
    await page.waitForTimeout(400);

    await expect(page.getByRole("main")).toHaveScreenshot("platform-dashboard-starry.png");

    await switchTheme(page, "星智流光");
    await expect(page.locator("html")).not.toHaveClass(/theme-starry/);
    await page.waitForTimeout(400);

    await expect(page.getByRole("main")).toHaveScreenshot("platform-dashboard-neo.png");
  });

  test("console system 在 neo 与 starry 主题下保持稳定布局", async ({ page }) => {
    await login(page, "alpha", "tenant.admin", "secret");
    await page.goto("/console/system");
    await expect(page).toHaveURL(/\/console\/system$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "系统运行状态" })).toBeVisible();
    await page.waitForTimeout(250);

    await expect(page.getByRole("main")).toHaveScreenshot("console-system-neo.png");

    await switchTheme(page, "浩瀚星空");
    await expect(page.locator("html")).toHaveClass(/theme-starry/);
    await page.waitForTimeout(250);

    await expect(page.getByRole("main")).toHaveScreenshot("console-system-starry.png");
  });

  test("platform users 在 starry 与 neo 主题下保持稳定布局", async ({ page }) => {
    await login(page, "OV", "root", "secret");
    await page.goto("/platform/users");
    await expect(page).toHaveURL(/\/platform\/users$/);
    await expect(page.getByRole("main")).toContainText("全局用户治理");
    await page.waitForTimeout(400);

    await expect(page.getByRole("main")).toHaveScreenshot("platform-users-starry.png");

    await switchTheme(page, "星智流光");
    await expect(page.locator("html")).not.toHaveClass(/theme-starry/);
    await page.waitForTimeout(400);

    await expect(page.getByRole("main")).toHaveScreenshot("platform-users-neo.png");
  });
});
