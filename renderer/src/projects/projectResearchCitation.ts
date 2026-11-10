import { createResearchReference, inspectResearchReference, researchResourcePins,
  type Math3DProject, type ProjectResourceReader } from "@math3d/core";
import { inspectNotebookReference, normalizeNotebookReference, type NotebookReference } from "@math3d/workbook";

export type ResearchCitationStatus = "current" | "historical" | "missing" | "corrupt" | "different-project";
export type ResearchCitationAssessment = Readonly<{ status: ResearchCitationStatus; reason: string;
  targetId: string | null; kind: NotebookReference["kind"] | null; sourceId: string | null;
  sourceRevision: number | null; resourceStatus: "verified" | "not-checked" | "missing" }>;

/** Legacy Workbook citations are projected into the shared reference at read time. */
export function assessProjectResearchCitation(project: Math3DProject, candidate: unknown,
  reader?: ProjectResourceReader): ResearchCitationAssessment {
  const reference = normalizeNotebookReference(candidate);
  if (!reference) return { status: "corrupt", reason: "Citation structure or hash is invalid.",
    targetId: null, kind: null, sourceId: null, sourceRevision: null, resourceStatus: "not-checked" };
  const base = { targetId: reference.targetId, kind: reference.kind,
    sourceId: reference.source.documentId, sourceRevision: reference.source.revision };
  let inspection: ReturnType<typeof inspectNotebookReference>;
  try { inspection = inspectNotebookReference(project, reference); }
  catch { return { ...base, status: "missing", reason: "Referenced Project source is unavailable or invalid.",
    resourceStatus: "missing" }; }
  if (inspection.status !== "current") return { ...base,
    status: inspection.status === "stale" ? "historical" : inspection.status,
    reason: inspection.reason, resourceStatus: "not-checked" };
  const targetHash = reference.kind === "result" ? reference.resultHash :
    reference.kind === "study" ? reference.studyHash : reference.source.structuralHash;
  try {
    const shared = createResearchReference({ projectId: reference.projectId, kind: reference.kind,
      targetId: reference.targetId, source: reference.source, targetHash,
      resources: researchResourcePins(project, reference.source.documentId) });
    const checked = inspectResearchReference(project, shared, reader);
    return { ...base, status: checked.resourceStatus === "missing" ? "missing" : checked.status === "current" ? "current" :
      checked.status === "historical" ? "historical" : checked.status === "invalid" ? "corrupt" : checked.status,
      reason: checked.reason, resourceStatus: checked.resourceStatus };
  } catch {
    return { ...base, status: "missing", reason: "Required source resource could not be checked.", resourceStatus: "missing" };
  }
}
