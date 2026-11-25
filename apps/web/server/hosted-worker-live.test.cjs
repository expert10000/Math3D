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

test("hosted Node route executes a real Python VTK job with identity isolation", { timeout: 60000 }, async () => {
  const port = await unusedPort();
  const directory = mkdtempSync(join(tmpdir(), "math3d-hosted-worker-live-"));
  const edgeToken = "live-test-edge-token-0000000000000000000";
  const owner = "a".repeat(64);
  const other = "b".repeat(64);
  const child = spawn(process.execPath, [join(__dirname, "worker-proxy.cjs")], {
    env: { ...process.env, MATH3D_WEB_WORKER_PROXY_HOST: "127.0.0.1",
      MATH3D_WEB_WORKER_PROXY_PORT: String(port), MATH3D_WEB_EDGE_TOKEN: edgeToken,
      MATH3D_MOBILE_PAIR_TOKEN: "", MATH3D_WORKER_MODE: "python",
      MATH3D_PYTHON: process.env.MATH3D_PYTHON || (process.platform === "win32" ? "python" : "python3"),
      MATH3D_SAGE_WEB_AUTH_MODE: "hosted", MATH3D_SAGE_WEB_ORIGIN: "https://app.math3dlab.com",
      MATH3D_SAGE_WEB_SESSION_SECRET: "live-session-secret-00000000000000000000",
      MATH3D_SAGE_WEB_USERS_JSON: JSON.stringify([{
        id: "test", accessKey: "live-access-key-000000000000000000000",
      }]), MATH3D_SAGE_WEB_STATE_FILE: join(directory, "policy.json") },
    stdio: "ignore", windowsHide: true,
  });
  const request = (path, user, init = {}) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...init, headers: { "x-math3d-edge-token": edgeToken,
      ...(user ? { "x-math3d-worker-user": user } : {}), ...init.headers },
  });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode != null) throw new Error(`Proxy exited with ${child.exitCode}`);
      try { if ((await request("/api/sage-private/session")).status === 200) { ready = true; break; } }
      catch { /* listener starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "proxy should start");
    const versionResponse = await request("/api/worker/cgal/version", owner);
    assert.equal(versionResponse.status, 200);
    const version = await versionResponse.json();
    assert.equal(version.ok, true);
    assert.equal(version.serverVersion, "2.0.0");

    const positions = Buffer.from(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]).buffer).toString("base64");
    const indices = Buffer.from(new Uint32Array([
      0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3,
    ]).buffer).toString("base64");
    const cgalBody = { positions_b64: positions, indices_b64: indices, options: {} };
    const validateResponse = await request("/api/worker/cgal/validate", owner, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...cgalBody, jobId: "live-cgal-validate" }),
    });
    assert.equal(validateResponse.status, 200);
    const validation = await validateResponse.json();
    assert.equal(validation.ok, true, JSON.stringify(validation));
    assert.equal(validation.vertexCount, 4);
    assert.equal(validation.faceCount, 4);
    const repairResponse = await request("/api/worker/cgal/repair", owner, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...cgalBody, jobId: "live-cgal-repair" }),
    });
    assert.equal(repairResponse.status, 200);
    const repair = await repairResponse.json();
    assert.equal(repair.ok, true, JSON.stringify(repair));
    assert.equal(repair.vertexCount, 4);
    assert.equal(repair.triCount, 4);

    const body = { operation: "vtk.preview-implicit", inputHash: "live-test-sphere",
      sceneId: "live-test-scene", sceneSchemaVersion: 1,
      parameters: { expr: "x*x+y*y+z*z-1", iso: 0,
        domain: { min: [-2, -2, -2], max: [2, 2, 2] }, resolution: 24 } };
    const submitted = await request("/api/worker/jobs", owner, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(submitted.status, 202);
    const job = await submitted.json();
    assert.match(job.jobId, /.+/);
    assert.equal((await request(`/api/worker/jobs/${job.jobId}`, other)).status, 404);
    assert.equal((await request(`/api/worker/jobs/${job.jobId}/cancel`, other,
      { method: "POST" })).status, 404);
    let result;
    for (let i = 0; i < 100; i++) {
      result = await (await request(`/api/worker/jobs/${job.jobId}`, owner)).json();
      if (["succeeded", "failed", "cancelled"].includes(result.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(result.status, "succeeded", JSON.stringify(result));
    assert.equal(result.result.ok, true);
    assert.ok(result.result.vertexCount > 0);
    const diagnostics = await (await request("/api/worker/diagnostics", owner)).json();
    assert.equal(diagnostics.available, true);
  } finally {
    child.kill();
    if (child.exitCode == null) await new Promise((resolve) => child.once("exit", resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
