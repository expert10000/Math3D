import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/graph2d-web",
  // Live Docker is required in its Linux CI job, using playwright.sage-live-docker.config.ts.
  testIgnore: ["**/sageLiveDocker.spec.ts"],
  timeout: 120_000, workers: 1,
  outputDir: "test-results/graph2d-web", reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", browserName: "chromium", viewport: { width: 1440, height: 850 }, trace: "retain-on-failure" },
  projects: [{ name: "en-US-UTC", use: { locale: "en-US", timezoneId: "UTC" } },
    { name: "pl-PL-Auckland", use: { locale: "pl-PL", timezoneId: "Pacific/Auckland" } }],
  webServer: [
    { command: "node apps/web/server/worker-proxy.cjs", url: "http://127.0.0.1:8787/api/worker/diagnostics", reuseExistingServer: false, timeout: 30_000 },
    { command: "npm --prefix renderer run preview:web", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 30_000 },
  ],
});
