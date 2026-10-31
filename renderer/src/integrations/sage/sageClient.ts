import {
  normalizeSageHealth,
  normalizeSageRunResponse,
  type SageHealthResponse,
  type SageRunRequest,
  type SageRunResponse,
} from "./sageSchemas";

const baseUrlRaw = (import.meta as any)?.env?.VITE_SAGE_SERVICE_URL as string | undefined;
const sageBaseUrl = (baseUrlRaw?.trim() || "http://127.0.0.1:8767").replace(/\/+$/, "");
const localSageBaseUrl = "/api/sage";
const dockerJobs = new Map<string, AbortController>();

const sageServiceUnavailableMessage =
  "SageMath Docker service is unreachable. Start it with: docker compose -f services/sage-worker/docker-compose.yml up --build";
const localSageUnavailableMessage =
  "Local SageMath web proxy is unavailable. Start MATH3D with its web proxy and install SageMath in WSL Ubuntu.";
export const isLocalSageOperation = (operation: string) =>
  operation === "sage.polynomial.factor" || operation === "sage.polynomial.roots_exact" ||
  operation === "sage.symbolic.simplify" || operation === "sage.symbolic.factor" ||
  operation === "sage.symbolic.expand" || operation === "sage.symbolic.solve" ||
  operation === "sage.symbolic.gradient" || operation === "sage.symbolic.hessian" ||
  operation === "sage.symbolic.singularities";

export const selectedSageBackend = (request: SageRunRequest): "local" | "docker" => {
  if (request.backend != null && request.backend !== "local" && request.backend !== "docker") {
    throw new Error("Select Local WSL or Docker SageMath.");
  }
  return request.backend ?? (isLocalSageOperation(request.operation) ? "local" : "docker");
};

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

async function requestJson<T>(
  method: "GET" | "POST", path: string, body?: unknown,
  baseUrl = sageBaseUrl, unavailableMessage = sageServiceUnavailableMessage,
  timeoutMs = 15_000,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!payload || typeof payload !== "object") throw new Error(unavailableMessage);
    if (!response.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : null;
      const serverError = typeof payload?.error === "string" ? payload.error : detail || `HTTP ${response.status}`;
      throw new Error(serverError);
    }
    return payload as T;
  } catch (error) {
    if (signal?.aborted) throw new Error("Sage Docker job cancelled.");
    const message = asErrorMessage(error, unavailableMessage);
    if (/failed to fetch|networkerror|abort/i.test(message)) {
      throw new Error(unavailableMessage);
    }
    throw new Error(message);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

const runDocker = async (request: SageRunRequest): Promise<SageRunResponse> => {
  const jobId = request.jobId;
  if (jobId && dockerJobs.has(jobId)) throw new Error("Sage Docker job ID is already running.");
  const controller = new AbortController();
  if (jobId) dockerJobs.set(jobId, controller);
  try {
    return normalizeSageRunResponse(await requestJson<unknown>(
      "POST", "/run", request, sageBaseUrl, sageServiceUnavailableMessage, 15_000, controller.signal,
    ));
  } finally {
    if (jobId) dockerJobs.delete(jobId);
  }
};

const cancelSageJob = async (jobId: string): Promise<{ ok: boolean }> => {
  const dockerJob = dockerJobs.get(jobId);
  if (dockerJob) {
    try {
      await requestJson("POST", "/cancel", { jobId });
    } finally {
      dockerJob.abort();
    }
    return { ok: true };
  }
  return requestJson<{ ok: boolean }>(
    "POST", "/cancel", { jobId }, localSageBaseUrl, localSageUnavailableMessage, 10_000,
  );
};

const getBridge = () => (typeof window === "undefined" ? undefined : window.sageService);

export async function checkSageHealth(scope: "local" | "docker" = "docker"): Promise<SageHealthResponse> {
  const bridge = getBridge();
  if (bridge?.health) {
    return normalizeSageHealth(await bridge.health(scope));
  }
  const payload = scope === "local"
    ? await requestJson<unknown>("GET", "/health", undefined, localSageBaseUrl, localSageUnavailableMessage)
    : await requestJson<unknown>("GET", "/health");
  return normalizeSageHealth(payload);
}

export async function runSageOperation(request: SageRunRequest): Promise<SageRunResponse> {
  const backend = selectedSageBackend(request);
  if (backend === "local" && !isLocalSageOperation(request.operation)) {
    throw new Error("This operation is not available on the local WSL backend. Select Docker SageMath.");
  }
  const bridge = getBridge();
  if (bridge?.run) {
    return normalizeSageRunResponse(await bridge.run({ ...request, backend }));
  }
  if (backend === "docker") return runDocker(request);
  const payload = await requestJson<unknown>(
    "POST", "/run", request, localSageBaseUrl, localSageUnavailableMessage, 35_000,
  );
  return normalizeSageRunResponse(payload);
}

if (typeof window !== "undefined") {
  if (!window.sageService) {
    window.sageService = {
      health: (scope?: "local" | "docker") => (scope === "local"
        ? requestJson<unknown>("GET", "/health", undefined, localSageBaseUrl, localSageUnavailableMessage)
        : requestJson<unknown>("GET", "/health")).then(normalizeSageHealth),
      getStatus: () => requestJson<unknown>("GET", "/health").then(normalizeSageHealth),
      run: (request: SageRunRequest) => selectedSageBackend(request) === "local"
        ? requestJson<unknown>("POST", "/run", request, localSageBaseUrl, localSageUnavailableMessage, 35_000).then(normalizeSageRunResponse)
        : runDocker(request),
      cancel: cancelSageJob,
    };
  }
}
