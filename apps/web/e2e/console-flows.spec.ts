import { expect, test, type Page, type Route } from "@playwright/test";

type MockUser = {
    id: string;
    username: string;
    role: string;
    tenantId: string | null;
};

type MockTenant = {
    id: string;
    tenantId: string;
    displayName: string;
    status: string;
    isolationLevel: string;
    quota: Record<string, unknown> | null;
    dbConfig: Record<string, unknown> | null;
    ovConfig: Record<string, unknown> | null;
    createdAt: string;
};

type MockKnowledgeBase = {
    id: string;
    name: string;
    tenantId: string;
    status: string;
    docCount: number;
    vectorCount: number;
    createdAt: string;
    description?: string;
    vikingUri?: string;
};

type MockCapabilityKey = {
    id: string;
    name: string;
    apiKey: string;
    lastUsedAt: string | null;
    createdAt: string;
};

type MockState = {
    usersByToken: Record<string, MockUser>;
    tenants: MockTenant[];
    knowledgeBases: MockKnowledgeBase[];
    capabilityKeys: MockCapabilityKey[];
    searchLogId: string;
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
            "tenant-operator-token": {
                id: "user-tenant-operator",
                username: "tenant.operator",
                role: "tenant_operator",
                tenantId: "tenant-alpha",
            },
            "tenant-viewer-token": {
                id: "user-tenant-viewer",
                username: "tenant.viewer",
                role: "tenant_viewer",
                tenantId: "tenant-alpha",
            },
        },
        tenants: [
            {
                id: "tenant-alpha-id",
                tenantId: "tenant-alpha",
                displayName: "租户 Alpha",
                status: "active",
                isolationLevel: "medium",
                quota: null,
                dbConfig: null,
                ovConfig: null,
                createdAt: "2026-04-26T00:00:00.000Z",
            },
        ],
        knowledgeBases: [
            {
                id: "kb-seed",
                name: "默认知识库",
                tenantId: "tenant-alpha",
                status: "active",
                docCount: 4,
                vectorCount: 12,
                createdAt: "2026-04-26T00:00:00.000Z",
                vikingUri: "viking://resources/default/",
            },
        ],
        capabilityKeys: [
            {
                id: "key-seed",
                name: "已有自动化 Key",
                apiKey: "seed-key-value",
                lastUsedAt: "2026-04-26T02:00:00.000Z",
                createdAt: "2026-04-26T00:00:00.000Z",
            },
        ],
        searchLogId: "search-log-1",
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
    await page.route("**/api/v1/mcp/sse**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: "event: ping\ndata: ok\n\n",
        });
    });

    await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();
        const headers = request.headers();
        const authHeader = headers["authorization"] ?? headers["Authorization"] ?? "";
        const auth = authHeader.replace("Bearer ", "");
        const currentUser = state.usersByToken[auth || state.activeToken || ""];

        if (path.includes("/tenants/check-auth/") && method === "GET") {
            return jsonResponse(route, { oidc: false, feishu: false, ldap: false, dingtalk: false });
        }

        if (path.endsWith("/auth/login") && method === "POST") {
            const body = await readBody(route);
            const token = body.tenantCode === "OV"
                ? "super-admin-token"
                : body.username === "tenant.operator"
                    ? "tenant-operator-token"
                    : body.username === "tenant.viewer"
                        ? "tenant-viewer-token"
                        : "tenant-admin-token";
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
                kbCount: state.knowledgeBases.length,
                taskCount: 8,
                searchCount: 24,
                zeroCount: 3,
                failedTasks: 1,
                runningTasks: 2,
                recentTasks: [
                    {
                        status: "running",
                        sourceType: "url",
                        targetUri: "viking://resources/default/",
                        createdAt: "2026-04-26T03:00:00.000Z",
                    },
                ],
                health: { ok: true, message: "核心引擎状态正常" },
                queue: null,
            });
        }

        if (path === "/api/v1/search/analysis" && method === "GET") {
            return jsonResponse(route, {
                total: 24,
                zeroResults: 3,
                zeroRate: "12.5",
                noAnswerLogs: [],
                topQueries: [],
                daily: [],
            });
        }

        if (path === "/api/v1/tenants" && method === "GET") {
            return jsonResponse(route, state.tenants);
        }

        if (path.endsWith("/auth/switch-role") && method === "POST") {
            state.activeToken = "tenant-admin-token";
            return jsonResponse(route, {
                accessToken: "tenant-admin-token",
                tenantName: "租户 Alpha",
            });
        }

        if (path === "/api/v1/knowledge-bases" && method === "GET") {
            return jsonResponse(route, state.knowledgeBases);
        }

        if (path === "/api/v1/knowledge-bases" && method === "POST") {
            const body = await readBody(route);
            state.knowledgeBases.push({
                id: "kb-created",
                name: String(body.name ?? "新知识库"),
                tenantId: String(body.tenantId ?? "tenant-alpha"),
                status: "active",
                docCount: 0,
                vectorCount: 0,
                createdAt: "2026-04-26T04:00:00.000Z",
                description: String(body.description ?? ""),
                vikingUri: String(body.vikingUri ?? ""),
            });
            return jsonResponse(route, { ok: true }, 201);
        }

        if (path === "/api/v1/knowledge-bases/kb-created" && method === "PATCH") {
            const body = await readBody(route);
            state.knowledgeBases = state.knowledgeBases.map((item) =>
                item.id === "kb-created" ? { ...item, ...body } : item,
            );
            return jsonResponse(route, { ok: true });
        }

        if (path === "/api/v1/knowledge-bases/kb-created" && method === "DELETE") {
            state.knowledgeBases = state.knowledgeBases.filter((item) => item.id !== "kb-created");
            return jsonResponse(route, { ok: true });
        }

        if (path === "/api/v1/search/find" && method === "POST") {
            const body = await readBody(route);
            return jsonResponse(route, {
                resources: [
                    {
                        uri: "viking://docs/webdav",
                        title: "WebDAV 配置指南",
                        content: `关于 ${body.query ?? "检索问题"} 的结果说明`,
                        score: 0.91,
                        stage1Score: 0.67,
                        reranked: true,
                    },
                ],
                latencyMs: 88,
                logId: state.searchLogId,
                rerankApplied: body.useRerank !== false,
            });
        }

        if (path === `/api/v1/search/logs/${state.searchLogId}/feedback` && method === "POST") {
            return jsonResponse(route, { ok: true });
        }

        if (path === "/api/v1/mcp/keys" && method === "GET") {
            return jsonResponse(route, state.capabilityKeys);
        }

        if (path === "/api/v1/mcp/keys" && method === "POST") {
            const body = await readBody(route);
            state.capabilityKeys.push({
                id: "key-created",
                name: String(body.name ?? "新 Key"),
                apiKey: "ovk-created-secret",
                lastUsedAt: null,
                createdAt: "2026-04-26T05:00:00.000Z",
            });
            return jsonResponse(route, { apiKey: "ovk-created-secret" }, 201);
        }

        if (path === "/api/v1/mcp/keys/key-created" && method === "DELETE") {
            state.capabilityKeys = state.capabilityKeys.filter((item) => item.id !== "key-created");
            return jsonResponse(route, { ok: true });
        }

        if (path === "/api/v1/auth/credential-options" && method === "GET") {
            return jsonResponse(route, {
                data: {
                    capabilities: [
                        {
                            channel: "mcp",
                            credentialType: "session_key",
                            issueEndpoint: "/api/v1/auth/session-key",
                            ttlSeconds: 3600,
                            recommendedFor: ["mcp"],
                        },
                        {
                            channel: "mcp",
                            credentialType: "api_key",
                            issueEndpoint: "/api/v1/auth/client-credentials",
                            ttlSeconds: null,
                            recommendedFor: ["mcp", "cli"],
                        },
                    ],
                },
            });
        }

        return jsonResponse(route, {});
    });
}

