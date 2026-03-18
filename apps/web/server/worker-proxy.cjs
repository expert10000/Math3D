"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HOST = process.env.MATH3D_WEB_WORKER_PROXY_HOST || "127.0.0.1";
const PORT = Number(process.env.MATH3D_WEB_WORKER_PROXY_PORT || 8787);
const BODY_LIMIT_MB = Math.max(1, Number(process.env.MATH3D_WEB_WORKER_PROXY_BODY_LIMIT_MB || 256));
const BODY_LIMIT_BYTES = BODY_LIMIT_MB * 1024 * 1024;
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const diagnosticsState = {
  startupChecked: false,
  available: false,
  statusMessage: "Python worker diagnostics pending.",
  backend: undefined,
  version: undefined,
  protocol: undefined,
  command: undefined,
  args: undefined,
  logPath: path.join(ROOT_DIR, "output", "logs", "web-worker-proxy.log"),
  lastCheckAt: Date.now(),
  lastError: undefined,
};

function ensureDiagnosticsLogDir() {
  try {
    fs.mkdirSync(path.dirname(diagnosticsState.logPath), { recursive: true });
  } catch {
    // best effort
  }
}

function appendDiagnosticsLog(level, event, payload) {
  ensureDiagnosticsLogDir();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  });
  try {
    fs.appendFileSync(diagnosticsState.logPath, `${line}\n`, "utf8");
  } catch {
    // best effort
  }
}

function classifyFailureCategory(rawMessage, code) {
  const text = String(rawMessage || "").toLowerCase();
  const codeText = String(code || "").toLowerCase();
  if (text.includes("timeout for jobid") || codeText.includes("timeout")) return "operation-timeout";
  if (
    text.includes("worker entrypoint not found") ||
    text.includes("worker executable not found") ||
    (text.includes("not found") && text.includes("worker")) ||
    (text.includes("enoent") && text.includes("worker"))
  ) {
    return "worker-missing";
  }
  if (
    text.includes("no module named") ||
    text.includes("modulenotfounderror") ||
    text.includes("importerror") ||
    text.includes("dll load failed")
  ) {
    return "dependency-load-failure";
  }
  if (
    text.includes("exited with code") ||
    text.includes("startup failed") ||
    text.includes("spawn") ||
    codeText.includes("startup")
  ) {
    return "startup-crash";
  }
  return "unknown";
}

function recordWorkerSuccess(fields = {}) {
  diagnosticsState.startupChecked = true;
  diagnosticsState.available = true;
  diagnosticsState.lastCheckAt = Date.now();
  diagnosticsState.lastError = undefined;
  if (fields.backend) diagnosticsState.backend = fields.backend;
  if (fields.version) diagnosticsState.version = fields.version;
  if (fields.protocol) diagnosticsState.protocol = fields.protocol;
  if (fields.command) diagnosticsState.command = fields.command;
  if (fields.args) diagnosticsState.args = fields.args;
  diagnosticsState.statusMessage = diagnosticsState.version
    ? `Python worker available (${diagnosticsState.version}${diagnosticsState.protocol ? `, ${diagnosticsState.protocol}` : ""}).`
    : "Python worker available.";
}

function recordWorkerFailure(error, context, code = "WORKER_OPERATION_FAILED") {
  const detail = String(error?.message || error || "Python worker failure");
  const category = classifyFailureCategory(detail, code);
  const fatal = category !== "operation-timeout";
  const message = `Python worker request failed (${context}). Check ${diagnosticsState.logPath}`;
  const diagError = {
    category,
    code,
    message,
    detail,
    context,
    fatal,
    at: Date.now(),
  };

  diagnosticsState.startupChecked = true;
  diagnosticsState.available = fatal ? false : diagnosticsState.available;
  diagnosticsState.lastCheckAt = diagError.at;
  diagnosticsState.lastError = diagError;
  diagnosticsState.statusMessage = message;
  appendDiagnosticsLog("error", "worker-failure", {
    category,
    code,
    context,
    detail,
    fatal,
  });
  return diagError;
}

