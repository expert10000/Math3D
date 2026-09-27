import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { mainDebugLog } from "../debugLog";
import type { CgalBooleanMeshRequest, CgalBooleanMeshResponse } from "../ipc/cgalMeshIpc";
import { WorkerAdmissionQueue, WorkerRestartBudget } from "./workerRuntimePolicy";
import {
  decodeM3DMesh, decodeNativeCgalResponse, encodeM3DMesh, encodeNativeCgalRequest,
  NATIVE_CGAL_HEADER_BYTES, nativeCgalResponseLength, type NativeCgalOpcode,
} from "./nativeCgalProtocol";

type Pending = {
  jobId: string; opcode: NativeCgalOpcode;
  resolve: (value: ReturnType<typeof decodeNativeCgalResponse>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function executablePath(): string | null {
  const name = process.platform === "win32" ? "math3d-cgal-worker.exe" : "math3d-cgal-worker";
  const root = path.resolve(__dirname, "../../..");
  const candidates = [
    process.env.MATH3D_CGAL_NATIVE_EXE,
    ...(app.isPackaged
      ? [path.join(process.resourcesPath, "native-cgal", name)]
      : [path.join(root, "build/native/cgal-worker/Release", name),
         path.join(root, "build/native/cgal-worker", name)]),
  ];
  return candidates.find((candidate): candidate is string => !!candidate && fs.existsSync(candidate)) ?? null;
}

class NativeCgalWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly admission = new WorkerAdmissionQueue("Native CGAL worker");
  private readonly restarts = new WorkerRestartBudget();
  private pending: Pending | null = null;
  private output = Buffer.alloc(0);
  private starting: Promise<void> | null = null;
  private generation = 0;
  private stopped = false;

  constructor(private readonly executable: string) {}

  private fail(error: Error, countFailure = true): void {
    const child = this.child;
    this.child = null;
    this.output = Buffer.alloc(0);
    if (countFailure) this.restarts.recordFailure();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
    child?.kill();
    mainDebugLog("[native-cgal] process stopped", { error: error.message, ...this.restarts.snapshot() });
  }

  private onData(chunk: Buffer): void {
    this.output = Buffer.concat([this.output, chunk]);
    try {
      while (this.output.length >= NATIVE_CGAL_HEADER_BYTES) {
        const size = nativeCgalResponseLength(this.output.subarray(0, NATIVE_CGAL_HEADER_BYTES));
        if (this.output.length < size) break;
        const response = decodeNativeCgalResponse(this.output.subarray(0, size));
        this.output = this.output.subarray(size);
        const pending = this.pending;
        if (!pending || pending.jobId !== response.jobId || pending.opcode !== response.opcode) {
          throw new Error("Unexpected native CGAL response identity");
        }
        clearTimeout(pending.timer);
        this.pending = null;
        if (response.ok) pending.resolve(response);
        else pending.reject(new Error(response.message || "Native CGAL operation failed"));
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.stopped) throw new Error("Native CGAL worker stopped");
    if (this.child) return;
    if (this.starting) return this.starting;
    if (!this.restarts.canStart()) throw new Error("Native CGAL restart budget exhausted");
    this.starting = (async () => {
      const child = spawn(this.executable, [], { stdio: "pipe", windowsHide: true });
      this.child = child;
      const generation = ++this.generation;
      child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
      child.stderr.on("data", (chunk: Buffer) => mainDebugLog("[native-cgal] stderr", chunk.toString("utf8").slice(0, 4096)));
      child.on("error", (error) => { if (this.child === child) this.fail(error); });
      child.on("exit", (code, signal) => {
        if (this.child === child) this.fail(new Error(`Native CGAL exited (${code ?? signal})`));
      });
      try {
        const version = await this.exchange(2, `startup-${generation}`, undefined, undefined, 5000);
        if (!version.message.includes("protocol=1;capabilities=mesh.boolean")) {
          throw new Error("Native CGAL protocol/capability mismatch");
        }
        const health = await this.exchange(1, `health-${generation}`, undefined, undefined, 5000);
        if (health.message !== "healthy") throw new Error("Native CGAL health check failed");
        mainDebugLog("[native-cgal] ready", { executable: this.executable, version: version.message });
      } catch (error) {
        if (this.child === child) this.fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  private exchange(opcode: NativeCgalOpcode, jobId: string, meshA?: Buffer, meshB?: Buffer,
                   timeoutMs = 120_000, operation?: CgalBooleanMeshRequest["operation"]):
                   Promise<ReturnType<typeof decodeNativeCgalResponse>> {
    const child = this.child;
    if (!child || this.pending) return Promise.reject(new Error("Native CGAL transport is busy or stopped"));
    const frame = encodeNativeCgalRequest(opcode, jobId, meshA, meshB, operation);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Native CGAL ${jobId} timed out`)), timeoutMs);
      this.pending = { jobId, opcode, resolve, reject, timer };
      child.stdin.write(frame, (error) => {
        if (error && this.child === child) this.fail(error);
      });
    });
  }

  async boolean(req: CgalBooleanMeshRequest): Promise<CgalBooleanMeshResponse> {
    const meshA = encodeM3DMesh(req.positionsA, req.indicesA);
    const meshB = encodeM3DMesh(req.positionsB, req.indicesB);
    const release = await this.admission.acquire(req.jobId, meshA.length + meshB.length,
      Date.now() + 125_000, "interactive");
    try {
      await this.ensureStarted();
      const response = await this.exchange(3, req.jobId, meshA, meshB, 120_000, req.operation);
      const output = decodeM3DMesh(response.mesh);
      mainDebugLog("[native-cgal] boolean complete", {
        jobId: req.jobId, operation: req.operation, vertices: output.vertexCount, faces: output.triCount,
      });
      return {
        ok: true, ...output,
        boolean: {
          operation: req.operation, kernel: "native-cgal",
          inputAFaces: req.indicesA.byteLength / 12, inputBFaces: req.indicesB.byteLength / 12,
          outputFaces: output.triCount, diagnostics: ["Standalone native CGAL worker"], warnings: [],
        },
      };
    } finally {
      release();
    }
  }

  async health(): Promise<boolean> {
    const release = await this.admission.acquire("native-health", 0, Date.now() + 10_000, "interactive");
    try {
      await this.ensureStarted();
      return (await this.exchange(1, `health-${Date.now()}`, undefined, undefined, 5000)).message === "healthy";
    } finally { release(); }
  }

  async version(): Promise<string> {
    const release = await this.admission.acquire("native-version", 0, Date.now() + 10_000, "interactive");
    try {
      await this.ensureStarted();
      return (await this.exchange(2, `version-${Date.now()}`, undefined, undefined, 5000)).message;
    } finally { release(); }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const error = new Error("Native CGAL worker stopped");
    this.admission.close(error);
    this.fail(error, false);
  }
}

let singleton: NativeCgalWorker | null = null;
let selectedExecutable: string | null = null;

export function getNativeCgalWorker(): NativeCgalWorker | null {
  const executable = executablePath();
  if (!executable) return null;
  if (!singleton || selectedExecutable !== executable) {
    singleton?.stop();
    singleton = new NativeCgalWorker(executable);
    selectedExecutable = executable;
  }
  return singleton;
}

export function stopNativeCgalWorker(): void {
  singleton?.stop();
  singleton = null;
  selectedExecutable = null;
}
