import { structuralHash, type Math3DProject } from "@math3d/core";
import { normalizeWorkbookSavedMeshReviewReference, type WorkbookSavedMeshReviewReference } from "@math3d/workbook";
import type { ProjectResourceReader } from "./projectResources";
import { createSavedMeshComparisonReviewSnapshot, type MeshReviewEntry, type SavedMeshComparisonReviewSnapshot } from "./projectSavedMeshComparisonReviewReport";

/** Recheck each captured pair and Note. Unavailable rows retain identities, never values or authored text. */
export function inspectWorkbookSavedMeshReview(project: Math3DProject | null, value: WorkbookSavedMeshReviewReference,
  readResource?: ProjectResourceReader): SavedMeshComparisonReviewSnapshot {
  const reference = normalizeWorkbookSavedMeshReviewReference(value);
  const current = project && project.identity.id === reference.projectId && readResource
    ? createSavedMeshComparisonReviewSnapshot(project, readResource) : null;
  const entries: MeshReviewEntry[] = reference.pairs.map(item => {
    const { comparison } = item;
    const base = { comparisonId: comparison.comparisonId, comparisonHash: comparison.comparisonHash,
      title: item.title, metricPath: comparison.metricPath, a: comparison.a, b: comparison.b };
    const unavailable = (reason: string): MeshReviewEntry => ({ ...base, status: "unavailable", reason, values: null,
      observations: item.notes.map(note => ({ noteId: note.noteId, noteRevision: note.revision, noteHash: note.hash,
        status: "unavailable", reason: "The exact Note or pair evidence is unavailable." })) });
    const pair = project?.savedMeshComparisons?.find(saved => saved.id === comparison.comparisonId);
    if (!current || !pair || !project) return unavailable("The saved Project, pair, or source bytes are unavailable.");
    if (structuralHash(pair) !== comparison.comparisonHash) return unavailable("The saved pair changed.");
    const found = current.entries.find(entry => entry.comparisonId === comparison.comparisonId);
    if (!found || found.status !== "verified") return unavailable(found?.reason ?? "Saved pair evidence is unavailable.");
    return { ...base, status: found.status, reason: found.reason, values: found.values,
      observations: item.notes.map(noteRef => {
        const note = project.notes?.find(saved => saved.identity.id === noteRef.noteId);
        const observed = found.observations.find(saved => saved.noteId === noteRef.noteId);
        if (note && observed?.status === "verified" && note.identity.revision === noteRef.revision &&
          note.identity.structuralHash === noteRef.hash && note.title === noteRef.title &&
          note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id)
          return observed;
        return { noteId: noteRef.noteId, noteRevision: noteRef.revision, noteHash: noteRef.hash,
          status: "unavailable" as const, reason: "The exact Note or its evidence changed; text withheld." };
      }) };
  });
  return { format: "mesh-comparison-review/v1", project: { id: reference.projectId,
    revision: project?.identity.revision ?? 0, hash: project ? structuralHash(project) : "unavailable",
    title: project?.metadata.title ?? "Unavailable Project" }, entries };
}
