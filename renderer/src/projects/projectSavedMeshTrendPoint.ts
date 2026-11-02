import { structuralHash, type Math3DProject } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { verifySavedMeshResult } from "./projectSavedMeshResultComparison";
import { buildSavedMeshResultTrend, type SavedMeshResultTrend } from "./projectSavedMeshResultTrend";

export type SavedMeshTrendTarget = Readonly<{
  projectId: string; resultId: string; resultHash: string; meshId: string;
  revision: number; sourceHash: string; generation: "current" | "retained";
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
  if (checked.resultHash !== row.resultHash || checked.source.identity.id !== study.sourceDocumentId ||
    checked.source.identity.revision !== row.revision || checked.source.identity.structuralHash !== row.sourceHash ||
    checked.generation !== row.generation) throw new TypeError("The saved result or exact Mesh source changed.");
  return { projectId: project.identity.id, resultId, resultHash: checked.resultHash,
    meshId: checked.source.identity.id, revision: checked.source.identity.revision,
    sourceHash: checked.source.identity.structuralHash, generation: checked.generation };
}
