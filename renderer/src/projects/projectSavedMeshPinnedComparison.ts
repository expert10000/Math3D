import { isStructuralHash, structuralHash, type Math3DProject, type ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { compareSavedMeshResults, savedMeshSummaryNumbers } from "./projectSavedMeshResultComparison";
import { compareSavedMeshTrendPoints, type SavedMeshTrendComparison } from "./projectSavedMeshTrendPoint";

/** Keep only exact evidence identities in the Project. No result or Mesh arrays are copied. */
export function createSavedMeshPinnedComparison(project: Math3DProject, selection: SavedMeshTrendComparison,
  read: ProjectResourceReader, id: string, title: string): ProjectSavedMeshComparison {
  const evidence = compareSavedMeshTrendPoints(project, selection, read);
  if (!evidence.compatible || !evidence.metrics.some(metric => metric.path === selection.study.metricPath && metric.difference !== null))
    throw new TypeError("The pinned metric is incompatible or lacks matching units.");
  const side = (item: typeof evidence.a) => {
    if (!isStructuralHash(item.resultHash)) throw new TypeError("The saved result hash is invalid.");
    return { resultId: item.resultId, resultHash: item.resultHash,
      meshId: item.sourceId, revision: item.sourceRevision, sourceHash: item.sourceHash };
  };
  return { id, title: title.trim(), metricPath: selection.study.metricPath, a: side(evidence.a), b: side(evidence.b) };
}

/** Reopen and export must resolve both immutable result envelopes and exact source sidecars. */
export function inspectSavedMeshPinnedComparison(project: Math3DProject, reference: ProjectSavedMeshComparison,
  read: ProjectResourceReader) {
  if (!project.savedMeshComparisons?.some(item => item.id === reference.id && structuralHash(item) === structuralHash(reference)))
    throw new TypeError("This pinned comparison is missing or changed in the Project.");
  const evidence = compareSavedMeshResults(project, reference.a.resultId, reference.b.resultId, read);
  for (const [saved, actual] of [[reference.a, evidence.a], [reference.b, evidence.b]] as const) {
    if (saved.resultHash !== actual.resultHash || saved.meshId !== actual.sourceId ||
      saved.revision !== actual.sourceRevision || saved.sourceHash !== actual.sourceHash)
      throw new TypeError("A pinned result or exact Mesh source changed.");
  }
  if (!evidence.compatible || !evidence.metrics.some(metric => metric.path === reference.metricPath && metric.difference !== null &&
    savedMeshSummaryNumbers(evidence.a.result.summary).some(item => item.path === reference.metricPath)))
    throw new TypeError("The pinned metric is no longer compatible.");
  return evidence;
}
