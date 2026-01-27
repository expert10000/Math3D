import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import type {
  CgalMeshRequest,
  CgalMeshResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
} from "../ipc/cgalMeshIpc";

type Pending = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
};

function decodeFloat32(b64: string): number[] {
  const buf = Buffer.from(b64, "base64");
  const arr = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return Array.from(arr);
}

function decodeUint32(b64: string): number[] {
  const buf = Buffer.from(b64, "base64");
  const arr = new Uint32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return Array.from(arr);
}

class PythonWorker {
  private proc: ChildProcessWithoutNullStreams;
  private pending = new Map<string, Pending>();
  private stderrTail = "";
  private logStderr = false;
  private envLogStderr = false;
  private stderrLastLog = 0;
  private stderrDropped = 0;
  private stderrLastLine = "";

  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    const envVerbose = String(process.env.MATH3D_CGAL_VERBOSE || "").toLowerCase();
    const envLog = String(process.env.MATH3D_CGAL_LOG_STDERR || "").toLowerCase();
    const truthy = (v: string) => ["1", "true", "yes", "on", "y"].includes(v);
    this.envLogStderr = truthy(envVerbose) || truthy(envLog);
    this.logStderr = this.envLogStderr;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      if (!line) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      const jobId = msg.jobId;
      if (!jobId) return;

      if (msg.type === "progress") {
        const phase = msg.phase ? ` ${msg.phase}` : "";
        const pct = typeof msg.pct === "number" ? ` ${msg.pct}%` : "";
        const detail = msg.msg ? ` - ${msg.msg}` : "";
        console.log(`[CGAL worker] ${jobId}${phase}${pct}${detail}`);
        return;
      }

