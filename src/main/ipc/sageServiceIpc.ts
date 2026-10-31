import { ipcMain } from "electron";
import { cancelSagePolynomialJob, runSagePolynomialJob } from "../python/sagePolynomialWorker";
import { cancelSageSymbolicJob, checkLocalSageHealth, LOCAL_SYMBOLIC_OPERATIONS, runSageSymbolicJob } from "../python/sageSymbolicWorker";

type SageOperation =
  | "sage.symbolic.simplify"
  | "sage.symbolic.factor"
  | "sage.symbolic.expand"
  | "sage.symbolic.solve"
  | "sage.matrix.eigen_exact"
  | "sage.matrix.charpoly"
  | "sage.polynomial.roots_exact"
  | "sage.polynomial.factor"
  | "sage.groebner.compute"
  | "sage.numberTheory.gcd"
  | "sage.numberTheory.modInverse"
  | "sage.topology.integer_homology"
  | "sage.complex.analyze";

type SageRunRequest = {
  operation: SageOperation;
  params: Record<string, unknown>;
  jobId?: string;
  backend?: "local" | "docker";
};

const baseUrl = String(process.env.MATH3D_SAGE_SERVICE_URL || "http://127.0.0.1:8767").replace(/\/+$/, "");
const serviceUnavailableMessage =
  "SageMath Docker service is unreachable. Start it with: docker compose -f services/sage-worker/docker-compose.yml up --build";
const dockerJobs = new Map<string, AbortController>();

async function requestJson(path: string, init?: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof (payload as any)?.detail === "string" ? (payload as any).detail : null;
      const error = typeof (payload as any)?.error === "string" ? (payload as any).error : detail || `HTTP ${response.status}`;
      throw new Error(error);
    }
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new Error("Sage Docker job cancelled.");
    const message = error instanceof Error && error.message ? error.message : serviceUnavailableMessage;
    if (/failed to fetch|networkerror|abort|econnrefused/i.test(message)) {
      throw new Error(serviceUnavailableMessage);
    }
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function registerSageServiceIpc(): void {
  ipcMain.handle("sage:health", async (_evt, scope?: "local" | "docker") =>
    scope === "local" ? checkLocalSageHealth() : requestJson("/health", { method: "GET" }));
  ipcMain.handle("sage:run", async (_evt, req: SageRunRequest) => {
    if (req?.backend != null && req.backend !== "local" && req.backend !== "docker") {
      throw new Error("Select Local WSL or Docker SageMath.");
    }
    if (req?.backend === "local" && req.operation !== "sage.polynomial.factor" &&
        req.operation !== "sage.polynomial.roots_exact" &&
        !LOCAL_SYMBOLIC_OPERATIONS.includes(req.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number])) {
      throw new Error("This operation is not available on the local WSL backend. Select Docker SageMath.");
    }
    if (req?.backend !== "docker" && (req?.operation === "sage.polynomial.factor" || req?.operation === "sage.polynomial.roots_exact")) {
      return runSagePolynomialJob(req.operation, req.params || {}, req.jobId);
    }
    if (req?.backend !== "docker" && LOCAL_SYMBOLIC_OPERATIONS.includes(req?.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number])) {
      return runSageSymbolicJob(req.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number], req.params || {}, req.jobId);
    }
    const jobId = typeof req?.jobId === "string" ? req.jobId : undefined;
    if (jobId && dockerJobs.has(jobId)) throw new Error("Sage Docker job ID is already running.");
    const controller = new AbortController();
    if (jobId) dockerJobs.set(jobId, controller);
    try {
      return await requestJson("/run", {
        method: "POST",
        body: JSON.stringify({
          operation: req?.operation,
          params: req?.params || {},
          jobId,
        }),
      }, controller.signal);
    } finally {
      if (jobId) dockerJobs.delete(jobId);
    }
  });
  ipcMain.handle("sage:cancel", async (_evt, jobId: string) => {
    if (typeof jobId !== "string") return { ok: false };
    const dockerJob = dockerJobs.get(jobId);
    if (dockerJob) {
      try {
        await requestJson("/cancel", { method: "POST", body: JSON.stringify({ jobId }) });
      } finally {
        dockerJob.abort();
      }
      return { ok: true };
    }
    return { ok: cancelSagePolynomialJob(jobId) || cancelSageSymbolicJob(jobId) };
  });
}