function decodeFloat32(b64) {
  const buf = Buffer.from(String(b64 || ""), "base64");
  const arr = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return Array.from(arr);
}

function decodeUint32(b64) {
  const buf = Buffer.from(String(b64 || ""), "base64");
  const arr = new Uint32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return Array.from(arr);
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "base64");
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.alloc(0);
}

function resolvePythonExe() {
  const env = process.env.MATH3D_PYTHON;
  if (env && env.trim().length) return env;
  return process.platform === "win32" ? "python" : "python3";
}

function dedupePaths(candidates) {
  const out = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = path.normalize(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveWorkerScriptCandidates() {
  const fromEnv = String(process.env.MATH3D_WORKER_SCRIPT || "").trim();
  return dedupePaths([
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    path.join(ROOT_DIR, "python", "worker", "main.py"),
    path.join(ROOT_DIR, "dist", "python", "worker", "main.py"),
  ]);
}

function resolveWorkerExeCandidates() {
  const fromEnv = String(process.env.MATH3D_WORKER_EXE || "").trim();
  return dedupePaths([
    ...(fromEnv ? [path.resolve(fromEnv)] : []),
    path.join(ROOT_DIR, "build", "python-worker-dist", "worker.exe"),
  ]);
}

function resolveWorkerLaunch() {
  const modeRaw = String(process.env.MATH3D_WORKER_MODE || process.env.MATH3D_PYTHON_WORKER_MODE || "auto").trim().toLowerCase();
  const mode = modeRaw === "python" || modeRaw === "exe" || modeRaw === "auto" ? modeRaw : "auto";

  if (mode === "python") {
    const scriptPath = firstExistingPath(resolveWorkerScriptCandidates());
    if (!scriptPath) throw new Error("Python worker entrypoint not found.");
    const pythonExe = resolvePythonExe();
    return {
      backend: "python-script",
      command: pythonExe,
      args: [scriptPath],
      pythonExe,
      scriptPath,
      exePath: undefined,
    };
  }

  if (mode === "exe") {
    const exePath = firstExistingPath(resolveWorkerExeCandidates());
    if (!exePath) throw new Error("Bundled worker executable not found.");
    return {
      backend: "bundled-exe",
      command: exePath,
      args: [],
      pythonExe: undefined,
      scriptPath: undefined,
      exePath,
    };
  }

  const exePath = firstExistingPath(resolveWorkerExeCandidates());
  if (exePath) {
    return {
      backend: "bundled-exe",
      command: exePath,
      args: [],
      pythonExe: undefined,
      scriptPath: undefined,
      exePath,
    };
  }

  const scriptPath = firstExistingPath(resolveWorkerScriptCandidates());
  if (!scriptPath) throw new Error("Python worker entrypoint not found.");
  const pythonExe = resolvePythonExe();
  return {
    backend: "python-script",
    command: pythonExe,
    args: [scriptPath],
    pythonExe,
    scriptPath,
    exePath: undefined,
  };
}

function toWorkerError(msg) {
  const nested = msg?.error;
  if (nested && typeof nested === "object") {
    return {
      code: String(nested.code || msg?.code || "WORKER_ERROR"),
      message: String(nested.message || msg?.message || "Python worker error"),
      details: nested.details || msg?.details || msg?.trace,
    };
  }
  return {
    code: String(msg?.code || "WORKER_ERROR"),
    message: String(msg?.message || msg?.error || "Python worker error"),
    details: msg?.details || msg?.trace,
  };
}

function workerErrorText(msg, fallback) {
  const err = toWorkerError(msg);
  if (!err.message || err.message === "Python worker error") return fallback;
  return `${err.code}: ${err.message}`;
}

class PythonWorkerClient {
  constructor(proc) {
    this.proc = proc;
    this.pending = new Map();
    this.stdoutBuffer = Buffer.alloc(0);
    this.pendingBinary = null;
    this.stderrTail = "";

    proc.stdout.on("data", (buf) => this.handleStdout(buf));
    proc.stderr.on("data", (buf) => {
      const text = String(buf || "");
      if (!text) return;
      this.stderrTail = (this.stderrTail + text).slice(-3000);
    });
    proc.on("exit", (code) => {
      const err = new Error(`Python worker exited with code ${code ?? "unknown"}`);
      for (const [, p] of this.pending) {
        clearTimeout(p.timeout);
        p.reject(err);
      }
      this.pending.clear();
    });
  }

  handleStdout(buf) {
    if (!buf || !buf.length) return;
    this.stdoutBuffer = this.stdoutBuffer.length ? Buffer.concat([this.stdoutBuffer, Buffer.from(buf)]) : Buffer.from(buf);

    while (true) {
      if (this.pendingBinary) {
        if (this.stdoutBuffer.length < this.pendingBinary.totalBytes) return;
        const payload = this.stdoutBuffer.subarray(0, this.pendingBinary.totalBytes);
        this.stdoutBuffer = this.stdoutBuffer.subarray(this.pendingBinary.totalBytes);
        const binaryPayloads = {};
        let offset = 0;
        for (const part of this.pendingBinary.parts) {
          const next = offset + part.bytes;
          binaryPayloads[part.name] = payload.subarray(offset, next);
          offset = next;
        }
        const msg = {
          ...this.pendingBinary.meta,
          binaryPayloads,
        };
        this.pendingBinary = null;
        this.resolveMessage(msg);
        continue;
      }

      const nl = this.stdoutBuffer.indexOf(10);
      if (nl < 0) return;
      const lineBuf = this.stdoutBuffer.subarray(0, nl);
      this.stdoutBuffer = this.stdoutBuffer.subarray(nl + 1);
      if (!lineBuf.length) continue;

      let msg = null;
      try {
        msg = JSON.parse(lineBuf.toString("utf8"));
      } catch {
        continue;
      }

      const binaryParts = Array.isArray(msg?.binary)
        ? msg.binary
            .map((p) => ({
              name: String(p?.name || ""),
              bytes: Number(p?.bytes || 0),
            }))
            .filter((p) => p.name && p.bytes > 0)
        : [];
      if (binaryParts.length && msg?.jobId) {
        const totalBytes = binaryParts.reduce((sum, p) => sum + p.bytes, 0);
        this.pendingBinary = {
          meta: msg,
          parts: binaryParts,
          totalBytes,
        };
        if (totalBytes === 0) {
          const merged = { ...msg, binaryPayloads: {} };
          this.pendingBinary = null;
          this.resolveMessage(merged);
        }
        continue;
      }

      this.resolveMessage(msg);
    }
  }

  resolveMessage(msg) {
    const jobId = msg?.jobId;
    if (!jobId) return;
    if (msg.type === "progress") return;

    const pending = this.pending.get(jobId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(jobId);

    if (msg.type === "error" || msg.ok === false) {
      const err = toWorkerError(msg);
      pending.reject(new Error(`${err.code}: ${err.message}`));
      return;
    }
    pending.resolve(msg);
  }

  request(job, timeoutMs = 180000, payloads = []) {
    return new Promise((resolve, reject) => {
      const jobId = String(job?.jobId || "");
      if (!jobId) {
        reject(new Error("Missing jobId for Python worker request"));
        return;
      }
      const timeout = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new Error(`Python worker timeout for jobId=${jobId}`));
      }, timeoutMs);
      this.pending.set(jobId, { resolve, reject, timeout });
      this.proc.stdin.write(`${JSON.stringify(job)}\n`);
      for (const payload of payloads) {
        if (payload?.length) this.proc.stdin.write(payload);
      }
    });
  }

  async ping() {
    const jobId = `ping-${Date.now()}-${Math.random()}`;
    const res = await this.request({ type: "ping", jobId }, 15000);
    return { ok: res?.type === "pong" || res?.pong === true, pong: true };
  }

  async version() {
    const jobId = `version-${Date.now()}-${Math.random()}`;
    const res = await this.request({ type: "version", jobId }, 15000);
    return {
      version: String(res?.version || "unknown"),
      protocol: String(res?.protocol || "legacy"),
    };
  }

  async health() {
    const jobId = `health-${Date.now()}-${Math.random()}`;
    return this.request({ type: "health", jobId }, 15000);
  }

  async meshCgal(req) {
    const msg = {
      type: "mesh.generate",
      jobId: req.jobId,
      expr: req.f,
      iso: req.iso,
      bbox: req.domain,
      quality: {
        target_edge: req.quality?.target_edge,
        radiusBound: req.quality?.radiusBound,
      },
      scalar: req.scalars?.[0],
      verbose: req.verbose,
      preflightSamples: req.preflightSamples,
    };
    const res = await this.request(msg, 180000);
    if (!res || res.type !== "result") {
      return { ok: false, error: workerErrorText(res, "Unknown CGAL worker response") };
    }
    const positions = Array.isArray(res.positions) ? res.positions : res.positions_b64 ? decodeFloat32(res.positions_b64) : [];
    const indices = Array.isArray(res.indices) ? res.indices : res.indices_b64 ? decodeUint32(res.indices_b64) : [];
    if (!positions.length || !indices.length) {
      return { ok: false, error: "CGAL worker returned empty mesh" };
    }
    let scalars;
    if (res.scalar_b64) {
      scalars = [{ name: req.scalars?.[0] || "scalar", values: decodeFloat32(res.scalar_b64) }];
    }
    return {
      ok: true,
      positions,
      indices,
      scalars,
    };
  }

  async geodesicHeat(req) {
    const msg = {
      type: "geodesic.heat",
      jobId: req.jobId,
      mesh: req.mesh,
      source: req.source,
      target: req.target,
      options: req.options || {},
    };
    const res = await this.request(msg, 180000);
    if (!res || res.ok === false) {
      return { ok: false, error: workerErrorText(res, "Unknown geodesic heat response") };
    }
    if (!Array.isArray(res.polyline)) {
      return { ok: false, error: "Geodesic heat returned empty polyline" };
    }
    return {
      ok: true,
      polyline: res.polyline,
      length: typeof res.length === "number" ? res.length : 0,
      phi_vertex: Array.isArray(res.phi_vertex) ? res.phi_vertex : undefined,
    };
  }

  async vtkMesh(op, req) {
    const positionsBuf = toBuffer(req.positions);
    const indicesBuf = toBuffer(req.indices);
    if (!positionsBuf.length || !indicesBuf.length) {
      return { ok: false, error: "VTK mesh request missing buffers" };
    }
    const msg = {
      type: "mesh.transform",
      jobId: req.jobId,
      op,
      options: req.options || {},
      binary: [
        { name: "positions", bytes: positionsBuf.length },
        { name: "indices", bytes: indicesBuf.length },
      ],
    };
    const res = await this.request(msg, 180000, [positionsBuf, indicesBuf]);
    if (!res || res.type !== "vtk_result") {
      return { ok: false, error: workerErrorText(res, "Unknown VTK worker response") };
    }
    const payloads = res.binaryPayloads || {};
    const pos = payloads.positions;
    const idx = payloads.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK worker returned empty buffers" };
    }
    const normals = payloads.normals;
    return {
      ok: true,
      positions_b64: Buffer.from(pos).toString("base64"),
      indices_b64: Buffer.from(idx).toString("base64"),
      normals_b64: normals ? Buffer.from(normals).toString("base64") : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkPreviewImplicit(req) {
    const msg = {
      type: "mesh.preview",
      jobId: req.jobId,
      expr: req.expr,
      iso: req.iso,
      bbox: req.domain,
      resolution: req.resolution,
      targetFaces: req.targetFaces,
      targetReduction: req.targetReduction,
    };
    const res = await this.request(msg, 180000);
    if (!res || res.type !== "vtk_result") {
      return { ok: false, error: workerErrorText(res, "Unknown VTK preview response") };
    }
    const payloads = res.binaryPayloads || {};
    const pos = payloads.positions;
    const idx = payloads.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK preview returned empty buffers" };
    }
    const normals = payloads.normals;
    return {
      ok: true,
      positions_b64: Buffer.from(pos).toString("base64"),
      indices_b64: Buffer.from(idx).toString("base64"),
      normals_b64: normals ? Buffer.from(normals).toString("base64") : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkVolumeSlice(req) {
    const scalarsBuf = toBuffer(req.scalars);
    if (!scalarsBuf.length) {
      return { ok: false, error: "VTK volume slice request missing scalars buffer" };
    }
    const msg = {
      type: "volume.slice",
      jobId: req.jobId,
      dims: req.dims,
      axis: req.axis,
      index: req.index,
      spacing: req.spacing,
      origin: req.origin,
      plane: req.plane,
      window: req.window,
      binary: [{ name: "scalars", bytes: scalarsBuf.length }],
    };
    const res = await this.request(msg, 180000, [scalarsBuf]);
    if (!res || res.type !== "volume_slice_result" || res.ok === false) {
      return { ok: false, error: workerErrorText(res, "Unknown VTK volume slice response") };
    }
    const payloads = res.binaryPayloads || {};
    const data = payloads.data;
    if (!data) {
      return { ok: false, error: "VTK volume slice returned empty buffer" };
    }
    return {
      ok: true,
      data_b64: Buffer.from(data).toString("base64"),
      width: Number(res.width) || 0,
      height: Number(res.height) || 0,
      format: "rgba8",
      min: typeof res.min === "number" ? res.min : undefined,
      max: typeof res.max === "number" ? res.max : undefined,
    };
  }

  async vtkVolumeIsosurface(req) {
    const scalarsBuf = toBuffer(req.scalars);
    if (!scalarsBuf.length) {
      return { ok: false, error: "VTK volume isosurface request missing scalars buffer" };
    }
    const msg = {
      type: "volume.isosurface",
      jobId: req.jobId,
      dims: req.dims,
      iso: req.iso,
      spacing: req.spacing,
      origin: req.origin,
      binary: [{ name: "scalars", bytes: scalarsBuf.length }],
    };
    const res = await this.request(msg, 180000, [scalarsBuf]);
    if (!res || res.type !== "volume_isosurface_result" || res.ok === false) {
      return { ok: false, error: workerErrorText(res, "Unknown VTK volume isosurface response") };
    }
    const payloads = res.binaryPayloads || {};
    const pos = payloads.positions;
    const idx = payloads.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK volume isosurface returned empty buffers" };
    }
    const normals = payloads.normals;
    return {
      ok: true,
      positions_b64: Buffer.from(pos).toString("base64"),
      indices_b64: Buffer.from(idx).toString("base64"),
      normals_b64: normals ? Buffer.from(normals).toString("base64") : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkVolumeDistance(req) {
    const positionsBuf = toBuffer(req.positions);
    const indicesBuf = toBuffer(req.indices);
    if (!positionsBuf.length || !indicesBuf.length) {
      return { ok: false, error: "VTK volume distance request missing mesh buffers" };
    }
    const msg = {
      type: "volume.distance",
      jobId: req.jobId,
      dims: req.dims,
      spacing: req.spacing,
      origin: req.origin,
      signed: req.signed,
      windingNumber: req.windingNumber,
      binary: [
        { name: "positions", bytes: positionsBuf.length },
        { name: "indices", bytes: indicesBuf.length },
      ],
    };
    const res = await this.request(msg, 180000, [positionsBuf, indicesBuf]);
    if (!res || res.type !== "volume_distance_result" || res.ok === false) {
      return { ok: false, error: workerErrorText(res, "Unknown VTK volume distance response") };
    }
    const payloads = res.binaryPayloads || {};
    const scalars = payloads.scalars;
    if (!scalars) {
      return { ok: false, error: "VTK volume distance returned empty buffer" };
    }
    return {
      ok: true,
      scalars_b64: Buffer.from(scalars).toString("base64"),
      dims: Array.isArray(res.dims) && res.dims.length === 3 ? res.dims : req.dims,
    };
  }

  async vtkVolumeStreamlines(req) {
    const vectorsBuf = toBuffer(req.vectors);
    if (!vectorsBuf.length) {
      return { ok: false, error: "VTK streamlines request missing vectors buffer" };
    }
    const msg = {
      type: "volume.streamlines",
      jobId: req.jobId,
      dims: req.dims,
      spacing: req.spacing,
      origin: req.origin,
      seeds: req.seeds,
      stepSize: req.stepSize,
      maxSteps: req.maxSteps,
      maxLength: req.maxLength,
      binary: [{ name: "vectors", bytes: vectorsBuf.length }],
    };
    const res = await this.request(msg, 180000, [vectorsBuf]);
    if (!res || res.type !== "volume_streamlines_result" || res.ok === false) {
      return { ok: false, error: workerErrorText(res, "Unknown VTK streamlines response") };
    }
    if (!Array.isArray(res.lines)) {
      return { ok: false, error: "VTK streamlines returned empty data" };
    }
    return { ok: true, lines: res.lines };
  }

  kill() {
    this.proc.kill();
  }
}

let workerSingleton = null;
let workerSpawnPromise = null;
let lastLaunchConfig = null;

async function getPythonWorker() {
  if (workerSingleton) return workerSingleton;
  if (workerSpawnPromise) return workerSpawnPromise;

  workerSpawnPromise = (async () => {
    const launch = resolveWorkerLaunch();
    lastLaunchConfig = launch;
    const proc = spawn(launch.command, launch.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      cwd: ROOT_DIR,
    });

    const worker = new PythonWorkerClient(proc);
    proc.on("exit", () => {
      if (workerSingleton === worker) workerSingleton = null;
    });
    proc.on("error", () => {
      if (workerSingleton === worker) workerSingleton = null;
    });

    const ping = await worker.ping();
    if (!ping.ok) throw new Error(`Python worker ping failed (${launch.backend})`);
    const version = await worker.version();
    await worker.health();

    recordWorkerSuccess({
      backend: launch.backend,
      version: version.version,
      protocol: version.protocol,
      command: launch.command,
      args: launch.args,
    });
    appendDiagnosticsLog("info", "startup-ok", {
      backend: launch.backend,
      command: launch.command,
      args: launch.args,
      version: version.version,
      protocol: version.protocol,
    });

    workerSingleton = worker;
    return worker;
  })();

  try {
    return await workerSpawnPromise;
  } finally {
    workerSpawnPromise = null;
  }
}

function stopPythonWorker() {
  if (!workerSingleton) return;
  try {
    workerSingleton.kill();
  } finally {
    workerSingleton = null;
  }
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > BODY_LIMIT_BYTES) {
        reject(new Error(`Request body too large (limit=${BODY_LIMIT_MB}MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error?.message || error}`));
      }
    });
  });
}

