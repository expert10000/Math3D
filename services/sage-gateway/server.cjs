"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const OPERATIONS = new Set(["sage.numberTheory.gcd", "sage.numberTheory.modInverse"]);
const DEFAULT_LIMITS = Object.freeze({ maxInputBytes: 8192, maxOutputBytes: 262144,
  maxMemoryBytes: 1073741824, maxWorkUnits: 1, maxConcurrent: 2, maxRequestsPerMinute: 30, timeoutMs: 20000 });

function createGateway({ token, workerUrl, limits = DEFAULT_LIMITS, fetchImpl = fetch, audit = console.log } = {}) {
  if (typeof token !== "string" || token.length < 32) throw new Error("MATH3D_SAGE_GATEWAY_TOKEN must contain at least 32 characters.");
  if (!workerUrl) throw new Error("SAGE_GATEWAY_WORKER_URL is required.");
  const upstream = new URL(workerUrl);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") throw new Error("Invalid Sage worker URL.");
  const active = new Map();
  const recent = [];
  const safeError = (res, status, code, message, retryAfterMs) => json(res, status,
    { code, error: message, ...(retryAfterMs ? { retryAfterMs } : {}) });
  const authorized = (req) => {
    const value = String(req.headers.authorization || "");
    const supplied = value.startsWith("Bearer ") ? value.slice(7) : "";
    const a = Buffer.from(supplied);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const callWorker = async (path, body, signal) => {
    const response = await fetchImpl(new URL(path, upstream), {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal || AbortSignal.timeout(3000),
    });
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limits.maxOutputBytes) throw Object.assign(
        new Error("Sage worker output exceeded the gateway limit."), { code: "output_too_large" });
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Sage worker rejected the request.");
    return data;
  };
  const readBody = async (req) => {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > limits.maxInputBytes) throw Object.assign(new Error("Input exceeds the gateway limit."), { code: "input_too_large", status: 413 });
    }
    try { return JSON.parse(text); }
    catch { throw Object.assign(new Error("A JSON request is required."), { code: "invalid_input", status: 400 }); }
  };
  const handler = async (req, res) => {
    const path = new URL(req.url || "/", "http://gateway").pathname;
    if (!authorized(req)) return safeError(res, 401, "unauthorized", "A valid private gateway credential is required.");
    if (req.method === "GET" && path === "/health") {
      try {
        const health = await callWorker("/health");
        return json(res, 200, { engine: "sagemath", engineVersion: health.engineVersion,
          available: health.available === true, status: health.status,
          operations: health.operations.filter((item) => OPERATIONS.has(item)), limits,
          gateway: { version: 1, activeJobs: active.size } });
      } catch {
        return json(res, 200, { engine: "sagemath", available: false, status: "Private Sage worker is unavailable.",
          operations: [], limits, gateway: { version: 1, activeJobs: active.size } });
      }
    }
    if (req.method === "POST" && path === "/cancel") {
      let body;
      try { body = await readBody(req); } catch (error) { return safeError(res, error.status || 400, error.code || "invalid_input", error.message); }
      if (typeof body?.jobId !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(body.jobId))
        return safeError(res, 400, "invalid_input", "A valid job ID is required.");
      const job = active.get(body.jobId);
      if (!job) return safeError(res, 404, "job_not_found", "This private gateway job is no longer active.");
      try {
        const result = await callWorker("/cancel", { jobId: body.jobId });
        job.cancelled = true;
        job.controller.abort();
        audit(JSON.stringify({ event: "sage-gateway-cancel", jobId: body.jobId, ok: result.ok === true }));
        return json(res, 200, { ok: result.ok === true });
      } catch { return safeError(res, 502, "worker_unavailable", "Could not cancel the Sage worker job."); }
    }
    if (req.method !== "POST" || path !== "/run") return safeError(res, 404, "not_found", "Unknown private gateway route.");
    let body;
    try { body = await readBody(req); } catch (error) { return safeError(res, error.status || 400, error.code || "invalid_input", error.message); }
    if (!body || !OPERATIONS.has(body.operation) || typeof body.jobId !== "string" ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(body.jobId) || !validParams(body.operation, body.params))
      return safeError(res, 400, "invalid_input", "Only bounded GCD and modular inverse requests are accepted.");
    if (active.has(body.jobId)) return safeError(res, 409, "job_conflict", "This job ID is already running.");
    const now = Date.now();
    while (recent.length && recent[0] <= now - 60000) recent.shift();
    if (recent.length >= limits.maxRequestsPerMinute) return safeError(res, 429, "rate_limited", "Private Sage request quota exceeded.", 60000 - (now - recent[0]));
    if (active.size >= limits.maxConcurrent) return safeError(res, 429, "concurrency_limited", "Private Sage concurrent-job quota exceeded.", 1000);
    recent.push(now);
    const controller = new AbortController();
    const job = { controller, cancelled: false, timedOut: false };
    const timeout = setTimeout(() => { job.timedOut = true; controller.abort(); }, limits.timeoutMs);
    active.set(body.jobId, job);
    const started = Date.now();
    let outcome = "completed";
    try {
      const result = await callWorker("/run", { operation: body.operation, params: body.params, jobId: body.jobId }, controller.signal);
      if (controller.signal.aborted) { outcome = job.cancelled ? "cancelled" : "timed_out";
        return safeError(res, job.cancelled ? 409 : 408, job.cancelled ? "cancelled" : "timed_out",
          job.cancelled ? "Private Sage job cancelled." : "Private Sage job timed out."); }
      if (result.success !== true) outcome = "failed";
      return json(res, 200, result.success === true ? result : { ...result, errorCode: "operation_failed" });
    } catch (error) {
      outcome = controller.signal.aborted ? job.cancelled ? "cancelled" : "timed_out"
        : error.code === "output_too_large" ? "output_too_large" : "worker_unavailable";
      return safeError(res, controller.signal.aborted ? job.cancelled ? 409 : 408 : 502,
        controller.signal.aborted ? job.cancelled ? "cancelled" : "timed_out"
          : error.code === "output_too_large" ? "output_too_large" : "worker_unavailable",
        controller.signal.aborted ? job.cancelled ? "Private Sage job cancelled." : "Private Sage job timed out."
          : error.code === "output_too_large" ? "Sage worker output exceeded the gateway limit."
            : "Private Sage worker is unavailable.");
    } finally {
      clearTimeout(timeout);
      active.delete(body.jobId);
      audit(JSON.stringify({ event: "sage-gateway-run", jobId: body.jobId, operation: body.operation,
        outcome, elapsedMs: Date.now() - started }));
    }
  };
  return http.createServer((req, res) => { void handler(req, res).catch(() => safeError(res, 500, "internal_error", "Private Sage gateway failed.")); });
}

function validParams(operation, params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return false;
  const integer = (value) => typeof value === "string" && /^-?[0-9]{1,128}$/.test(value);
  return operation === "sage.numberTheory.gcd"
    ? Object.keys(params).length === 1 && Array.isArray(params.values) && params.values.length >= 2 &&
      params.values.length <= 32 && params.values.every(integer)
    : Object.keys(params).length === 2 && integer(params.a) && typeof params.modulus === "string" &&
      /^[0-9]{1,128}$/.test(params.modulus) && BigInt(params.modulus) > 1n;
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

if (require.main === module) {
  const server = createGateway({ token: process.env.MATH3D_SAGE_GATEWAY_TOKEN,
    workerUrl: process.env.SAGE_GATEWAY_WORKER_URL || "http://sage-worker:8767" });
  server.listen(Number(process.env.SAGE_GATEWAY_PORT || 8770), "0.0.0.0");
}

module.exports = { createGateway, DEFAULT_LIMITS };
