import { readProjectCoordinateFrame, type KernelWorkspaceDocument, type Math3DProject, type ProjectComposition } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import { projectResourceInventory, type ProjectResourceReader } from "./projectResources";

/** Minimal verification path for reports; it does not create a viewer or derive physics. */
export function verifyProjectCompositionEvidenceSources(project: Math3DProject, composition: ProjectComposition, read: ProjectResourceReader) {
  const replayed = verifyMixedWorkspaceReplay(project.workspace);
  return composition.members.map(member => {
    const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
    if (!entry) throw new TypeError("The selected source document is missing.");
    const current = replayed.get(member.documentId);
    if (!current || current.identity.revision !== entry.expected.revision || current.identity.structuralHash !== entry.expected.structuralHash)
      throw new TypeError("The current source did not pass replay verification.");
    const currentSelected = current.identity.revision === member.expected.revision && current.identity.structuralHash === member.expected.structuralHash;
    const checkpointSelected = !!entry.replay && entry.checkpoint.identity.revision === member.expected.revision &&
      entry.checkpoint.identity.structuralHash === member.expected.structuralHash;
    if (!currentSelected && !checkpointSelected) throw new TypeError("The selected source has no matching retained generation.");
    const document: KernelWorkspaceDocument = currentSelected ? current : entry.checkpoint;
    let vertexCount = 0;
    if (document.format === "math3d.mesh-document") {
      const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.id === document.source.resource.id);
      const bytes = requirement ? read(requirement) : null;
      if (!bytes) throw new TypeError("The saved Mesh buffer is unavailable.");
      const store = new MeshResourceStore(); store.import(document.source.resource, bytes);
      const decoded = store.resolve(document.source.resource);
      if (!decoded) throw new TypeError("The saved Mesh buffer failed verification.");
      vertexCount = decoded.positions.length / 3;
    } else if (document.format !== "math3d.geometry-document" && document.format !== "math3d.surface-document")
      throw new TypeError("Only saved Mesh, Geometry and Surface sources can be compared.");
    const coordinates = readProjectCoordinateFrame(document);
    return { id: member.documentId, revision: document.identity.revision, hash: document.identity.structuralHash,
      generation: currentSelected ? "current" as const : "retained checkpoint" as const,
      unit: document.format === "math3d.surface-document" ? String((document.source.units as { length: string }).length) : coordinates.value?.unit ?? null,
      coordinates, vertexCount };
  });
}
