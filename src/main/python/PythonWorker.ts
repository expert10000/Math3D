import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  CgalMeshRequest,
  CgalMeshResponse,
  GeodesicHeatRequest,
  GeodesicHeatResponse,
} from "../ipc/cgalMeshIpc";

export type VtkMeshOp = "vtk_clean_normals" | "vtk_decimate" | "vtk_smooth";
export type VtkMeshRequest = {
  jobId: string;
  positions: ArrayBuffer | ArrayBufferView | Buffer;
  indices: ArrayBuffer | ArrayBufferView | Buffer;
  options?: {
    targetReduction?: number;
    targetFaces?: number;
    iterations?: number;
    passband?: number;
    computeNormals?: boolean;
  };
};
export type VtkMeshResponse =
  | {
      ok: true;
      positions: ArrayBuffer;
      indices: ArrayBuffer;
      normals?: ArrayBuffer;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

export type VtkPreviewRequest = {
  jobId: string;
  expr: string;
  iso: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  resolution: number;
  targetFaces?: number;
  targetReduction?: number;
};

export type VtkVolumeSliceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView | Buffer;
  axis?: "x" | "y" | "z";
  index?: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  plane?: {
    center: [number, number, number];
    normal: [number, number, number];
    u: [number, number, number];
    v: [number, number, number];
    width: number;
    height: number;
    resolution?: [number, number];
  };
  window?: { low: number; high: number };
};

export type VtkVolumeSliceResponse =
  | {
      ok: true;
      data: ArrayBuffer;
      width: number;
      height: number;
      format: "rgba8";
      min?: number;
      max?: number;
    }
  | { ok: false; error: string };

export type VtkVolumeIsosurfaceRequest = {
  jobId: string;
  dims: [number, number, number];
  scalars: ArrayBuffer | ArrayBufferView | Buffer;
  iso: number;
  spacing?: [number, number, number];
  origin?: [number, number, number];
};

export type VtkVolumeIsosurfaceResponse =
  | {
      ok: true;
      positions: ArrayBuffer;
      indices: ArrayBuffer;
      normals?: ArrayBuffer;
      vertexCount: number;
      triCount: number;
    }
  | { ok: false; error: string };

export type VtkVolumeDistanceRequest = {
  jobId: string;
  dims: [number, number, number];
  positions: ArrayBuffer | ArrayBufferView | Buffer;
  indices: ArrayBuffer | ArrayBufferView | Buffer;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  signed?: boolean;
  windingNumber?: boolean;
};

export type VtkVolumeDistanceResponse =
  | {
      ok: true;
      scalars: ArrayBuffer;
      dims: [number, number, number];
    }
  | { ok: false; error: string };

export type VtkVolumeStreamlinesRequest = {
  jobId: string;
  dims: [number, number, number];
  vectors: ArrayBuffer | ArrayBufferView | Buffer;
  spacing?: [number, number, number];
  origin?: [number, number, number];
  seeds: [number, number, number][];
  stepSize?: number;
  maxSteps?: number;
  maxLength?: number;
};

export type VtkVolumeStreamlinesResponse =
  | { ok: true; lines: number[][][] }
  | { ok: false; error: string };

type Pending = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
};

