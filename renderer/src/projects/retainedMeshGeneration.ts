import { MAX_RETAINED_MESH_GENERATIONS, retainedMeshGenerationDocuments, type MeshDocument, type MixedWorkspaceEntry } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { subdivideSurfaceMesh } from "../mesh/meshOps";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

type RetainedEdit = { before: MeshDocument; after: MeshDocument };

function retainBeforeEdit(adapter: MeshDocumentAdapter, edit: (mesh: SurfaceMeshData) => {
  mesh: SurfaceMeshData; kind: "subdivide" | "object-edit"; parameters: Record<string, number | number[]>;
}): RetainedEdit {
  const before = adapter.document();
  const replay = adapter.replayBundle();
  const entry: MixedWorkspaceEntry = { module: "mesh", checkpoint: replay.checkpoint.document,
    expected: before.identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } };
  if (retainedMeshGenerationDocuments(entry).length >= MAX_RETAINED_MESH_GENERATIONS)
    throw new TypeError(`At most ${MAX_RETAINED_MESH_GENERATIONS} Mesh generations can be retained.`);
  const mesh = adapter.mesh();
  const vertices = mesh.positions.length / 3;
  const faces = (mesh.indices?.length ?? mesh.positions.length / 3) / 3;
  if (!Number.isSafeInteger(vertices) || !Number.isSafeInteger(faces) || vertices < 3 || faces < 1 ||
      vertices > 20_000 || faces > 10_000)
    throw new TypeError("Retained Mesh edits accept 1–10,000 faces and at most 20,000 vertices.");
  const result = edit(mesh);
  if (result.mesh.positions.length / 3 > 50_000)
    throw new TypeError("The Mesh edit exceeds the retained comparison vertex limit.");
  const after = adapter.replaceMesh(result.mesh, result.kind,
    { ...result.parameters, retainedBefore: before.identity.structuralHash });
  const saved = adapter.replayBundle();
  if (!retainedMeshGenerationDocuments({ ...entry, checkpoint: saved.checkpoint.document, expected: after.identity,
    replay: { format: "math3d.mesh-replay.v1", payload: saved as never } }).some(document =>
      document.identity.revision === before.identity.revision && document.identity.structuralHash === before.identity.structuralHash) ||
      !adapter.resources.bytes(before.source.resource) || !adapter.resources.bytes(after.source.resource))
    throw new TypeError("The before/after Mesh buffers were not retained.");
  return { before, after };
}

/** One bounded edit; the prior generation is an explicit, verified replay snapshot. */
export function subdivideWithRetainedMeshCheckpoint(adapter: MeshDocumentAdapter): RetainedEdit {
  return retainBeforeEdit(adapter, mesh => {
  const divided = subdivideSurfaceMesh(mesh, 1);
  const faces = (mesh.indices?.length ?? mesh.positions.length / 3) / 3;
  if (!divided.indices?.length || divided.indices.length / 3 !== faces * 4 ||
      divided.positions.length / 3 > 50_000)
    throw new TypeError("The Mesh could not be subdivided within the retained comparison limit.");
  return { mesh: { ...divided, uvs: null }, kind: "subdivide", parameters: { iterations: 1 } };
  });
}

export function transformWithRetainedMeshSnapshot(adapter: MeshDocumentAdapter,
  offsets: readonly [number, number, number], factor: number): RetainedEdit {
  if (!offsets.every(Number.isFinite) || !Number.isFinite(factor) || factor <= 0)
    throw new TypeError("Enter finite translation values and a positive scale.");
  return retainBeforeEdit(adapter, mesh => {
    const positions = mesh.positions.map((value, index) => value * factor + offsets[index % 3]!);
    if (!positions.every(Number.isFinite)) throw new TypeError("Transform exceeds the mesh coordinate range.");
    return { mesh: { ...mesh, positions }, kind: "object-edit", parameters: { translation: [...offsets], scale: factor } };
  });
}
