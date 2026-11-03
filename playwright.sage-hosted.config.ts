import { defineConfig } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const policyDir = mkdtempSync(join(tmpdir(), "math3d-sage-hosted-"));
process.on("exit", () => rmSync(policyDir, { recursive: true, force: true }));

export default defineConfig({
  testDir: "./tests/sage-gateway",
  testMatch: "hostedSage.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5186", browserName: "chromium",
    viewport: { width: 1440, height: 900 }, actionTimeout: 30_000 },
  webServer: [
    { command: "node apps/web/server/worker-proxy.cjs",
      url: "http://127.0.0.1:8796/api/sage-private/session", timeout: 30_000,
      reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_PORT: "8796",
        MATH3D_SAGE_GATEWAY_URL: process.env.MATH3D_SAGE_GATEWAY_URL || "http://127.0.0.1:8770",
        MATH3D_SAGE_GATEWAY_TOKEN: process.env.MATH3D_SAGE_GATEWAY_TOKEN || "",
        MATH3D_SAGE_WEB_AUTH_MODE: "hosted",
        MATH3D_SAGE_WEB_ORIGIN: "http://127.0.0.1:5186",
        MATH3D_SAGE_WEB_STATE_FILE: join(policyDir, "policy.json"),
        MATH3D_SAGE_WEB_SESSION_SECRET: "test-session-secret-000000000000000000000",
        MATH3D_SAGE_WEB_USERS_JSON: JSON.stringify([
          { id: "ada", accessKey: "test-ada-access-key-000000000000000000" },
          { id: "noether", accessKey: "test-noether-access-key-00000000000000" },
        ]) } },
    { command: "node renderer/node_modules/vite/bin/vite.js renderer --host 127.0.0.1 --port 5186 --strictPort",
      url: "http://127.0.0.1:5186/", timeout: 30_000, reuseExistingServer: false,
      env: { MATH3D_WEB_WORKER_PROXY_TARGET: "http://127.0.0.1:8796" } },
  ],
});