type BinaryPart = { name: string; bytes: number };
type PendingBinary = {
  jobId: string;
  meta: any;
  parts: BinaryPart[];
  totalBytes: number;
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

function toBuffer(data: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.from([]);
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const out = new ArrayBuffer(buf.byteLength);
  Buffer.from(out).set(buf);
  return out;
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
  private stdoutBuffer = Buffer.alloc(0);
  private pendingBinary: PendingBinary | null = null;

  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    const envVerbose = String(process.env.MATH3D_CGAL_VERBOSE || "").toLowerCase();
    const envLog = String(process.env.MATH3D_CGAL_LOG_STDERR || "").toLowerCase();
    const truthy = (v: string) => ["1", "true", "yes", "on", "y"].includes(v);
    this.envLogStderr = truthy(envVerbose) || truthy(envLog);
    this.logStderr = this.envLogStderr;

    proc.stdout.on("data", (buf: Buffer) => {
      this.handleStdout(buf);
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

  private resolveMessage(msg: any) {
    const jobId = msg?.jobId;
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

    if (msg.type === "error" || msg.ok === false) {
      pending.reject(new Error(msg.message || msg.error || "Python worker error"));
      return;
    }

    pending.resolve(msg);
  }

  private handleStdout(buf: Buffer) {
    if (!buf?.length) return;
    const chunk = Buffer.from(buf);
    this.stdoutBuffer = this.stdoutBuffer.length ? Buffer.concat([this.stdoutBuffer, chunk]) : chunk;

    while (true) {
      if (this.pendingBinary) {
        if (this.stdoutBuffer.length < this.pendingBinary.totalBytes) return;
        const payload = this.stdoutBuffer.subarray(0, this.pendingBinary.totalBytes);
        this.stdoutBuffer = this.stdoutBuffer.subarray(this.pendingBinary.totalBytes);

        const payloads: Record<string, Buffer> = {};
        let offset = 0;
        for (const part of this.pendingBinary.parts) {
          const next = offset + part.bytes;
          payloads[part.name] = payload.subarray(offset, next);
          offset = next;
        }

        const msg = { ...this.pendingBinary.meta, binaryPayloads: payloads };
        this.pendingBinary = null;
        this.resolveMessage(msg);
        continue;
      }

      const nl = this.stdoutBuffer.indexOf(10);
      if (nl < 0) return;
      const lineBuf = this.stdoutBuffer.subarray(0, nl);
      this.stdoutBuffer = this.stdoutBuffer.subarray(nl + 1);

      if (!lineBuf.length) continue;
      let msg: any;
      try {
        msg = JSON.parse(lineBuf.toString("utf8"));
      } catch {
        continue;
      }

      const binaryParts: BinaryPart[] = Array.isArray(msg?.binary)
        ? msg.binary
            .map((p: any) => ({
              name: String(p?.name ?? ""),
              bytes: Number(p?.bytes ?? 0),
            }))
            .filter((p: BinaryPart) => p.name && p.bytes > 0)
        : [];

      if (binaryParts.length && msg?.jobId) {
        const total = binaryParts.reduce((sum, p) => sum + p.bytes, 0);
        this.pendingBinary = { jobId: msg.jobId, meta: msg, parts: binaryParts, totalBytes: total };
        if (total === 0) {
          const msgWithPayloads = { ...msg, binaryPayloads: {} };
          this.pendingBinary = null;
          this.resolveMessage(msgWithPayloads);
        }
        continue;
      }

      this.resolveMessage(msg);
    }
  }

  private request(job: any, timeoutMs = 120000, payloads?: Buffer[]): Promise<any> {
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
      if (payloads && payloads.length) {
        for (const payload of payloads) {
          if (payload?.length) this.proc.stdin.write(payload);
        }
      }
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

  async vtkMesh(op: VtkMeshOp, req: VtkMeshRequest): Promise<VtkMeshResponse> {
    const positionsBuf = toBuffer(req.positions);
    const indicesBuf = toBuffer(req.indices);
    if (!positionsBuf.length || !indicesBuf.length) {
      return { ok: false, error: "VTK mesh request missing buffers" };
    }

    const msg = {
      type: "vtk_job",
      jobId: req.jobId,
      op,
      options: req.options ?? {},
      binary: [
        { name: "positions", bytes: positionsBuf.length },
        { name: "indices", bytes: indicesBuf.length },
      ],
    };

    const t0 = Date.now();
    const res = await this.request(msg, 180000, [positionsBuf, indicesBuf]);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk response received", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      vertexCount: res?.vertexCount,
      triCount: res?.triCount,
    });

    if (!res || res.type !== "vtk_result") {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK worker response" };
    }

    const payloads = res.binaryPayloads as Record<string, Buffer> | undefined;
    const pos = payloads?.positions;
    const idx = payloads?.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK worker returned empty buffers" };
    }

    const normals = payloads?.normals;
    return {
      ok: true,
      positions: bufferToArrayBuffer(pos),
      indices: bufferToArrayBuffer(idx),
      normals: normals ? bufferToArrayBuffer(normals) : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkPreviewImplicit(req: VtkPreviewRequest): Promise<VtkMeshResponse> {
    const msg = {
      type: "vtk_preview",
      jobId: req.jobId,
      expr: req.expr,
      iso: req.iso,
      bbox: req.domain,
      resolution: req.resolution,
      targetFaces: req.targetFaces,
      targetReduction: req.targetReduction,
    };

    const t0 = Date.now();
    const res = await this.request(msg, 180000);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk preview response", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      vertexCount: res?.vertexCount,
      triCount: res?.triCount,
    });

    if (!res || res.type !== "vtk_result") {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK preview response" };
    }

    const payloads = res.binaryPayloads as Record<string, Buffer> | undefined;
    const pos = payloads?.positions;
    const idx = payloads?.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK preview returned empty buffers" };
    }

    const normals = payloads?.normals;
    return {
      ok: true,
      positions: bufferToArrayBuffer(pos),
      indices: bufferToArrayBuffer(idx),
      normals: normals ? bufferToArrayBuffer(normals) : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkVolumeSlice(req: VtkVolumeSliceRequest): Promise<VtkVolumeSliceResponse> {
    const scalarsBuf = toBuffer(req.scalars);
    if (!scalarsBuf.length) {
      return { ok: false, error: "VTK volume slice request missing scalars buffer" };
    }

    const msg = {
      type: "volume_slice",
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

    const t0 = Date.now();
    const res = await this.request(msg, 180000, [scalarsBuf]);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk volume slice response", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      width: res?.width,
      height: res?.height,
    });

    if (!res || res.type !== "volume_slice_result" || res.ok === false) {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK volume slice response" };
    }

    const payloads = res.binaryPayloads as Record<string, Buffer> | undefined;
    const data = payloads?.data;
    if (!data) {
      return { ok: false, error: "VTK volume slice returned empty buffer" };
    }

    return {
      ok: true,
      data: bufferToArrayBuffer(data),
      width: Number(res.width) || 0,
      height: Number(res.height) || 0,
      format: "rgba8",
      min: typeof res.min === "number" ? res.min : undefined,
      max: typeof res.max === "number" ? res.max : undefined,
    };
  }

  async vtkVolumeIsosurface(req: VtkVolumeIsosurfaceRequest): Promise<VtkVolumeIsosurfaceResponse> {
    const scalarsBuf = toBuffer(req.scalars);
    if (!scalarsBuf.length) {
      return { ok: false, error: "VTK volume isosurface request missing scalars buffer" };
    }

    const msg = {
      type: "volume_isosurface",
      jobId: req.jobId,
      dims: req.dims,
      iso: req.iso,
      spacing: req.spacing,
      origin: req.origin,
      binary: [{ name: "scalars", bytes: scalarsBuf.length }],
    };

    const t0 = Date.now();
    const res = await this.request(msg, 180000, [scalarsBuf]);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk volume isosurface response", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      vertexCount: res?.vertexCount,
      triCount: res?.triCount,
    });

    if (!res || res.type !== "volume_isosurface_result" || res.ok === false) {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK volume isosurface response" };
    }

    const payloads = res.binaryPayloads as Record<string, Buffer> | undefined;
    const pos = payloads?.positions;
    const idx = payloads?.indices;
    if (!pos || !idx) {
      return { ok: false, error: "VTK volume isosurface returned empty buffers" };
    }

    const normals = payloads?.normals;
    return {
      ok: true,
      positions: bufferToArrayBuffer(pos),
      indices: bufferToArrayBuffer(idx),
      normals: normals ? bufferToArrayBuffer(normals) : undefined,
      vertexCount: Number(res.vertexCount) || Math.floor(pos.byteLength / 12),
      triCount: Number(res.triCount) || Math.floor(idx.byteLength / 12),
    };
  }

  async vtkVolumeDistance(req: VtkVolumeDistanceRequest): Promise<VtkVolumeDistanceResponse> {
    const positionsBuf = toBuffer(req.positions);
    const indicesBuf = toBuffer(req.indices);
    if (!positionsBuf.length || !indicesBuf.length) {
      return { ok: false, error: "VTK volume distance request missing mesh buffers" };
    }

    const msg = {
      type: "volume_distance",
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

    const t0 = Date.now();
    const res = await this.request(msg, 180000, [positionsBuf, indicesBuf]);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk volume distance response", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
    });

    if (!res || res.type !== "volume_distance_result" || res.ok === false) {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK volume distance response" };
    }

    const payloads = res.binaryPayloads as Record<string, Buffer> | undefined;
    const scalars = payloads?.scalars;
    if (!scalars) {
      return { ok: false, error: "VTK volume distance returned empty buffer" };
    }

    return {
      ok: true,
      scalars: bufferToArrayBuffer(scalars),
      dims: Array.isArray(res.dims) && res.dims.length === 3 ? res.dims : req.dims,
    };
  }

  async vtkVolumeStreamlines(req: VtkVolumeStreamlinesRequest): Promise<VtkVolumeStreamlinesResponse> {
    const vectorsBuf = toBuffer(req.vectors);
    if (!vectorsBuf.length) {
      return { ok: false, error: "VTK streamlines request missing vectors buffer" };
    }

    const msg = {
      type: "volume_streamlines",
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

    const t0 = Date.now();
    const res = await this.request(msg, 180000, [vectorsBuf]);
    const t1 = Date.now();
    console.log("[CGAL worker] vtk streamlines response", {
      jobId: req.jobId,
      type: res?.type,
      ms: t1 - t0,
      lines: Array.isArray(res?.lines) ? res.lines.length : 0,
    });

    if (!res || res.type !== "volume_streamlines_result" || res.ok === false) {
      return { ok: false, error: res?.message || res?.error || "Unknown VTK streamlines response" };
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
