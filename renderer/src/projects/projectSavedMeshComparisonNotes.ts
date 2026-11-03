import { createProjectNote, inspectProjectNoteAnchor, structuralHash,
  type Math3DProject, type ProjectNote, type ProjectNoteAnchorResolver, type ProjectSavedMeshComparison } from "@math3d/core";
import { inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import type { ProjectResourceReader } from "./projectResources";

/** Author text is bound to the saved PC18 pair, never to a transient A/B picker. */
export function createProjectSavedMeshComparisonNote(project: Math3DProject, pair: ProjectSavedMeshComparison,
  readResource: ProjectResourceReader, title: string, body: string, createdAt: number, stableKey: string): ProjectNote {
  inspectSavedMeshPinnedComparison(project, pair, readResource);
  return createProjectNote({ projectId: project.identity.id, stableKey, kind: "text", title: title.trim(), body: body.trim(), createdAt,
    anchor: { kind: "saved-mesh-comparison", comparisonId: pair.id, comparisonHash: structuralHash(pair),
      metricPath: pair.metricPath, a: pair.a, b: pair.b } });
}

export function resolveProjectSavedMeshComparisonNoteTarget(project: Math3DProject, comparisonId: string,
  readResource: ProjectResourceReader) {
  const pair = project.savedMeshComparisons?.find(item => item.id === comparisonId);
  if (!pair) return null;
  let available = false;
  try { inspectSavedMeshPinnedComparison(project, pair, readResource); available = true; }
  catch { /* Keep the authored Note visible while its exact evidence is unavailable. */ }
  return { hash: structuralHash(pair), metricPath: pair.metricPath, a: pair.a, b: pair.b, available };
}

export function inspectProjectSavedMeshComparisonNote(project: Math3DProject, note: ProjectNote,
  readResource: ProjectResourceReader) {
  const resolver: ProjectNoteAnchorResolver = { projectId: project.identity.id, source: () => null,
    savedMeshComparison: id => resolveProjectSavedMeshComparisonNoteTarget(project, id, readResource) };
  return inspectProjectNoteAnchor(note, resolver);
}

/** Only current, fully checked observations may accompany a comparison report. */
export function checkedProjectSavedMeshComparisonObservations(project: Math3DProject, pair: ProjectSavedMeshComparison,
  readResource: ProjectResourceReader) {
  return (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id).map(note => {
    const state = inspectProjectSavedMeshComparisonNote(project, note, readResource);
    if (state.status !== "current") throw new TypeError(`Saved Mesh observation is ${state.status}: ${state.reason}`);
    return { noteId: note.identity.id, noteRevision: note.identity.revision, noteHash: note.identity.structuralHash,
      title: note.title, body: note.body };
  });
}
