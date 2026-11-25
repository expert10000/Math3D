"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("hosted Node proxy rejects direct traffic and bounds worker users", async () => {
  const port = await unusedPort();
  const directory = mkdtempSync(join(tmpdir(), "math3d-hosted-edge-"));
  const secret = "edge-test-secret-000000000000000000000";
  const user = "a".repeat(64);
  const child = spawn(process.execPath, [join(__dirname, "worker-proxy.cjs")], {
    env: { ...process.env, MATH3D_WEB_WORKER_PROXY_HOST: "127.0.0.1",
      MATH3D_WEB_WORKER_PROXY_PORT: String(port), MATH3D_WEB_EDGE_TOKEN: secret,
      MATH3D_MOBILE_PAIR_TOKEN: "", MATH3D_SAGE_WEB_AUTH_MODE: "hosted",
      MATH3D_SAGE_WEB_ORIGIN: "https://app.math3dlab.com",
      MATH3D_SAGE_WEB_SESSION_SECRET: "session-test-secret-000000000000000000000",
      MATH3D_SAGE_WEB_USERS_JSON: JSON.stringify([{
        id: "test", accessKey: "access-test-key-00000000000000000000000",
      }]), MATH3D_SAGE_WEB_STATE_FILE: join(directory, "policy.json") },
    stdio: "ignore", windowsHide: true,
  });
  const url = `http://127.0.0.1:${port}`;
  const get = (path, headers = {}) => fetch(`${url}${path}`, { headers });
  const post = (path, headers = {}) => fetch(`${url}${path}`, { method: "POST", headers });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (child.exitCode != null) throw new Error(`Proxy exited with ${child.exitCode}`);
      try { const response = await get("/api/sage-private/session", { "x-math3d-edge-token": secret });
        if (response.status === 200) { ready = true; break; }
      } catch { /* waiting for listener */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    assert.equal((await get("/api/worker/diagnostics")).status, 401);
    assert.equal((await get("/api/worker/diagnostics", { "x-math3d-edge-token": secret })).status, 401);
    const headers = { "x-math3d-edge-token": secret, "x-math3d-worker-user": user };
    assert.equal((await get("/api/worker/diagnostics", headers)).status, 200);
    assert.equal((await post("/api/worker/cgal/stop", headers)).status, 403);
    for (let i = 0; i < 10; i++) assert.equal((await post("/api/worker/unknown", headers)).status, 404);
    const limited = await post("/api/worker/unknown", headers);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "worker_rate_limited");
    assert.equal((await get("/api/worker/diagnostics", headers)).status, 200);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
