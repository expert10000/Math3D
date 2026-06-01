import {
  isSquareNumericMatrix,
  normalizeMatlabEigResponse,
  normalizeMatlabRuntimeHealth,
  type MatlabEigResponse,
  type MatlabRuntimeHealthResponse,
} from "./matlabSchemas";

const baseUrlRaw = (import.meta as any)?.env?.VITE_MATLAB_RUNTIME_BASE_URL as string | undefined;
const matlabRuntimeBaseUrl = (baseUrlRaw?.trim() || "http://127.0.0.1:8765").replace(/\/+$/, "");

const matlabServiceUnavailableMessage =
  "MATLAB Runtime Docker service is unreachable. Start it with: docker compose -f integrations/matlab/docker/docker-compose.yml up --build";

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

async function requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${matlabRuntimeBaseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      const serverError = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
      throw new Error(serverError);
    }
    return payload as T;
  } catch (error) {
    const message = asErrorMessage(error, matlabServiceUnavailableMessage);
    if (/failed to fetch|networkerror|abort/i.test(message)) {
      throw new Error(matlabServiceUnavailableMessage);
    }
    throw new Error(message);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkMatlabRuntimeHealth(): Promise<MatlabRuntimeHealthResponse> {
  const payload = await requestJson<unknown>("GET", "/health");
  return normalizeMatlabRuntimeHealth(payload);
}

export async function runMatlabEig(matrix: number[][]): Promise<MatlabEigResponse> {
  if (!isSquareNumericMatrix(matrix)) {
    throw new Error("Matrix must be a square numeric matrix (n x n).");
  }
  const payload = await requestJson<unknown>("POST", "/eig", { matrix });
  return normalizeMatlabEigResponse(payload);
}

