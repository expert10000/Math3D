import { ipcMain } from "electron";
import { cancelSagePolynomialJob, runSagePolynomialJob } from "../python/sagePolynomialWorker";
import { cancelSageSymbolicJob, checkLocalSageHealth, LOCAL_SYMBOLIC_OPERATIONS, runSageSymbolicJob } from "../python/sageSymbolicWorker";
import { cancelSageConsoleJob, runSageConsoleJob } from "../python/sageConsoleWorker";

type SageOperation =
  | "sage.symbolic.simplify"
  | "sage.symbolic.factor"
  | "sage.symbolic.expand"
  | "sage.symbolic.solve"
  | "sage.matrix.eigen_exact"
  | "sage.matrix.charpoly"
  | "sage.matrix.linear_dossier"
  | "sage.matrix.integer_forms"
  | "sage.polynomial.roots_exact"
  | "sage.polynomial.factor"
  | "sage.polynomial.dossier"
  | "sage.groebner.compute"
  | "sage.ideal.groebner"
  | "sage.ideal.eliminate"
  | "sage.ideal.membership"
  | "sage.ideal.quotientDimension"
  | "sage.ideal.syzygies"
  | "sage.ideal.hilbertSeries"
  | "sage.algebra.reconstruct"
  | "sage.algebra.inspectDomains"
  | "sage.finiteField.explore"
  | "sage.numberTheory.padic"
  | "sage.numberField.localExtensions"
  | "sage.ellipticCurve.dossier"
  | "sage.numberTheory.gcd"
  | "sage.numberTheory.modInverse"
  | "sage.numberField.elementDossier"
  | "sage.numberField.primeDecomposition"
  | "sage.topology.integer_homology"
  | "sage.complex.analyze";

type SageRunRequest = {
  operation: SageOperation;
  params: Record<string, unknown>;
  jobId?: string;
  backend?: "local" | "docker" | "private";
};

const baseUrl = String(process.env.MATH3D_SAGE_SERVICE_URL || "http://127.0.0.1:8767").replace(/\/+$/, "");
const gatewayUrl = String(process.env.MATH3D_SAGE_GATEWAY_URL || "http://127.0.0.1:8770").replace(/\/+$/, "");
const gatewayToken = String(process.env.MATH3D_SAGE_GATEWAY_TOKEN || "");
const gatewayUrlIsSafe = (() => {
  try {
    const url = new URL(gatewayUrl);
    return !url.username && !url.password && (url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)));
  } catch { return false; }
})();
const serviceUnavailableMessage =
  "SageMath Docker service is unreachable. Start it with: docker compose -f services/sage-worker/docker-compose.yml up --build";
const dockerJobs = new Map<string, AbortController>();
const privateJobs = new Map<string, AbortController>();
const trustedConsoleScopes = new Map<number, Set<string>>();
const observedConsoleSenders = new Set<number>();
const consoleJobOwners = new Map<string, { senderId: number; scope: string }>();
const validConsoleScope = (scope: unknown): scope is string =>
  typeof scope === "string" && /^(console|workbook:[a-zA-Z0-9-]{1,128}:[a-zA-Z0-9-]{1,128})$/.test(scope);

