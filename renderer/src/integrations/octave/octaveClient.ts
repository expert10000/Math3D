import {
  isNumericVector,
  isSquareNumericMatrix,
  normalizeOctaveEigResponse,
  normalizeOctaveHealth,
  normalizeOctaveSolveResponse,
  type OctaveEigResponse,
  type OctaveHealthResponse,
  type OctaveSolveResponse,
} from "./octaveSchemas";

const baseUrlRaw = (import.meta as any)?.env?.VITE_OCTAVE_SERVICE_URL as string | undefined;
const octaveBaseUrl = (baseUrlRaw?.trim() || "http://127.0.0.1:8766").replace(/\/+$/, "");

const octaveServiceUnavailableMessage =
  "Octave Docker service is unreachable. Start it with: docker compose -f integrations/octave/docker/docker-compose.yml up --build";

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

async function requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${octaveBaseUrl}${path}`, {
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
    const message = asErrorMessage(error, octaveServiceUnavailableMessage);
    if (/failed to fetch|networkerror|abort/i.test(message)) {
      throw new Error(octaveServiceUnavailableMessage);
    }
    throw new Error(message);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function checkOctaveHealth(): Promise<OctaveHealthResponse> {
  const payload = await requestJson<unknown>("GET", "/health");
  return normalizeOctaveHealth(payload);
}

export async function runOctaveEig(matrix: number[][]): Promise<OctaveEigResponse> {
  if (!isSquareNumericMatrix(matrix)) {
    throw new Error("Matrix must be a square numeric matrix (n x n).");
  }
  const payload = await requestJson<unknown>("POST", "/eig", { matrix });
  return normalizeOctaveEigResponse(payload);
}

export async function runOctaveSolve(matrix: number[][], rhs: number[]): Promise<OctaveSolveResponse> {
  if (!isSquareNumericMatrix(matrix)) {
    throw new Error("Matrix must be a square numeric matrix (n x n).");
  }
  if (!isNumericVector(rhs)) {
    throw new Error("rhs must be a numeric vector.");
  }
  if (rhs.length !== matrix.length) {
    throw new Error("rhs length must match matrix dimension.");
  }
  const payload = await requestJson<unknown>("POST", "/solve", { matrix, rhs });
  return normalizeOctaveSolveResponse(payload);
}

if (typeof window !== "undefined") {
  if (!window.octaveService) {
    window.octaveService = {
      health: () => checkOctaveHealth(),
      getStatus: () => checkOctaveHealth(),
      eig: (matrix: number[][]) => runOctaveEig(matrix),
      solve: (matrix: number[][], rhs: number[]) => runOctaveSolve(matrix, rhs),
    };
  }
}
