import type { Math3DProject } from "@math3d/core";
import { inspectProjectComparisonNote } from "./projectComparisonNotes";
import type { ProjectResourceReader } from "./projectResources";

/** Authored Notes stay listed when their exact source evidence becomes unavailable. */
export function buildProjectCoordinateObservationReview(project: Math3DProject, readResource: ProjectResourceReader) {
  return (project.notes ?? []).flatMap(note => {
    const anchor = note.anchor;
    if (anchor?.kind !== "comparison" || !anchor.coordinateProbe) return [];
    const state = inspectProjectComparisonNote(project, note, readResource);
    const current = state.status === "current";
    const composition = current ? project.compositions?.find(item => item.id === anchor.compositionId) : null;
    return [{ noteId: note.identity.id, noteRevision: note.identity.revision, noteHash: note.identity.structuralHash,
      title: note.title, compositionId: anchor.compositionId, compositionHash: anchor.compositionHash,
      compositionTitle: composition?.title ?? null, sourceSlot: anchor.coordinateProbe.sourceSlot,
      sources: anchor.members.map((member, index) => ({ slot: index === 0 ? "A" as const : "B" as const,
        id: member.id, revision: member.revision, hash: member.structuralHash })),
      frame: anchor.coordinateProbe.coordinateFrame.frame, unit: anchor.coordinateProbe.coordinateFrame.unit,
      status: state.status, reason: current ? null : state.reason,
      body: current ? note.body : null, point: current ? anchor.coordinateProbe.point : null }];
  });
}
export type ProjectCoordinateObservationReviewRow = ReturnType<typeof buildProjectCoordinateObservationReview>[number];
