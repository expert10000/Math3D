import { isStableDocumentId, isStructuralHash, structuralHash,
  type Math3DProject, type ProjectSavedMeshComparison, type StructuralHash } from "@math3d/core";

type ExactSide = ProjectSavedMeshComparison["a"];
/** A non-owning Workbook link to one immutable PC18 Project comparison. */
export type WorkbookSavedMeshComparisonReference = Readonly<{
  schemaVersion: 1;
  projectId: string;
  comparisonId: string;
  comparisonHash: StructuralHash;
  metricPath: string;
  a: ExactSide;
  b: ExactSide;
}>;

const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === keys.sort().join("|");
const validSide = (value: unknown): value is ExactSide => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const side = value as Record<string, unknown>;
  return exact(side, ["resultId", "resultHash", "meshId", "revision", "sourceHash"]) &&
    typeof side.resultId === "string" && side.resultId.length > 0 && side.resultId.length <= 256 &&
    isStructuralHash(side.resultHash) && isStableDocumentId(side.meshId) && String(side.meshId).startsWith("math3d:mesh:") &&
    Number.isSafeInteger(side.revision) && Number(side.revision) >= 1 && isStructuralHash(side.sourceHash);
};

export function normalizeWorkbookSavedMeshComparisonReference(value: unknown): WorkbookSavedMeshComparisonReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Workbook saved Mesh comparison reference.");
  const ref = value as Record<string, unknown>;
  if (!exact(ref, ["schemaVersion", "projectId", "comparisonId", "comparisonHash", "metricPath", "a", "b"]) ||
    ref.schemaVersion !== 1 || !isStableDocumentId(ref.projectId) || !String(ref.projectId).startsWith("math3d:project:") ||
    typeof ref.comparisonId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(ref.comparisonId) ||
    !isStructuralHash(ref.comparisonHash) || typeof ref.metricPath !== "string" || !/^[a-zA-Z0-9_.]{1,160}$/.test(ref.metricPath) ||
    !validSide(ref.a) || !validSide(ref.b) || ref.a.resultId === ref.b.resultId)
    throw new TypeError("Invalid Workbook saved Mesh comparison reference.");
  return ref as WorkbookSavedMeshComparisonReference;
}

export function createWorkbookSavedMeshComparisonReference(project: Math3DProject,
  comparison: ProjectSavedMeshComparison): WorkbookSavedMeshComparisonReference {
  if (!project.savedMeshComparisons?.some(item => item.id === comparison.id && structuralHash(item) === structuralHash(comparison)))
    throw new TypeError("Save the pinned Mesh comparison in this Project before linking it to a Workbook.");
  return normalizeWorkbookSavedMeshComparisonReference({ schemaVersion: 1, projectId: project.identity.id,
    comparisonId: comparison.id, comparisonHash: structuralHash(comparison), metricPath: comparison.metricPath,
    a: comparison.a, b: comparison.b });
}

/** Lightweight check for Workbook freshness; the renderer verifies source bytes before display or export. */
export function inspectWorkbookSavedMeshComparisonReference(project: Math3DProject | null,
  value: WorkbookSavedMeshComparisonReference): "current" | "stale" | "missing" | "different-project" {
  const ref = normalizeWorkbookSavedMeshComparisonReference(value);
  if (!project) return "missing";
  if (project.identity.id !== ref.projectId) return "different-project";
  const comparison = project.savedMeshComparisons?.find(item => item.id === ref.comparisonId);
  if (!comparison) return "missing";
  if (structuralHash(comparison) !== ref.comparisonHash || comparison.metricPath !== ref.metricPath ||
    structuralHash(comparison.a) !== structuralHash(ref.a) || structuralHash(comparison.b) !== structuralHash(ref.b)) return "stale";
  for (const side of [ref.a, ref.b]) {
    const result = project.workspace.results.find(item => item.resultId === side.resultId);
    if (!result) return "missing";
    if (structuralHash(result) !== side.resultHash || result.provenance.source.documentId !== side.meshId ||
      result.provenance.source.revision !== side.revision || result.provenance.source.structuralHash !== side.sourceHash) return "stale";
  }
  return "current";
}
