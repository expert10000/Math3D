"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createGateway, DEFAULT_LIMITS } = require("./server.cjs");

const token = "test-private-gateway-credential-at-least-32-characters";
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => server.close(resolve));
const post = (url, path, body, authorized = true) => fetch(`${url}${path}`, { method: "POST",
  headers: { "content-type": "application/json", ...(authorized ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body) });

test("private Sage gateway authenticates, bounds operations, and reports typed quotas", async () => {
  const worker = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ available: true, status: "ok", engineVersion: "10.10",
      operations: ["sage.numberTheory.gcd", "sage.numberTheory.modInverse", "sage.console.execute"] }));
    if (req.url === "/run") { let raw = ""; req.on("data", (chunk) => { raw += chunk; }); req.on("end", () => {
      const body = JSON.parse(raw);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.10", operation: body.operation,
        success: body.params.a !== "2", latex: "", result: { value: "6" }, warnings: [],
        ...(body.params.a === "2" ? { error: "inverse does not exist" } : {}) }));
    }); }
  });
  const workerUrl = await listen(worker);
  const gateway = createGateway({ token, workerUrl, audit: () => {},
    limits: { ...DEFAULT_LIMITS, maxRequestsPerMinute: 2 } });
  const url = await listen(gateway);
  try {
    const denied = await fetch(`${url}/health`);
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, "unauthorized");
    const health = await fetch(`${url}/health`, { headers: { authorization: `Bearer ${token}` } });
    assert.deepEqual((await health.json()).operations, ["sage.numberTheory.gcd", "sage.numberTheory.modInverse"]);
    const rejected = await post(url, "/run", { jobId: "source-code", operation: "sage.console.execute", params: { code: "2^10" } });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, "invalid_input");
    const gcd = await post(url, "/run", { jobId: "gcd-1", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    assert.equal((await gcd.json()).result.value, "6");
    const failed = await post(url, "/run", { jobId: "inverse-1", operation: "sage.numberTheory.modInverse", params: { a: "2", modulus: "4" } });
    assert.equal((await failed.json()).errorCode, "operation_failed");
    const limited = await post(url, "/run", { jobId: "gcd-2", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, "rate_limited");
  } finally { await close(gateway); await close(worker); }
});

test("private Sage gateway forwards cancellation and rejects overlapping jobs", async () => {
  let started;
  const running = new Promise((resolve) => { started = resolve; });
  let cancelled = false;
  const worker = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/run") { started(); setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ success: true })); }, 2000); return; }
    if (req.url === "/cancel") { cancelled = true; res.end(JSON.stringify({ ok: true })); return; }
    res.end(JSON.stringify({ available: true, status: "ok", engineVersion: "10.10", operations: [] }));
  });
  const workerUrl = await listen(worker);
  const gateway = createGateway({ token, workerUrl, audit: () => {}, limits: { ...DEFAULT_LIMITS, maxConcurrent: 1 } });
  const url = await listen(gateway);
  try {
    const first = post(url, "/run", { jobId: "long-gcd", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    await running;
    const overlap = await post(url, "/run", { jobId: "second-gcd", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    assert.equal(overlap.status, 429);
    assert.equal((await overlap.json()).code, "concurrency_limited");
    const stopped = await post(url, "/cancel", { jobId: "long-gcd" });
    assert.deepEqual(await stopped.json(), { ok: true });
    const outcome = await first;
    assert.equal(outcome.status, 409);
    assert.equal((await outcome.json()).code, "cancelled");
    assert.equal(cancelled, true);
  } finally { await close(gateway); await close(worker); }
});

test("private Sage gateway returns typed timeout and output limits", async () => {
  let mode = "slow";
  const worker = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/run") {
      if (mode === "large") return res.end(JSON.stringify({ text: "x".repeat(500) }));
      setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ success: true })); }, 100);
    }
  });
  const workerUrl = await listen(worker);
  const gateway = createGateway({ token, workerUrl, audit: () => {},
    limits: { ...DEFAULT_LIMITS, timeoutMs: 10 } });
  const url = await listen(gateway);
  try {
    const timed = await post(url, "/run", { jobId: "slow-gcd", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    assert.equal(timed.status, 408);
    assert.equal((await timed.json()).code, "timed_out");
    mode = "large";
    const outputGateway = createGateway({ token, workerUrl, audit: () => {},
      limits: { ...DEFAULT_LIMITS, maxOutputBytes: 100 } });
    const outputUrl = await listen(outputGateway);
    try {
      const oversized = await post(outputUrl, "/run", { jobId: "large-gcd", operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
      assert.equal(oversized.status, 502);
      assert.equal((await oversized.json()).code, "output_too_large");
    } finally { await close(outputGateway); }
  } finally { await close(gateway); await close(worker); }
});
