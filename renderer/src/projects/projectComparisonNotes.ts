import { createProjectNote, inspectProjectNoteAnchor, sameProjectCoordinateFrame, structuralHash,
  type Math3DProject, type ProjectComposition, type ProjectNote, type ProjectNoteAnchorResolver } from "@math3d/core";
import { createProjectComparisonEvidence } from "./projectComparisonEvidence";
import { verifyProjectCompositionEvidenceSources } from "./projectCompositionEvidenceSource";
import { resolveLinkedCoordinateProbe, resolveSavedCoordinateProbe, type LinkedCoordinateProbe } from "./projectLinkedCoordinateProbe";
import type { ProjectResourceReader } from "./projectResources";

export function createProjectComparisonNote(project: Math3DProject, composition: ProjectComposition,
  readResource: ProjectResourceReader, title: string, body: string, createdAt: number, stableKey: string,
  probe?: LinkedCoordinateProbe): ProjectNote {
  const evidence = createProjectComparisonEvidence(project, composition, readResource);
  let coordinateProbe: Extract<ProjectNote["anchor"], { kind: "comparison" }>["coordinateProbe"];
  if (probe) {
    if (composition.mode !== "side-by-side" || composition.members.some(member => !member.visible))
      throw new TypeError("Save a visible side-by-side comparison before recording a coordinate observation.");
    const members = verifyProjectCompositionEvidenceSources(project, composition, readResource).map((member, slot) =>
      ({ ...member, slot: slot as 0 | 1 }));
    const checked = resolveLinkedCoordinateProbe(members, { memberId: probe.source.id,
      revision: probe.source.revision, hash: probe.source.hash, point: probe.point });
    if (!checked || checked.source.slot !== probe.source.slot || checked.target.id !== probe.target.id ||
      checked.target.hash !== probe.target.hash || checked.target.revision !== probe.target.revision ||
      !sameProjectCoordinateFrame({ format: "math3d.coordinate-frame/v1", frame: checked.frame, unit: checked.unit,
        axes: checked.axes, handedness: checked.handedness },
      { format: "math3d.coordinate-frame/v1", frame: probe.frame, unit: probe.unit,
        axes: probe.axes, handedness: probe.handedness }))
      throw new TypeError("The selected coordinate no longer belongs to matching exact comparison sources.");
    coordinateProbe = { format: "math3d.comparison-coordinate-probe/v1", sourceSlot: checked.source.slot === 0 ? "A" : "B",
      point: [checked.point.x, checked.point.y, checked.point.z], coordinateFrame: { format: "math3d.coordinate-frame/v1",
        frame: checked.frame, unit: checked.unit, axes: checked.axes, handedness: checked.handedness } };
  }
  return createProjectNote({ projectId: project.identity.id, stableKey, kind: "text", title: title.trim(), body: body.trim(), createdAt,
    anchor: { kind: "comparison", compositionId: composition.id, compositionHash: evidence.compositionHash,
      members: [composition.members[0].expected, composition.members[1].expected], alignment: evidence.alignment,
      ...(coordinateProbe ? { coordinateProbe } : {}) } });
}

export function resolveProjectComparisonNoteTarget(project: Math3DProject, compositionId: string, readResource: ProjectResourceReader,
  fallbackAlignment: "source-declared match" | "operator assertion" | "not applicable") {
  const saved = project.compositions?.find(item => item.id === compositionId);
  if (!saved) return null;
  let alignment = fallbackAlignment, available = false;
  try {
    const evidence = createProjectComparisonEvidence(project, saved, readResource);
    alignment = evidence.alignment;
    available = true;
  } catch { /* The Note stays visible; its exact target is unavailable. */ }
  return { hash: structuralHash(saved), members: [saved.members[0].expected, saved.members[1].expected] as const, alignment, available };
}

export function inspectProjectComparisonNote(project: Math3DProject, note: ProjectNote, readResource: ProjectResourceReader) {
  const anchor = note.anchor;
  const resolver: ProjectNoteAnchorResolver = { projectId: project.identity.id, source: () => null,
    comparison: id => resolveProjectComparisonNoteTarget(project, id, readResource,
      anchor?.kind === "comparison" ? anchor.alignment : "not applicable") };
  const state = inspectProjectNoteAnchor(note, resolver);
  if (state.status !== "current" || anchor?.kind !== "comparison" || !anchor.coordinateProbe) return state;
  const composition = project.compositions?.find(item => item.id === anchor.compositionId);
  if (!composition) return { status: "missing" as const, reason: "Saved comparison is unavailable." };
  try {
    const members = verifyProjectCompositionEvidenceSources(project, composition, readResource).map((member, slot) =>
      ({ ...member, slot: slot as 0 | 1 }));
    return resolveSavedCoordinateProbe(members, anchor) ? state :
      { status: "stale" as const, reason: "Saved coordinate frame or source generation changed." };
  } catch { return { status: "missing" as const, reason: "An exact coordinate source or resource is unavailable." }; }
}
