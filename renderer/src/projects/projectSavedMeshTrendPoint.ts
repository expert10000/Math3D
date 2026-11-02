import { structuralHash, type Math3DProject } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { verifySavedMeshResult } from "./projectSavedMeshResultComparison";
import { compareSavedMeshResults } from "./projectSavedMeshResultComparison";
import { buildSavedMeshResultTrend, type SavedMeshResultTrend } from "./projectSavedMeshResultTrend";

export type SavedMeshTrendTarget = Readonly<{
  projectId: string; resultId: string; resultHash: string; meshId: string;
  revision: number; sourceHash: string; generation: "current" | "retained";
}>;

export type SavedMeshTrendComparison = Readonly<{
  study: SavedMeshResultTrend; a: SavedMeshTrendTarget; b: SavedMeshTrendTarget;
}>;

/** Resolve a dot against current Project bytes before navigation; the plot is never authority. */
export function resolveSavedMeshTrendPoint(project: Math3DProject, study: SavedMeshResultTrend,
  resultId: string, read: ProjectResourceReader): SavedMeshTrendTarget {
  if (study.projectId !== project.identity.id) throw new TypeError("The trend belongs to a different Project.");
  const row = study.rows.find(item => item.resultId === resultId);
  if (!row || row.status !== "available" || !row.resultHash) throw new TypeError("This trend point has no verified saved result.");
  const fresh = buildSavedMeshResultTrend(project, resultId, study.metricPath, read);
  if (structuralHash(fresh) !== structuralHash(study)) throw new TypeError("The saved trend changed. Reopen it before selecting a result.");
  const checked = verifySavedMeshResult(project, resultId, read);
  if (row.generation === "unretained") throw new TypeError("This Mesh generation was never retained.");
  if (checked.resultHash !== row.resultHash || checked.source.identity.id !== study.sourceDocumentId ||
    checked.source.identity.revision !== row.revision || checked.source.identity.structuralHash !== row.sourceHash ||
    checked.generation !== row.generation) throw new TypeError("The saved result or exact Mesh source changed.");
  return { projectId: project.identity.id, resultId, resultHash: checked.resultHash,
    meshId: checked.source.identity.id, revision: checked.source.identity.revision,
    sourceHash: checked.source.identity.structuralHash, generation: checked.generation };
}

/** PC17 applies the existing PC13 comparison to two exact points in one verified trend. */
export function compareSavedMeshTrendPoints(project: Math3DProject, selection: SavedMeshTrendComparison,
  read: ProjectResourceReader) {
  if (selection.a.resultId === selection.b.resultId) throw new TypeError("Pin two distinct saved trend points.");
  const a = resolveSavedMeshTrendPoint(project, selection.study, selection.a.resultId, read);
  const b = resolveSavedMeshTrendPoint(project, selection.study, selection.b.resultId, read);
  if (structuralHash(a) !== structuralHash(selection.a) || structuralHash(b) !== structuralHash(selection.b))
    throw new TypeError("A pinned result or Mesh generation changed. Pin the points again.");
  const evidence = compareSavedMeshResults(project, a.resultId, b.resultId, read);
  if (evidence.a.resultHash !== a.resultHash || evidence.b.resultHash !== b.resultHash ||
    evidence.a.sourceHash !== a.sourceHash || evidence.b.sourceHash !== b.sourceHash)
    throw new TypeError("The A/B result evidence changed during verification.");
  return evidence;
}