async function login(page: Page, tenantCode: string, username: string, password: string) {
    await page.goto("/login");
    const tenantInput = page.getByPlaceholder("请输入租户 ID");
    const usernameInput = page.getByPlaceholder("请输入用户名");
    const passwordInput = page.getByPlaceholder("••••••••");

    await tenantInput.fill(tenantCode);
    await usernameInput.fill(username);
    await passwordInput.fill(password);
    await expect(tenantInput).toHaveValue(tenantCode);
    await expect(usernameInput).toHaveValue(username);
    await expect(passwordInput).toHaveValue(password);
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

test("tenant_admin 端到端覆盖知识库、搜索与 MCP key 管理", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);

    await login(page, "alpha", "tenant.admin", "secret");
    await expect(page).toHaveURL(/\/console\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "租户工作台" })).toBeVisible();

    await page.goto("/console/knowledge-bases/new");
    await page.getByPlaceholder("e.g. 产品说明书与开发规范_V2").fill("测试知识库");
    await page.getByPlaceholder("default", { exact: true }).fill("tenant-alpha");
    await page.getByPlaceholder("viking://resources/default/").fill("viking://resources/testing/");
    await page.getByPlaceholder("[输入关于此知识集群的功能边界与数据来源说明...]").fill("供 E2E 使用");
    await page.getByRole("button", { name: ">> DEPLOY_CLUSTER" }).click();

    await expect(page).toHaveURL(/\/console\/knowledge-bases$/);
    await expect(page.getByTestId("knowledge-base-name-kb-created")).toHaveText("测试知识库");

    await page.evaluate(async () => {
        await fetch("/api/v1/knowledge-bases/kb-created", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "测试知识库-已更新" }),
        });
    });
    await page.reload();
    await expect(page.getByTestId("knowledge-base-name-kb-created")).toHaveText("测试知识库-已更新");

    await page.evaluate(async () => {
        await fetch("/api/v1/knowledge-bases/kb-created", {
            method: "DELETE",
        });
    });
    await page.reload();
    await expect(page.getByTestId("knowledge-base-name-kb-created")).toHaveCount(0);

    await page.goto("/console/search");
    await page.getByPlaceholder("输入检索问题，例如：如何配置 WebDAV？").fill("WebDAV 配置");
    await page.getByRole("button", { name: "执行检索" }).click();
    await expect(page.getByText("WebDAV 配置指南")).toBeVisible();
    await expect(page.getByText("Rerank 已启用")).toBeVisible();

    await page.goto("/console/mcp");
    await page.getByRole("button", { name: "生成新 Key" }).click();
    await page.getByPlaceholder("例如：Cursor-Office / Claude-Local").fill("E2E Key");
    await page.getByRole("button", { name: "生成 Key" }).click();
    await expect(page.locator("code").filter({ hasText: /^ovk-created-secret$/ })).toBeVisible();

    await page.getByRole("button", { name: "测试当前连接" }).first().click();
    await expect(page.getByText("连接测试通过").first()).toBeVisible();
});

