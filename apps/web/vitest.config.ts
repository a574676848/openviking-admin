import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.spec.ts", "**/*.spec.tsx"],
    exclude: ["e2e/**"],
    clearMocks: true,
    restoreMocks: true,
  },
});
