import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/graph2d-web", testMatch: "unifiedProjects.spec.ts", timeout: 120_000, workers: 1,
  outputDir: "test-results/projects-web", reporter: "list",
  use: { baseURL: "http://127.0.0.1:4187", browserName: "chromium", viewport: { width: 1280, height: 844 }, actionTimeout: 30_000,
    trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "en-US-UTC", use: { locale: "en-US", timezoneId: "UTC" } },
    { name: "pl-PL-Auckland", use: { locale: "pl-PL", timezoneId: "Pacific/Auckland" } }],
  webServer: { command: "node renderer/node_modules/vite/bin/vite.js preview renderer --host 127.0.0.1 --port 4187 --strictPort --base / --outDir ../apps/web/dist",
    url: "http://127.0.0.1:4187", reuseExistingServer: false, timeout: 30_000, env: { MATH3D_WEB_WORKER_PROXY_ENABLED: "0" } },
});
