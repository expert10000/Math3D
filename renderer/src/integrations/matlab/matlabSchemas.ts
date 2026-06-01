export type MatlabRuntimeHealthResponse = {
  status: string;
  runtime: string;
  packageLoaded: boolean;
  mode?: string;
  warning?: string;
};

export type MatlabEigResponse = {
  ok: boolean;
  inputShape: [number, number];
  eigenvalues: number[];
  eigenvectors: number[][];
  elapsedMs: number;
  error?: string;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

export const isSquareNumericMatrix = (matrix: unknown): matrix is number[][] => {
  if (!Array.isArray(matrix) || matrix.length === 0) return false;
  if (!matrix.every((row) => Array.isArray(row))) return false;
  const firstLen = (matrix[0] as unknown[]).length;
  if (!Number.isInteger(firstLen) || firstLen <= 0) return false;
  if (matrix.length !== firstLen) return false;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== firstLen) return false;
    for (const entry of row) {
      if (asFiniteNumber(entry) == null) return false;
    }
  }
  return true;
};

export const normalizeMatlabRuntimeHealth = (payload: unknown): MatlabRuntimeHealthResponse => {
  const data = payload as Partial<MatlabRuntimeHealthResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /health response: object expected.");
  }
  if (typeof data.status !== "string" || !data.status) {
    throw new Error("Invalid /health response: missing status.");
  }
  if (typeof data.runtime !== "string" || !data.runtime) {
    throw new Error("Invalid /health response: missing runtime.");
  }
  if (typeof data.packageLoaded !== "boolean") {
    throw new Error("Invalid /health response: missing packageLoaded.");
  }
  return {
    status: data.status,
    runtime: data.runtime,
    packageLoaded: data.packageLoaded,
    mode: typeof data.mode === "string" ? data.mode : undefined,
    warning: typeof data.warning === "string" ? data.warning : undefined,
  };
};

export const normalizeMatlabEigResponse = (payload: unknown): MatlabEigResponse => {
  const data = payload as Partial<MatlabEigResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /eig response: object expected.");
  }
  if (typeof data.ok !== "boolean") {
    throw new Error("Invalid /eig response: missing ok.");
  }
  if (!data.ok) {
    return {
      ok: false,
      inputShape: [0, 0],
      eigenvalues: [],
      eigenvectors: [],
      elapsedMs: 0,
      error: typeof data.error === "string" ? data.error : "MATLAB eig request failed.",
    };
  }
  const shape = data.inputShape;
  if (!Array.isArray(shape) || shape.length !== 2 || asFiniteNumber(shape[0]) == null || asFiniteNumber(shape[1]) == null) {
    throw new Error("Invalid /eig response: inputShape must be a [rows, cols] tuple.");
  }
  if (!Array.isArray(data.eigenvalues) || !data.eigenvalues.every((value) => asFiniteNumber(value) != null)) {
    throw new Error("Invalid /eig response: eigenvalues must be numeric.");
  }
  if (
    !Array.isArray(data.eigenvectors) ||
    !data.eigenvectors.every(
      (row) => Array.isArray(row) && row.every((value) => asFiniteNumber(value) != null)
    )
  ) {
    throw new Error("Invalid /eig response: eigenvectors must be a numeric matrix.");
  }
  const elapsedMs = asFiniteNumber(data.elapsedMs);
  if (elapsedMs == null) {
    throw new Error("Invalid /eig response: elapsedMs must be numeric.");
  }
  return {
    ok: true,
    inputShape: [Math.round(Number(shape[0])), Math.round(Number(shape[1]))],
    eigenvalues: data.eigenvalues.map((value) => Number(value)),
    eigenvectors: data.eigenvectors.map((row) => row.map((value) => Number(value))),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
};

