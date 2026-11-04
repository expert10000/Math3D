import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const certDir = mkdtempSync(join(tmpdir(), "math3d-sage-edge-"));
const key = join(certDir, "key.pem");
const cert = join(certDir, "cert.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
  "-out", cert, "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
process.on("exit", () => rmSync(certDir, { recursive: true, force: true }));

export default defineConfig({
  testDir: "./tests/sage-gateway",
  testMatch: "httpsEdge.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "https://127.0.0.1:8443", browserName: "chromium",
    ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, actionTimeout: 30_000 },
  webServer: {
    command: "node tests/sage-gateway/https-edge-harness.cjs",
    url: "https://127.0.0.1:8443/__test/ready", ignoreHTTPSErrors: true,
    timeout: 30_000, reuseExistingServer: false,
    env: { MATH3D_SAGE_EDGE_TEST_KEY: key, MATH3D_SAGE_EDGE_TEST_CERT: cert,
      MATH3D_SAGE_GATEWAY_URL: process.env.MATH3D_SAGE_GATEWAY_URL || "http://127.0.0.1:8770",
      MATH3D_SAGE_GATEWAY_TOKEN: process.env.MATH3D_SAGE_GATEWAY_TOKEN || "",
      MATH3D_SAGE_WEB_SESSION_SECRET: "test-edge-session-secret-000000000000000000",
      MATH3D_SAGE_WEB_STATE_FILE: join(certDir, "policy.json"),
      MATH3D_SAGE_WEB_USERS_JSON: JSON.stringify([
        { id: "ada", accessKey: "test-edge-ada-access-key-00000000000000" },
        { id: "noether", accessKey: "test-edge-noether-access-key-000000000" },
      ]) },
  },
});
