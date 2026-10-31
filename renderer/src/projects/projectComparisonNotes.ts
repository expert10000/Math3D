import { createProjectNote, inspectProjectNoteAnchor, structuralHash,
  type Math3DProject, type ProjectComposition, type ProjectNote, type ProjectNoteAnchorResolver } from "@math3d/core";
import { createProjectComparisonEvidence } from "./projectComparisonEvidence";
import type { ProjectResourceReader } from "./projectResources";

export function createProjectComparisonNote(project: Math3DProject, composition: ProjectComposition,
  readResource: ProjectResourceReader, title: string, body: string, createdAt: number, stableKey: string): ProjectNote {
  const evidence = createProjectComparisonEvidence(project, composition, readResource);
  return createProjectNote({ projectId: project.identity.id, stableKey, kind: "text", title: title.trim(), body: body.trim(), createdAt,
    anchor: { kind: "comparison", compositionId: composition.id, compositionHash: evidence.compositionHash,
      members: [composition.members[0].expected, composition.members[1].expected], alignment: evidence.alignment } });
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
  return inspectProjectNoteAnchor(note, resolver);
}
