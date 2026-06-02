import {
  normalizeSageHealth,
  normalizeSageRunResponse,
  type SageHealthResponse,
  type SageRunRequest,
  type SageRunResponse,
} from "./sageSchemas";

const baseUrlRaw = (import.meta as any)?.env?.VITE_SAGE_SERVICE_URL as string | undefined;
const sageBaseUrl = (baseUrlRaw?.trim() || "http://127.0.0.1:8767").replace(/\/+$/, "");

const sageServiceUnavailableMessage =
  "SageMath Docker service is unreachable. Start it with: docker compose -f services/sage-worker/docker-compose.yml up --build";

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

async function requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${sageBaseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : null;
      const serverError = typeof payload?.error === "string" ? payload.error : detail || `HTTP ${response.status}`;
      throw new Error(serverError);
    }
    return payload as T;
  } catch (error) {
    const message = asErrorMessage(error, sageServiceUnavailableMessage);
    if (/failed to fetch|networkerror|abort/i.test(message)) {
      throw new Error(sageServiceUnavailableMessage);
    }
    throw new Error(message);
  } finally {
    window.clearTimeout(timeout);
  }
}

const getBridge = () => (typeof window === "undefined" ? undefined : window.sageService);

export async function checkSageHealth(): Promise<SageHealthResponse> {
  const bridge = getBridge();
  if (bridge?.health) {
    return normalizeSageHealth(await bridge.health());
  }
  const payload = await requestJson<unknown>("GET", "/health");
  return normalizeSageHealth(payload);
}

export async function runSageOperation(request: SageRunRequest): Promise<SageRunResponse> {
  const bridge = getBridge();
  if (bridge?.run) {
    return normalizeSageRunResponse(await bridge.run(request));
  }
  const payload = await requestJson<unknown>("POST", "/run", request);
  return normalizeSageRunResponse(payload);
}

if (typeof window !== "undefined") {
  if (!window.sageService) {
    window.sageService = {
      health: () => requestJson<unknown>("GET", "/health").then(normalizeSageHealth),
      getStatus: () => requestJson<unknown>("GET", "/health").then(normalizeSageHealth),
      run: (request: SageRunRequest) => requestJson<unknown>("POST", "/run", request).then(normalizeSageRunResponse),
    };
  }
}
