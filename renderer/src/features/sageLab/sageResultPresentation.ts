import type { SageRunResponse } from "../../integrations/sage/sageSchemas";

export type SageResultKind = "expression" | "vector" | "matrix" | "solution" | "error";
export type SageSourceStatus = "current" | "stale" | "unavailable" | "unlinked";

const SCALAR_GEOMETRY_OPERATIONS = new Set([
  "sage.symbolic.simplify", "sage.symbolic.factor", "sage.symbolic.expand",
]);
const SOLUTION_OPERATIONS = new Set([
  "sage.symbolic.solve", "sage.symbolic.singularities", "sage.polynomial.roots_exact",
]);

export function sageResultKind(response: SageRunResponse): SageResultKind {
  if (!response.success) return "error";
  if (response.operation === "sage.symbolic.gradient") return "vector";
  if (response.operation === "sage.symbolic.hessian" || response.operation.startsWith("sage.matrix.")) return "matrix";
  if (SOLUTION_OPERATIONS.has(response.operation)) return "solution";
  return "expression";
}

export function sageResultActions(response: SageRunResponse, sourceStatus: SageSourceStatus) {
  const kind = sageResultKind(response);
  const usableSource = sourceStatus === "current" || sourceStatus === "unlinked";
  return {
    visualize: kind === "vector" && sourceStatus === "current",
    createGeometry: kind === "expression" && usableSource && SCALAR_GEOMETRY_OPERATIONS.has(response.operation),
    saveWorkbook: true,
  };
}

export function sageResultDiagnostics(response: SageRunResponse): string[] {
  return Array.isArray(response.result.diagnostics) ? response.result.diagnostics.map(String) : [];
}
