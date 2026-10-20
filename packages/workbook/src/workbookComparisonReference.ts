import { inspectProjectCompositionAvailability, isStableDocumentId, isStructuralHash, structuralHash, type Math3DProject, type ProjectComposition, type StructuralHash } from "@math3d/core";

/** A non-owning link to an exact saved Project composition generation. */
export type WorkbookComparisonReference = Readonly<{
  schemaVersion: 1;
  projectId: string;
  compositionId: string;
  compositionHash: StructuralHash;
}>;

export function normalizeWorkbookComparisonReference(value: unknown): WorkbookComparisonReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Workbook comparison reference.");
  const ref = value as Record<string, unknown>;
  if (Object.keys(ref).sort().join("|") !== ["schemaVersion", "projectId", "compositionId", "compositionHash"].sort().join("|") ||
    ref.schemaVersion !== 1 || !isStableDocumentId(ref.projectId) || !String(ref.projectId).startsWith("math3d:project:") ||
    typeof ref.compositionId !== "string" || !ref.compositionId || ref.compositionId.length > 120 ||
    !isStructuralHash(ref.compositionHash)) throw new TypeError("Invalid Workbook comparison reference.");
  return ref as WorkbookComparisonReference;
}

export function createWorkbookComparisonReference(project: Math3DProject, composition: ProjectComposition): WorkbookComparisonReference {
  if (!project.compositions?.some(item => item.id === composition.id && structuralHash(item) === structuralHash(composition)))
    throw new TypeError("Save this comparison in the Project before linking it to a Workbook.");
  return { schemaVersion: 1, projectId: project.identity.id, compositionId: composition.id, compositionHash: structuralHash(composition) };
}

export function inspectWorkbookComparisonReference(project: Math3DProject | null, value: WorkbookComparisonReference):
  { status: "current" | "stale" | "missing" | "different-project"; composition: ProjectComposition | null } {
  const ref = normalizeWorkbookComparisonReference(value);
  if (!project) return { status: "missing", composition: null };
  if (project.identity.id !== ref.projectId) return { status: "different-project", composition: null };
  const composition = project.compositions?.find(item => item.id === ref.compositionId) ?? null;
  if (!composition) return { status: "missing", composition: null };
  if (structuralHash(composition) !== ref.compositionHash) return { status: "stale", composition };
  const available = inspectProjectCompositionAvailability(composition, project.workspace);
  return { status: available.every(item => item === "current" || item === "retained-checkpoint") ? "current" : "missing", composition };
}