      const pending = this.pending.get(jobId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(jobId);

      if (msg.type === "error") {
        pending.reject(new Error(msg.message || msg.error || "Python worker error"));
        return;
      }

      pending.resolve(msg);
    });

    proc.stderr.on("data", (buf) => {
      const text = buf.toString();
      if (!text) return;
      this.stderrTail = (this.stderrTail + text).slice(-2000);
      if (!this.logStderr) return;

      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      this.stderrLastLine = lines[lines.length - 1];
      this.stderrDropped += lines.length;
      const now = Date.now();
      if (now - this.stderrLastLog < 1000) return;
      this.stderrLastLog = now;
      const dropped = this.stderrDropped;
      this.stderrDropped = 0;
      console.error(
        `[CGAL worker:stderr] ${dropped} lines (latest): ${this.stderrLastLine}`
      );
    });

    proc.on("exit", (code) => {
      const details = this.stderrTail.trim();
      const suffix = details ? `: ${details}` : "";
      const err = new Error(`Python worker exited with code ${code ?? "unknown"}${suffix}`);
      console.error("[CGAL worker] exit", { code, details });
      for (const [, p] of this.pending) {
        clearTimeout(p.timeout);
        p.reject(err);
      }
      this.pending.clear();
    });
  }

  private request(job: any, timeoutMs = 120000): Promise<any> {
    const jobId: string = job.jobId;
    return new Promise((resolve, reject) => {
      if (!jobId) {
        reject(new Error("Missing jobId for Python worker request"));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new Error(`Python worker timeout for jobId=${jobId}`));
      }, timeoutMs);

      this.pending.set(jobId, { resolve, reject, timeout });
      this.proc.stdin.write(JSON.stringify(job) + "\n");
    });
  }

  async health(): Promise<{ ok: boolean; error?: string } | undefined> {
    const jobId = `health-${Date.now()}`;
    const res = await this.request({ type: "health", jobId }, 15000);
    return res;
  }

  async meshCgal(req: CgalMeshRequest): Promise<CgalMeshResponse> {
    this.logStderr = this.envLogStderr || !!req.verbose;
    console.log("[CGAL worker] mesh request", {
      jobId: req.jobId,
      iso: req.iso,
      domain: req.domain,
      quality: req.quality,
      scalars: req.scalars,
      verbose: req.verbose,
      preflightSamples: req.preflightSamples,
      exprLength: req.f?.length ?? 0,
    });
    const msg = {
      type: "mesh_job",
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

    const t0 = Date.now();
    const res = await this.request(msg, 180000);
    const t1 = Date.now();
    console.log("[CGAL worker] response received", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      vertexCount: res?.vertexCount,
      triCount: res?.triCount,
      positions_b64_len: res?.positions_b64?.length,
      indices_b64_len: res?.indices_b64?.length,
    });

    if (!res || res.type !== "result") {
      throw new Error(res?.message || res?.error || "Unknown CGAL worker response");
    }

    const t2 = Date.now();
    const positions = Array.isArray(res.positions)
      ? res.positions
      : res.positions_b64
        ? decodeFloat32(res.positions_b64)
        : [];
    const indices = Array.isArray(res.indices)
      ? res.indices
      : res.indices_b64
        ? decodeUint32(res.indices_b64)
        : [];
    const t3 = Date.now();
    console.log("[CGAL worker] decode complete", {
      jobId: req.jobId,
      ms: t3 - t2,
      positions: positions.length,
      indices: indices.length,
    });

    if (!positions.length || !indices.length) {
      return { ok: false, error: "CGAL worker returned empty mesh" };
    }

    let scalars: { name: string; values: number[] }[] | undefined;
    if (res.scalar_b64) {
      scalars = [{ name: req.scalars?.[0] ?? "scalar", values: decodeFloat32(res.scalar_b64) }];
    }

    return {
      ok: true,
      positions,
      indices,
      scalars,
    };
  }

  async geodesicHeat(req: GeodesicHeatRequest): Promise<GeodesicHeatResponse> {
    console.log("[CGAL worker] geodesic heat request", {
      jobId: req.jobId,
      faces: req.mesh?.F?.length ?? 0,
      vertices: req.mesh?.V?.length ?? 0,
      options: req.options,
    });

    const msg = {
      type: "geodesic_heat",
      jobId: req.jobId,
      mesh: req.mesh,
      source: req.source,
      target: req.target,
      options: req.options ?? {},
    };

    const t0 = Date.now();
    const res = await this.request(msg, 180000);
    const t1 = Date.now();
    console.log("[CGAL worker] geodesic heat response received", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      points: res?.polyline?.length ?? 0,
      hasPhi: !!res?.phi_vertex,
    });

    if (!res || res.ok === false) {
      return { ok: false, error: res?.error || res?.message || "Unknown geodesic heat response" };
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

  kill() {
    this.proc.kill();
  }
}

let singleton: PythonWorker | null = null;
let spawnPromise: Promise<PythonWorker> | null = null;

function resolvePythonExe(): string {
  const env = process.env.MATH3D_PYTHON;
  if (env && env.trim().length) return env;

  return process.platform === "win32" ? "python" : "python3";
}

function resolveWorkerScript(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "py", "cgal_worker.py"),
    path.join(process.cwd(), "py", "cgal_worker.py"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export async function getPythonWorker(): Promise<PythonWorker> {
  if (singleton) return singleton;
  if (spawnPromise) return spawnPromise;

  spawnPromise = (async () => {
    const pythonExe = resolvePythonExe();
    const scriptPath = resolveWorkerScript();
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`CGAL worker script not found at ${scriptPath}`);
    }

    const proc = spawn(pythonExe, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const worker = new PythonWorker(proc);
    proc.on("exit", () => {
      if (singleton === worker) singleton = null;
    });
    proc.on("error", () => {
      if (singleton === worker) singleton = null;
    });

    try {
      await worker.health();
    } catch (err) {
      worker.kill();
      throw err;
    }

    singleton = worker;
    return worker;
  })();

  try {
    return await spawnPromise;
  } finally {
    spawnPromise = null;
  }
}

export function stopPythonWorker() {
  if (singleton) {
    try {
      singleton.kill();
    } finally {
      singleton = null;
    }
  }
}
