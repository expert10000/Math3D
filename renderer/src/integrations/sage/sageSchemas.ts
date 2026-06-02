export type SageOperation =
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
  | "sage.numberTheory.modInverse";

export type SageHealthResponse = {
  status: string;
  engine: "sagemath" | string;
  available: boolean;
  operations: SageOperation[];
};

export type SageRunRequest = {
  operation: SageOperation;
  params: Record<string, unknown>;
};

export type SageRunResponse = {
  engine: "sagemath" | string;
  operation: SageOperation | string;
  success: boolean;
  latex: string;
  result: Record<string, unknown>;
  warnings: string[];
  elapsedMs?: number;
  error?: string;
};

export const SAGE_OPERATIONS: SageOperation[] = [
  "sage.symbolic.simplify",
  "sage.symbolic.factor",
  "sage.symbolic.expand",
  "sage.symbolic.solve",
  "sage.matrix.eigen_exact",
  "sage.matrix.charpoly",
  "sage.polynomial.roots_exact",
  "sage.polynomial.factor",
  "sage.groebner.compute",
  "sage.numberTheory.gcd",
  "sage.numberTheory.modInverse",
];

const SAGE_OPERATION_SET = new Set<string>(SAGE_OPERATIONS);

export const isSageOperation = (value: unknown): value is SageOperation =>
  typeof value === "string" && SAGE_OPERATION_SET.has(value);

export const normalizeSageHealth = (payload: unknown): SageHealthResponse => {
  const data = payload as Partial<SageHealthResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Sage /health response: object expected.");
  }
  if (typeof data.status !== "string" || !data.status) {
    throw new Error("Invalid Sage /health response: missing status.");
  }
  if (typeof data.engine !== "string" || !data.engine) {
    throw new Error("Invalid Sage /health response: missing engine.");
  }
  if (typeof data.available !== "boolean") {
    throw new Error("Invalid Sage /health response: missing available.");
  }
  const operations = Array.isArray(data.operations)
    ? data.operations.filter(isSageOperation)
    : [];
  return {
    status: data.status,
    engine: data.engine,
    available: data.available,
    operations,
  };
};

export const normalizeSageRunResponse = (payload: unknown): SageRunResponse => {
  const data = payload as Partial<SageRunResponse> | null;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Sage /run response: object expected.");
  }
  if (typeof data.success !== "boolean") {
    throw new Error("Invalid Sage /run response: missing success.");
  }
  if (typeof data.engine !== "string" || !data.engine) {
    throw new Error("Invalid Sage /run response: missing engine.");
  }
  const operation = typeof data.operation === "string" ? data.operation : "unknown";
  const result = data.result && typeof data.result === "object" && !Array.isArray(data.result)
    ? data.result as Record<string, unknown>
    : {};
  return {
    engine: data.engine,
    operation,
    success: data.success,
    latex: typeof data.latex === "string" ? data.latex : "",
    result,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
    elapsedMs: typeof data.elapsedMs === "number" && Number.isFinite(data.elapsedMs)
      ? Math.max(0, Math.round(data.elapsedMs))
      : undefined,
    error: typeof data.error === "string" && data.error ? data.error : undefined,
  };
};
