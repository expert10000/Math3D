import type { Math3DProject } from "@math3d/core";
import { normalizeWorkbookSavedMeshTrendReference, type WorkbookSavedMeshTrendReference } from "@math3d/workbook";
import type { ProjectResourceReader } from "./projectResources";
import { buildSavedMeshResultTrend, type SavedMeshResultTrend } from "./projectSavedMeshResultTrend";

const recorded = (study: SavedMeshResultTrend) => study.rows.filter(row => row.resultId !== null);
const fingerprint = (study: SavedMeshResultTrend) => recorded(study).map(row => ({ resultId: row.resultId!, resultHash: row.resultHash!,
  revision: row.revision, sourceHash: row.sourceHash }));

export function createWorkbookSavedMeshTrendReference(project: Math3DProject, anchorId: string, metricPath: string,
  read: ProjectResourceReader): WorkbookSavedMeshTrendReference {
  const study = buildSavedMeshResultTrend(project, anchorId, metricPath, read);
  if (recorded(study).some(row => row.status !== "available") || recorded(study).length === 0)
    throw new TypeError("Verify every saved Mesh result and exact source before linking this trend.");
  return normalizeWorkbookSavedMeshTrendReference({ schemaVersion: 1, projectId: project.identity.id,
    meshId: study.sourceDocumentId, operation: study.operation, algorithm: study.algorithm,
    algorithmVersion: study.algorithmVersion, metricPath, results: fingerprint(study) });
}

export function inspectWorkbookSavedMeshTrend(project: Math3DProject | null, value: WorkbookSavedMeshTrendReference,
  read?: ProjectResourceReader): { status: "current" | "stale" | "missing" | "different-project"; study: SavedMeshResultTrend | null; reason: string } {
  const ref = normalizeWorkbookSavedMeshTrendReference(value);
  if (!project) return { status: "missing", study: null, reason: "Open the linked Project." };
  if (project.identity.id !== ref.projectId) return { status: "different-project", study: null, reason: "The Project ID differs." };
  if (!read) return { status: "missing", study: null, reason: "Project resource bytes are unavailable." };
  try {
    const study = buildSavedMeshResultTrend(project, ref.results[0]!.resultId, ref.metricPath, read);
    if (study.sourceDocumentId !== ref.meshId || study.operation !== ref.operation || study.algorithm !== ref.algorithm ||
      study.algorithmVersion !== ref.algorithmVersion) return { status: "stale", study: null, reason: "The saved Mesh method changed." };
    if (recorded(study).some(row => row.status !== "available"))
      return { status: "missing", study: null, reason: "A saved result, retained source generation, or sidecar is unavailable." };
    if (JSON.stringify(fingerprint(study)) !== JSON.stringify(ref.results))
      return { status: "stale", study: null, reason: "The exact saved result set or source hashes changed. Relink the trend." };
    return { status: "current", study, reason: "All exact saved results and source bytes are verified." };
  } catch (error) { return { status: "missing", study: null, reason: (error as Error).message }; }
}
