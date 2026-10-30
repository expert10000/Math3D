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
  },
  webServer: {
    command: "node renderer/node_modules/vite/bin/vite.js renderer --host 127.0.0.1 --port 5183 --strictPort",
    url: "http://127.0.0.1:5183/",
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
