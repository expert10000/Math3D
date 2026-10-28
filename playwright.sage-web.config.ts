import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/graph2d-web",
  testMatch: "sagePolynomial.spec.ts",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5182",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30_000,
  },
  webServer: [
    {
      command: "node apps/web/server/worker-proxy.cjs",
      url: "http://127.0.0.1:8792/api/sage/health",
      timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_PORT: "8792" },
    },
    {
      command: "node renderer/node_modules/vite/bin/vite.js renderer --host 127.0.0.1 --port 5182 --strictPort",
      url: "http://127.0.0.1:5182/",
      timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_TARGET: "http://127.0.0.1:8792" },
    },
  ],
});
