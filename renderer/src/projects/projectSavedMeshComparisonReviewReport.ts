import { structuralHash, type Math3DProject, type ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import { inspectProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";

type SideReference = ProjectSavedMeshComparison["a"];
export type MeshReviewObservation = {
  noteId: string; noteRevision: number; noteHash: string;
  status: "verified" | "unavailable"; reason: string;
  title?: string; body?: string;
};
export type MeshReviewEntry = {
  comparisonId: string; comparisonHash: string; title: string; metricPath: string;
  a: SideReference; b: SideReference;
  status: "verified" | "unavailable"; reason: string;
  values: { a: number; b: number; difference: number; unit: string } | null;
  observations: MeshReviewObservation[];
};
export type SavedMeshComparisonReviewSnapshot = {
  format: "mesh-comparison-review/v1";
  project: { id: string; revision: number; hash: string; title: string };
  entries: MeshReviewEntry[];
};

/** Captures exact references and only values/Note text whose sources verify now. */
export function createSavedMeshComparisonReviewSnapshot(project: Math3DProject,
  readResource: ProjectResourceReader): SavedMeshComparisonReviewSnapshot {
  const entries = (project.savedMeshComparisons ?? []).map((pair): MeshReviewEntry => {
    const linked = (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id);
    const base = { comparisonId: pair.id, comparisonHash: structuralHash(pair), title: pair.title,
      metricPath: pair.metricPath, a: pair.a, b: pair.b };
    try {
      const evidence = inspectSavedMeshPinnedComparison(project, pair, readResource);
      const metric = evidence.metrics.find(item => item.path === pair.metricPath && item.difference !== null);
      if (!metric || metric.a === null || metric.b === null || metric.difference === null || !metric.unit)
        throw new TypeError("The selected scalar metric has no verified, qualified values.");
      const observations = linked.map((note): MeshReviewObservation => {
        const reference = { noteId: note.identity.id, noteRevision: note.identity.revision, noteHash: note.identity.structuralHash };
        const state = inspectProjectSavedMeshComparisonNote(project, note, readResource);
        return state.status === "current" ? { ...reference, status: "verified", reason: state.reason,
          title: note.title, body: note.body } : { ...reference, status: "unavailable", reason: state.reason };
      });
      return { ...base, status: "verified", reason: "Both exact saved results and Mesh sidecars verify.",
        values: { a: metric.a, b: metric.b, difference: metric.difference, unit: metric.unit }, observations };
    } catch (error) {
      return { ...base, status: "unavailable", reason: (error as Error).message, values: null,
        observations: linked.map(note => ({ noteId: note.identity.id, noteRevision: note.identity.revision,
          noteHash: note.identity.structuralHash, status: "unavailable", reason: "The comparison evidence is unavailable." })) };
    }
  });
  return { format: "mesh-comparison-review/v1", project: { id: project.identity.id,
    revision: project.identity.revision, hash: structuralHash(project), title: project.metadata.title }, entries };
}