function nextJobId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function handleRoute(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/worker/diagnostics") {
    json(res, 200, { ...diagnosticsState });
    return;
  }

  if (req.method === "POST" && pathname === "/api/worker/cgal/stop") {
    stopPythonWorker();
    json(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/api/worker/cgal/health") {
      const worker = await getPythonWorker();
      const result = await worker.health();
      if (result?.ok === false) {
        const diag = recordWorkerFailure(result?.error || "CGAL worker health failed", "web:cgal:health", "WORKER_HEALTH_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/cgal/ping") {
      const worker = await getPythonWorker();
      const result = await worker.ping();
      recordWorkerSuccess();
      json(res, 200, { ok: true, pong: !!result.pong });
      return;
    }

    if (req.method === "GET" && pathname === "/api/worker/cgal/version") {
      const worker = await getPythonWorker();
      const result = await worker.version();
      recordWorkerSuccess({ version: result.version, protocol: result.protocol });
      json(res, 200, { ok: true, version: result.version, protocol: result.protocol });
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/cgal/mesh") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const payload = {
        ...body,
        jobId: String(body?.jobId || nextJobId("cgal-mesh")),
      };
      const result = await worker.meshCgal(payload);
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:cgal:mesh", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/cgal/geodesic-heat") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const payload = {
        ...body,
        jobId: String(body?.jobId || nextJobId("geodesic-heat")),
      };
      const result = await worker.geodesicHeat(payload);
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:cgal:geodesic-heat", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/vtk/clean") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkMesh("vtk_clean_normals", {
        jobId: String(body?.jobId || nextJobId("vtk-clean")),
        positions: toBuffer(body?.positions_b64),
        indices: toBuffer(body?.indices_b64),
        options: body?.options || {},
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:vtk:clean", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/vtk/decimate") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkMesh("vtk_decimate", {
        jobId: String(body?.jobId || nextJobId("vtk-decimate")),
        positions: toBuffer(body?.positions_b64),
        indices: toBuffer(body?.indices_b64),
        options: body?.options || {},
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:vtk:decimate", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/vtk/smooth") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkMesh("vtk_smooth", {
        jobId: String(body?.jobId || nextJobId("vtk-smooth")),
        positions: toBuffer(body?.positions_b64),
        indices: toBuffer(body?.indices_b64),
        options: body?.options || {},
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:vtk:smooth", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/vtk/preview") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const payload = {
        ...body,
        jobId: String(body?.jobId || nextJobId("vtk-preview")),
      };
      const result = await worker.vtkPreviewImplicit(payload);
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:vtk:preview", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/volume/slice") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkVolumeSlice({
        ...body,
        jobId: String(body?.jobId || nextJobId("volume-slice")),
        scalars: toBuffer(body?.scalars_b64),
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:volume:slice", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/volume/isosurface") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkVolumeIsosurface({
        ...body,
        jobId: String(body?.jobId || nextJobId("volume-isosurface")),
        scalars: toBuffer(body?.scalars_b64),
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:volume:isosurface", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/volume/distance") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkVolumeDistance({
        ...body,
        jobId: String(body?.jobId || nextJobId("volume-distance")),
        positions: toBuffer(body?.positions_b64),
        indices: toBuffer(body?.indices_b64),
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:volume:distance", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/worker/volume/streamlines") {
      const body = await readJsonBody(req);
      const worker = await getPythonWorker();
      const result = await worker.vtkVolumeStreamlines({
        ...body,
        jobId: String(body?.jobId || nextJobId("volume-streamlines")),
        vectors: toBuffer(body?.vectors_b64),
      });
      if (!result.ok) {
        const diag = recordWorkerFailure(result.error, "web:volume:streamlines", "WORKER_OPERATION_FAILED");
        json(res, 200, { ok: false, error: diag.message });
        return;
      }
      recordWorkerSuccess();
      json(res, 200, result);
      return;
    }
  } catch (error) {
    const code = diagnosticsState.startupChecked ? "WORKER_OPERATION_FAILED" : "WORKER_STARTUP_FAILED";
    const diag = recordWorkerFailure(error, "web:proxy", code);
    if (!diagnosticsState.backend && lastLaunchConfig?.backend) diagnosticsState.backend = lastLaunchConfig.backend;
    if (!diagnosticsState.command && lastLaunchConfig?.command) diagnosticsState.command = lastLaunchConfig.command;
    if (!diagnosticsState.args && lastLaunchConfig?.args) diagnosticsState.args = lastLaunchConfig.args;
    json(res, 500, { ok: false, error: diag.message, detail: diag.detail });
    return;
  }

  json(res, 404, { ok: false, error: `Unknown route: ${req.method || "GET"} ${pathname}` });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  await handleRoute(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  ensureDiagnosticsLogDir();
  appendDiagnosticsLog("info", "proxy-start", {
    host: HOST,
    port: PORT,
    rootDir: ROOT_DIR,
    mode: String(process.env.MATH3D_WORKER_MODE || process.env.MATH3D_PYTHON_WORKER_MODE || "auto"),
    python: resolvePythonExe(),
  });
  console.log(`[web-worker-proxy] listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  try {
    appendDiagnosticsLog("info", "proxy-stop", { signal });
  } catch {
    // ignore
  }
  try {
    stopPythonWorker();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  const diag = recordWorkerFailure(error, "web:proxy:uncaughtException", "WEB_PROXY_UNCAUGHT_EXCEPTION");
  console.error("[web-worker-proxy] uncaughtException", diag.detail);
});

process.on("unhandledRejection", (reason) => {
  const diag = recordWorkerFailure(reason, "web:proxy:unhandledRejection", "WEB_PROXY_UNHANDLED_REJECTION");
  console.error("[web-worker-proxy] unhandledRejection", diag.detail);
});
