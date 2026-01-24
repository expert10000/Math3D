import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import type { CgalMeshRequest, CgalMeshResponse } from "../ipc/cgalMeshIpc";

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

  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;

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
    });

    proc.on("exit", (code) => {
      const details = this.stderrTail.trim();
      const suffix = details ? `: ${details}` : "";
      const err = new Error(`Python worker exited with code ${code ?? "unknown"}${suffix}`);
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
    const msg = {
      type: "mesh_job",
      jobId: req.jobId,
      expr: req.f,
      iso: req.iso,
      bbox: req.domain,
      quality: {
        target_edge: req.quality?.target_edge,
      },
      scalar: req.scalars?.[0],
    };

    const res = await this.request(msg, 180000);

    if (!res || res.type !== "result") {
      throw new Error(res?.message || res?.error || "Unknown CGAL worker response");
    }

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
