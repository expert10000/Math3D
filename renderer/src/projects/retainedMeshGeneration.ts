import type { MeshDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { subdivideSurfaceMesh } from "../mesh/meshOps";

/** One bounded edit whose replay checkpoint is the exact pre-subdivision Mesh. */
export function subdivideWithRetainedMeshCheckpoint(adapter: MeshDocumentAdapter): {
  before: MeshDocument; after: MeshDocument;
} {
  const before = adapter.document();
  const replay = adapter.replayBundle();
  if (replay.transactions.length || replay.cursor ||
      replay.checkpoint.document.identity.revision !== before.identity.revision ||
      replay.checkpoint.document.identity.structuralHash !== before.identity.structuralHash)
    throw new TypeError("This Mesh already has edits. Start from a fresh saved Mesh to retain its exact pre-remesh generation.");
  const mesh = adapter.mesh();
  const vertices = mesh.positions.length / 3;
  const faces = (mesh.indices?.length ?? mesh.positions.length / 3) / 3;
  if (!Number.isSafeInteger(vertices) || !Number.isSafeInteger(faces) || vertices < 3 || faces < 1 ||
      vertices > 20_000 || faces > 10_000)
    throw new TypeError("Retained Mesh subdivision accepts 1–10,000 faces and at most 20,000 vertices.");
  const divided = subdivideSurfaceMesh(mesh, 1);
  if (!divided.indices?.length || divided.indices.length / 3 !== faces * 4 ||
      divided.positions.length / 3 > 50_000)
    throw new TypeError("The Mesh could not be subdivided within the retained comparison limit.");
  const after = adapter.replaceMesh({ ...divided, uvs: null }, "subdivide", { iterations: 1, retainedBefore: before.identity.structuralHash });
  const saved = adapter.replayBundle();
  if (saved.checkpoint.document.identity.structuralHash !== before.identity.structuralHash ||
      !adapter.resources.bytes(before.source.resource) || !adapter.resources.bytes(after.source.resource))
    throw new TypeError("The before/after Mesh buffers were not retained.");
  return { before, after };
}
