import type { Math3DProject, VerifiedProjectResources } from "@math3d/core";
import type { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { loadProjectResources } from "../projects/projectResourceArchive";

/** Resolve exact saved atlas bytes from active adapters or the Project archive. */
export async function loadSavedAtlasBytes(project: Math3DProject,
  restored: Readonly<{ meshes: ReadonlyMap<string, MeshDocumentAdapter>;
    resources?: VerifiedProjectResources }>, resultId: string): Promise<Uint8Array | null> {
  const mesh = project.workspace.entries.find(item => item.module === "mesh" &&
    item.checkpoint.format === "math3d.mesh-document" &&
    (item.checkpoint.source.origin as { resultId?: string }).resultId === resultId)
    ?.checkpoint;
  if (!mesh || mesh.format !== "math3d.mesh-document")
    throw new TypeError("Saved atlas Mesh is missing.");
  const reference = { kind: "mesh-buffers" as const, id: mesh.source.resource.id };
  return restored.meshes.get(mesh.identity.id)?.resources.bytes(mesh.source.resource) ??
    restored.resources?.bytes(reference) ??
    (await loadProjectResources(project)).bytes(reference) ?? null;
}
