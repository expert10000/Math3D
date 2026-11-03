import type { Math3DProject, ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import { inspectProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";

export type SavedMeshComparisonReviewRow = {
  pair: ProjectSavedMeshComparison;
  status: "verified" | "unavailable";
  reason: string;
  observationCount: number;
  verifiedObservations: readonly { id: string; title: string }[];
};

/** A bounded read-only index over the Project's saved references (at most 32). */
export function buildSavedMeshComparisonReview(project: Math3DProject, readResource: ProjectResourceReader): SavedMeshComparisonReviewRow[] {
  return (project.savedMeshComparisons ?? []).map(pair => {
    const linked = (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id);
    try {
      inspectSavedMeshPinnedComparison(project, pair, readResource);
      const verifiedObservations = linked.filter(note => inspectProjectSavedMeshComparisonNote(project, note, readResource).status === "current")
        .map(note => ({ id: note.identity.id, title: note.title }));
      return { pair, status: "verified" as const, reason: "Both exact saved results and Mesh sidecars verify.",
        observationCount: linked.length, verifiedObservations };
    } catch (error) {
      return { pair, status: "unavailable" as const, reason: (error as Error).message,
        observationCount: linked.length, verifiedObservations: [] };
    }
  });
}
