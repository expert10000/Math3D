import { structuralHash, type Math3DProject } from "@math3d/core";
import { inspectWorkbookSavedMeshComparisonReference, normalizeWorkbookSavedMeshComparisonReference,
  type WorkbookSavedMeshComparisonReference } from "@math3d/workbook";
import type { ProjectResourceReader } from "./projectResources";
import { inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import type { SavedMeshTrendTarget } from "./projectSavedMeshTrendPoint";

export function inspectWorkbookSavedMeshComparison(project: Math3DProject | null,
  value: WorkbookSavedMeshComparisonReference, read?: ProjectResourceReader) {
  const reference = normalizeWorkbookSavedMeshComparisonReference(value);
  const status = inspectWorkbookSavedMeshComparisonReference(project, reference);
  if (status !== "current") return { status, evidence: null, reason: `Saved pinned comparison is ${status}.` } as const;
  if (!project || !read) return { status: "missing" as const, evidence: null, reason: "Project resource bytes are unavailable." };
  const saved = project.savedMeshComparisons?.find(item => item.id === reference.comparisonId);
  if (!saved || structuralHash(saved) !== reference.comparisonHash)
    return { status: "stale" as const, evidence: null, reason: "Saved pinned comparison changed." };
  try {
    const evidence = inspectSavedMeshPinnedComparison(project, saved, read);
    return { status: "current" as const, evidence, reason: "Both exact results and Mesh source sidecars verified." };
  } catch (error) {
    return { status: "missing" as const, evidence: null, reason: (error as Error).message };
  }
}

export function resolveWorkbookSavedMeshComparisonTarget(project: Math3DProject,
  reference: WorkbookSavedMeshComparisonReference, slot: "a" | "b", read: ProjectResourceReader): SavedMeshTrendTarget {
  const inspected = inspectWorkbookSavedMeshComparison(project, reference, read);
  if (inspected.status !== "current" || !inspected.evidence)
    throw new TypeError(`Exact saved Mesh result unavailable: ${inspected.reason}`);
  const side = inspected.evidence[slot];
  if (side.generation !== "current" && side.generation !== "retained") throw new TypeError("Mesh generation is unavailable.");
  return { projectId: project.identity.id, resultId: side.resultId, resultHash: side.resultHash,
    meshId: side.sourceId, revision: side.sourceRevision, sourceHash: side.sourceHash, generation: side.generation };
}
