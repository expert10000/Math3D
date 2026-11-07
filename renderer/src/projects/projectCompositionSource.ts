import { retainedGeometryGenerationDocuments, retainedMeshGenerationDocuments, retainedSurfaceGenerationDocuments,
  type KernelWorkspaceDocument, type Math3DProject, type ProjectCompositionMember } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

const matches = (document: KernelWorkspaceDocument, expected: ProjectCompositionMember["expected"]) =>
  document.identity.id === expected.id && document.identity.revision === expected.revision &&
  document.identity.schemaVersion === expected.schemaVersion &&
  document.identity.structuralHash === expected.structuralHash;

/** Resolve the member's exact generation after verifying its owning replay. */
export function resolveExactProjectCompositionSource(project: Math3DProject, member: ProjectCompositionMember,
  replayed = verifyMixedWorkspaceReplay(project.workspace)): KernelWorkspaceDocument {
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  if (!entry) throw new TypeError("The selected source document is missing.");
  const current = replayed.get(member.documentId);
  if (!current || !matches(current, entry.expected))
    throw new TypeError("The current source did not pass replay verification.");
  if (matches(current, member.expected)) return current;
  if (!entry.replay) throw new TypeError("The selected source has a different saved revision and no matching retained checkpoint or snapshot.");
  if (matches(entry.checkpoint, member.expected)) return entry.checkpoint;
  const retained = entry.module === "mesh" ? retainedMeshGenerationDocuments(entry) :
    entry.module === "geometry" ? retainedGeometryGenerationDocuments(entry) :
    entry.module === "surface" ? retainedSurfaceGenerationDocuments(entry) : [];
  const exact = retained.find(document => matches(document, member.expected));
  if (!exact) throw new TypeError("The selected source has a different saved revision and no matching retained checkpoint or snapshot.");
  return exact;
}
