import { compileExpression } from "../../math/expression";
import { marchingCubesVolume } from "../../math/marchingCubes";
import type { SurfaceMeshData, SurfaceMeshSource } from "../../mesh/surfaceMesh";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";

export type SageViewerProvenance = Extract<SurfaceMeshSource, { kind: "sageResult" }>;

export function sageViewerProvenance(record: SymbolicResultRecord, resultExpression: string): SageViewerProvenance {
  return {
    kind: "sageResult",
    operation: record.response.operation,
    backend: record.backend,
    engineVersion: record.response.engineVersion ?? "unreported",
    jobId: record.request.jobId ?? "unreported",
    sourceId: record.source?.id ?? "sage-input:unlinked",
    sourceRevision: record.source?.revision ?? 0,
    sourceFingerprint: record.source?.fingerprint ?? "",
    inputExpression: record.expression,
    resultExpression,
    warnings: [...record.response.warnings],
    createdAt: Date.now(),
  };
}

export function previewSageScalarMesh(record: SymbolicResultRecord): SurfaceMeshData {
  if (!record.response.success || !["sage.symbolic.simplify", "sage.symbolic.factor", "sage.symbolic.expand"].includes(record.response.operation)) {
    throw new Error("This Sage result cannot create scalar geometry.");
  }
  const expression = record.response.result.text;
  if (typeof expression !== "string" || !expression.trim()) throw new Error("Sage did not return a scalar expression.");
  const compiled = compileExpression(expression, ["x", "y", "z"]);
  if (!compiled.fn || compiled.error) throw new Error("The exact expression cannot be evaluated by the viewer expression parser.");
  const size = 32;
  const origin: [number, number, number] = [-2, -2, -2];
  const spacing: [number, number, number] = [4 / (size - 1), 4 / (size - 1), 4 / (size - 1)];
  const scalars = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = compiled.fn({ x: origin[0] + x * spacing[0], y: origin[1] + y * spacing[1], z: origin[2] + z * spacing[2] });
    if (!Number.isFinite(value)) throw new Error("The scalar expression is not finite throughout the preview bounds.");
    scalars[(z * size + y) * size + x] = value;
  }
  const mesh = marchingCubesVolume({ dims: [size, size, size], origin, spacing, scalars }, 0);
  if (!mesh || mesh.indices.length === 0) throw new Error("The scalar expression has no visible zero set in the preview bounds.");
  return { label: `Sage ${record.response.operation.replace("sage.symbolic.", "")} geometry`,
    positions: mesh.positions, indices: mesh.indices, source: sageViewerProvenance(record, expression) };
}

export function previewSageGradientLines(record: SymbolicResultRecord, points: readonly { x: number; y: number; z: number }[]) {
  if (!record.response.success || record.response.operation !== "sage.symbolic.gradient") {
    throw new Error("This Sage result is not a gradient vector.");
  }
  const components = record.response.result.components;
  if (!Array.isArray(components) || components.length !== 3 || !points.length) {
    throw new Error("The gradient or viewer samples are unavailable for an overlay.");
  }
  const compiled = components.map((component) => compileExpression(String(component), ["x", "y", "z"]));
  if (compiled.some((entry) => !entry.fn || entry.error)) {
    throw new Error("The exact gradient cannot be evaluated by the viewer expression parser.");
  }
  const lines: Array<Array<{ x: number; y: number; z: number }>> = [];
  const stride = Math.max(1, Math.ceil(points.length / 64));
  for (let index = 0; index < points.length; index += stride) {
    const point = points[index];
    const vector = compiled.map((entry) => entry.fn!({ x: point.x, y: point.y, z: point.z }));
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (!Number.isFinite(length) || length < 1e-8) continue;
    const scale = 0.25 / length;
    lines.push([point, { x: point.x + vector[0] * scale, y: point.y + vector[1] * scale, z: point.z + vector[2] * scale }]);
  }
  if (!lines.length) throw new Error("No finite nonzero gradient samples were found.");
  return lines;
}
