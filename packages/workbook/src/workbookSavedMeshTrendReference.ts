import { isStableDocumentId, isStructuralHash, structuralHash, type Math3DProject, type StructuralHash } from "@math3d/core";

/** Non-owning reference to a fixed set of saved Mesh results, never sampled arrays. */
export type WorkbookSavedMeshTrendReference = Readonly<{
  schemaVersion: 1;
  projectId: string;
  meshId: string;
  operation: string;
  algorithm: string;
  algorithmVersion: string;
  metricPath: string;
  results: readonly Readonly<{ resultId: string; resultHash: StructuralHash; revision: number; sourceHash: StructuralHash }>[];
}>;

const text = (value: unknown, max = 256): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;

export function normalizeWorkbookSavedMeshTrendReference(value: unknown): WorkbookSavedMeshTrendReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid saved Mesh trend reference.");
  const ref = value as Record<string, unknown>;
  if (Object.keys(ref).sort().join("|") !== ["schemaVersion", "projectId", "meshId", "operation", "algorithm", "algorithmVersion", "metricPath", "results"].sort().join("|") ||
    ref.schemaVersion !== 1 || !isStableDocumentId(ref.projectId) || !String(ref.projectId).startsWith("math3d:project:") ||
    !isStableDocumentId(ref.meshId) || !text(ref.operation) || !ref.operation.startsWith("mesh.saved.") ||
    !text(ref.algorithm) || !text(ref.algorithmVersion, 64) || !text(ref.metricPath) ||
    !Array.isArray(ref.results) || ref.results.length < 1 || ref.results.length > 64) throw new TypeError("Invalid saved Mesh trend reference.");
  const ids = new Set<string>();
  for (const item of ref.results) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Invalid saved Mesh trend result.");
    const result = item as Record<string, unknown>;
    if (Object.keys(result).sort().join("|") !== ["resultId", "resultHash", "revision", "sourceHash"].sort().join("|") ||
      !text(result.resultId) || ids.has(result.resultId) || !isStructuralHash(result.resultHash) ||
      !Number.isSafeInteger(result.revision) || Number(result.revision) < 1 || !isStructuralHash(result.sourceHash))
      throw new TypeError("Invalid saved Mesh trend result.");
    ids.add(result.resultId);
  }
  return ref as WorkbookSavedMeshTrendReference;
}

/** Lightweight freshness check; the renderer also verifies retained source bytes on open. */
export function inspectWorkbookSavedMeshTrendReference(project: Math3DProject | null, value: WorkbookSavedMeshTrendReference):
  "current" | "stale" | "missing" | "different-project" {
  const ref = normalizeWorkbookSavedMeshTrendReference(value);
  if (!project) return "missing";
  if (project.identity.id !== ref.projectId) return "different-project";
  const source = project.workspace.entries.find(item => item.module === "mesh" && item.expected.id === ref.meshId);
  if (!source) return "missing";
  for (const expected of ref.results) {
    const result = project.workspace.results.find(item => item.resultId === expected.resultId);
    if (!result) return "missing";
    if (structuralHash(result) !== expected.resultHash || result.provenance.source.documentId !== ref.meshId ||
      result.provenance.source.revision !== expected.revision || result.provenance.source.structuralHash !== expected.sourceHash ||
      result.provenance.operation.type !== ref.operation || result.provenance.operation.algorithm !== ref.algorithm ||
      result.provenance.operation.algorithmVersion !== ref.algorithmVersion) return "stale";
  }
  return "current";
}
