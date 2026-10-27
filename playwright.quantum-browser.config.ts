import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/quantum-browser", timeout: 120_000, workers: 1,
  outputDir: "test-results/quantum-browser", reporter: "list",
  use: { baseURL: "http://127.0.0.1:4189", browserName: "chromium",
    viewport: { width: 1280, height: 844 }, trace: "retain-on-failure" },
  webServer: { command: "node renderer/node_modules/vite/bin/vite.js preview renderer --host 127.0.0.1 --port 4189 --strictPort --base / --outDir ../apps/web/dist",
    url: "http://127.0.0.1:4189", reuseExistingServer: false, timeout: 30_000,
    env: { MATH3D_WEB_WORKER_PROXY_ENABLED: "0" } },
});
