import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    reporter: "line",
    use: {
        baseURL: "http://127.0.0.1:6002",
        trace: "on-first-retry",
    },
    webServer: {
        command: "pnpm build && pnpm start",
        url: "http://127.0.0.1:6002",
        reuseExistingServer: true,
        timeout: 120000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
