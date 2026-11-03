import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/sage-gateway",
  testMatch: "privateSage.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5185", browserName: "chromium",
    viewport: { width: 1440, height: 900 }, actionTimeout: 30_000 },
  webServer: [
    { command: "node apps/web/server/worker-proxy.cjs",
      url: "http://127.0.0.1:8795/api/sage-private/health", timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_PORT: "8795",
        MATH3D_SAGE_GATEWAY_URL: process.env.MATH3D_SAGE_GATEWAY_URL || "http://127.0.0.1:8770",
        MATH3D_SAGE_GATEWAY_TOKEN: process.env.MATH3D_SAGE_GATEWAY_TOKEN || "" } },
    { command: "node renderer/node_modules/vite/bin/vite.js renderer --host 127.0.0.1 --port 5185 --strictPort",
      url: "http://127.0.0.1:5185/", timeout: 30_000, reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_TARGET: "http://127.0.0.1:8795" } },
  ],
});