test("super_admin 可进入平台并切换到租户控制台", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);

    await login(page, "OV", "root", "secret");
    await expect(page).toHaveURL(/\/platform\/dashboard$/);
    await expect(page.getByRole("heading", { name: "平台总览" })).toBeVisible();

    await page.goto("/platform/tenants");
    await expect(page.getByText("租户 Alpha")).toBeVisible();
    await page.getByRole("button", { name: "切换到租户 租户 Alpha" }).click();
    await expect(page).toHaveURL(/\/console\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading", { name: "租户工作台" })).toBeVisible();
});

test("tenant_admin、tenant_operator、tenant_viewer 均被限制在租户控制台", async ({ page }) => {
    const state = createMockState();
    await installMockApi(page, state);

    const cases = [
        { username: "tenant.admin", roleLabel: "tenant_admin" },
        { username: "tenant.operator", roleLabel: "tenant_operator" },
        { username: "tenant.viewer", roleLabel: "tenant_viewer" },
    ];

    for (const item of cases) {
        await login(page, "alpha", item.username, "secret");
        await expect(page).toHaveURL(/\/console\/dashboard$/);
        await expect(page.getByRole("main").getByRole("heading", { name: "租户工作台" })).toBeVisible();

        await page.goto("/platform/dashboard");
        await expect(page).toHaveURL(/\/console\/dashboard$/);
        await expect(page.getByRole("main").getByRole("heading", { name: "租户工作台" })).toBeVisible();
        await expect(page.getByRole("heading", { name: item.username })).toBeVisible();

        await page.goto("/login");
    }
});
