import { defineConfig } from "@playwright/test";

// Explicit opt-in: requires the real local SageMath Docker service on port 8767.
export default defineConfig({
  testDir: "./tests/graph2d-web",
  testMatch: "sageLiveDocker.spec.ts",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5183",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node apps/web/server/worker-proxy.cjs",
      url: "http://127.0.0.1:8793/api/sage/health",
      timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_PORT: "8793" },
    },
    {
      command: "node renderer/node_modules/vite/bin/vite.js renderer --host 127.0.0.1 --port 5183 --strictPort",
      url: "http://127.0.0.1:5183/",
      timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_TARGET: "http://127.0.0.1:8793" },
    },
  ],
});