async function requestJson(path: string, init?: RequestInit, signal?: AbortSignal,
  endpoint = baseUrl, credential?: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), endpoint === gatewayUrl ? 25_000 : path === "/run" ? 45_000 : 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${endpoint}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof (payload as any)?.detail === "string" ? (payload as any).detail : null;
      const error = typeof (payload as any)?.error === "string" ? (payload as any).error : detail || `HTTP ${response.status}`;
      const code = typeof (payload as any)?.code === "string" ? `${(payload as any).code}: ` : "";
      throw new Error(`${code}${error}`);
    }
    return payload;
  } catch (error) {
    if (signal?.aborted) throw new Error("Sage job cancelled.");
    const message = error instanceof Error && error.message ? error.message : serviceUnavailableMessage;
    if (/failed to fetch|networkerror|abort|econnrefused/i.test(message)) {
      throw new Error(endpoint === gatewayUrl ? "Private Sage gateway is unreachable." : serviceUnavailableMessage);
    }
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function registerSageServiceIpc(): void {
  ipcMain.handle("sage:console:trust", (event, trusted: boolean, scope = "console") => {
    if (typeof trusted !== "boolean") throw new Error("Invalid Sage console trust setting.");
    if (!validConsoleScope(scope)) throw new Error("Invalid Sage console trust scope.");
    const senderId = event.sender.id;
    if (trusted) {
      const scopes = trustedConsoleScopes.get(senderId) ?? new Set<string>();
      scopes.add(scope);
      trustedConsoleScopes.set(senderId, scopes);
      if (!observedConsoleSenders.has(senderId)) {
        observedConsoleSenders.add(senderId);
        const revoke = () => {
          trustedConsoleScopes.delete(senderId);
          for (const [jobId, owner] of consoleJobOwners) if (owner.senderId === senderId) cancelSageConsoleJob(jobId);
        };
        event.sender.on("did-navigate", revoke);
        event.sender.once("destroyed", () => {
          observedConsoleSenders.delete(senderId);
          revoke();
        });
      }
    } else {
      trustedConsoleScopes.get(senderId)?.delete(scope);
      if (!trustedConsoleScopes.get(senderId)?.size) trustedConsoleScopes.delete(senderId);
      for (const [jobId, owner] of consoleJobOwners) if (owner.senderId === senderId && owner.scope === scope) cancelSageConsoleJob(jobId);
    }
    return { trusted: trustedConsoleScopes.get(senderId)?.has(scope) ?? false };
  });
  ipcMain.handle("sage:console:run", async (event, request: { jobId: string; code: string; scope?: string }) => {
    if (!request || typeof request.jobId !== "string" || typeof request.code !== "string") throw new Error("Invalid Sage console request.");
    const scope = request.scope ?? "console";
    if (!validConsoleScope(scope) || !trustedConsoleScopes.get(event.sender.id)?.has(scope)) throw new Error("Trust the local Sage runtime before executing code.");
    if (consoleJobOwners.has(request.jobId)) throw new Error("Sage console job ID is already running.");
    consoleJobOwners.set(request.jobId, { senderId: event.sender.id, scope });
    try { return await runSageConsoleJob(request.jobId, request.code); }
    finally { consoleJobOwners.delete(request.jobId); }
  });
  ipcMain.handle("sage:console:cancel", (event, jobId: string) => ({
    ok: typeof jobId === "string" && consoleJobOwners.get(jobId)?.senderId === event.sender.id && cancelSageConsoleJob(jobId),
  }));
  ipcMain.handle("sage:health", async (_evt, scope?: "local" | "docker" | "private") => {
    if (scope === "local") return checkLocalSageHealth();
    if (scope !== "private") return requestJson("/health", { method: "GET" });
    if (!gatewayToken || !gatewayUrlIsSafe) return { engine: "sagemath", available: false,
      status: !gatewayToken ? "Private gateway credential is not configured in the desktop runtime."
        : "Private gateway requires HTTPS outside this machine.", operations: [] };
    try { return await requestJson("/health", { method: "GET" }, undefined, gatewayUrl, gatewayToken); }
    catch (error) { return { engine: "sagemath", available: false,
      status: error instanceof Error ? error.message : "Private Sage gateway discovery failed.", operations: [] }; }
  });
  ipcMain.handle("sage:run", async (_evt, req: SageRunRequest) => {
    if (req?.backend != null && req.backend !== "local" && req.backend !== "docker" && req.backend !== "private") {
      throw new Error("Select Local WSL, Docker, or Private gateway SageMath.");
    }
    if (req?.backend === "local" && req.operation !== "sage.polynomial.factor" &&
        req.operation !== "sage.polynomial.roots_exact" &&
        !LOCAL_SYMBOLIC_OPERATIONS.includes(req.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number])) {
      throw new Error("This operation is not available on the local WSL backend. Select Docker SageMath.");
    }
    if (req?.backend !== "docker" && req?.backend !== "private" &&
        (req?.operation === "sage.polynomial.factor" || req?.operation === "sage.polynomial.roots_exact")) {
      return runSagePolynomialJob(req.operation, req.params || {}, req.jobId);
    }
    if (req?.backend !== "docker" && req?.backend !== "private" &&
        LOCAL_SYMBOLIC_OPERATIONS.includes(req?.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number])) {
      return runSageSymbolicJob(req.operation as typeof LOCAL_SYMBOLIC_OPERATIONS[number], req.params || {}, req.jobId);
    }
    if (req?.backend === "private") {
      if (req.operation !== "sage.numberTheory.gcd" && req.operation !== "sage.numberTheory.modInverse")
        throw new Error("The private Sage gateway accepts only GCD and modular inverse.");
      if (!gatewayToken) throw new Error("Private gateway credential is not configured in the desktop runtime.");
      if (!gatewayUrlIsSafe) throw new Error("Private gateway requires HTTPS outside this machine.");
      const jobId = req.jobId;
      if (!jobId || privateJobs.has(jobId)) throw new Error("Private Sage job ID is missing or already running.");
      const controller = new AbortController();
      privateJobs.set(jobId, controller);
      try { return await requestJson("/run", { method: "POST",
        body: JSON.stringify({ operation: req.operation, params: req.params || {}, jobId }) },
        controller.signal, gatewayUrl, gatewayToken); }
      finally { privateJobs.delete(jobId); }
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
    const privateJob = privateJobs.get(jobId);
    if (privateJob) {
      try { await requestJson("/cancel", { method: "POST", body: JSON.stringify({ jobId }) },
        undefined, gatewayUrl, gatewayToken); }
      finally { privateJob.abort(); }
      return { ok: true };
    }
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
