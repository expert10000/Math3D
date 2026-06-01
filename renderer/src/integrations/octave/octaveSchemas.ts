export type OctaveHealthResponse = {
  status: string;
  engine: string;
  available: boolean;
};

export type OctaveEigResponse = {
  ok: boolean;
  engine: string;
  inputShape: [number, number];
  eigenvalues: number[];
  eigenvectors: number[][];
  elapsedMs: number;
  error?: string;
};

export type OctaveSolveResponse = {
  ok: boolean;
  engine: string;
  inputShape: [number, number];
  solution: number[];
  residualNorm: number;
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

export const isNumericVector = (vector: unknown): vector is number[] => {
  if (!Array.isArray(vector) || vector.length === 0) return false;
  return vector.every((entry) => asFiniteNumber(entry) != null);
};

export const normalizeOctaveHealth = (payload: unknown): OctaveHealthResponse => {
  const data = payload as Partial<OctaveHealthResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /health response: object expected.");
  }
  if (typeof data.status !== "string" || !data.status) {
    throw new Error("Invalid /health response: missing status.");
  }
  if (typeof data.engine !== "string" || !data.engine) {
    throw new Error("Invalid /health response: missing engine.");
  }
  if (typeof data.available !== "boolean") {
    throw new Error("Invalid /health response: missing available.");
  }
  return {
    status: data.status,
    engine: data.engine,
    available: data.available,
  };
};

export const normalizeOctaveEigResponse = (payload: unknown): OctaveEigResponse => {
  const data = payload as Partial<OctaveEigResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /eig response: object expected.");
  }
  if (typeof data.ok !== "boolean") {
    throw new Error("Invalid /eig response: missing ok.");
  }
  const engine = typeof data.engine === "string" && data.engine ? data.engine : "gnu-octave";
  if (!data.ok) {
    return {
      ok: false,
      engine,
      inputShape: [0, 0],
      eigenvalues: [],
      eigenvectors: [],
      elapsedMs: 0,
      error: typeof data.error === "string" ? data.error : "Octave eig request failed.",
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
    !data.eigenvectors.every((row) => Array.isArray(row) && row.every((value) => asFiniteNumber(value) != null))
  ) {
    throw new Error("Invalid /eig response: eigenvectors must be a numeric matrix.");
  }
  const elapsedMs = asFiniteNumber(data.elapsedMs);
  if (elapsedMs == null) {
    throw new Error("Invalid /eig response: elapsedMs must be numeric.");
  }
  return {
    ok: true,
    engine,
    inputShape: [Math.round(Number(shape[0])), Math.round(Number(shape[1]))],
    eigenvalues: data.eigenvalues.map((value) => Number(value)),
    eigenvectors: data.eigenvectors.map((row) => row.map((value) => Number(value))),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
};

export const normalizeOctaveSolveResponse = (payload: unknown): OctaveSolveResponse => {
  const data = payload as Partial<OctaveSolveResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid /solve response: object expected.");
  }
  if (typeof data.ok !== "boolean") {
    throw new Error("Invalid /solve response: missing ok.");
  }
  const engine = typeof data.engine === "string" && data.engine ? data.engine : "gnu-octave";
  if (!data.ok) {
    return {
      ok: false,
      engine,
      inputShape: [0, 0],
      solution: [],
      residualNorm: 0,
      elapsedMs: 0,
      error: typeof data.error === "string" ? data.error : "Octave solve request failed.",
    };
  }
  const shape = data.inputShape;
  if (!Array.isArray(shape) || shape.length !== 2 || asFiniteNumber(shape[0]) == null || asFiniteNumber(shape[1]) == null) {
    throw new Error("Invalid /solve response: inputShape must be a [rows, cols] tuple.");
  }
  if (!Array.isArray(data.solution) || !data.solution.every((value) => asFiniteNumber(value) != null)) {
    throw new Error("Invalid /solve response: solution must be numeric.");
  }
  const residualNorm = asFiniteNumber(data.residualNorm);
  if (residualNorm == null) {
    throw new Error("Invalid /solve response: residualNorm must be numeric.");
  }
  const elapsedMs = asFiniteNumber(data.elapsedMs);
  if (elapsedMs == null) {
    throw new Error("Invalid /solve response: elapsedMs must be numeric.");
  }
  return {
    ok: true,
    engine,
    inputShape: [Math.round(Number(shape[0])), Math.round(Number(shape[1]))],
    solution: data.solution.map((value) => Number(value)),
    residualNorm: Number(residualNorm),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
};
