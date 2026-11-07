import { createDocumentRelation } from "./documentRelations";
import { sha256Checksum } from "./documentIdentity";
import { createGeometryDocument } from "./geometryDocument";
import { decodeMeshBuffers } from "./meshBufferCodec";
import type { MeshDocument } from "./meshDocument";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { replaceMath3DProjectWorkspace, type Math3DProject } from "./math3dProject";
import { matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const MAX_OPEN_IN_GEOMETRY_TRIANGLES = 4096;

/** Materialize a small, verified Mesh as editable Geometry triangles. */
export const deriveProjectMeshGeometry = (project: Math3DProject, source: ScientificSourceGeneration,
  bytes: Uint8Array) => {
  const entry = project.workspace.entries.find(item => item.expected.id === source.documentId);
  if (!entry || entry.module !== "mesh" || entry.checkpoint.format !== "math3d.mesh-document" ||
      project.metadata.documents?.[source.documentId]?.archived)
    throw new TypeError("The Mesh source is unavailable.");
  const mesh: MeshDocument = entry.checkpoint;
  if (!matchesScientificSourceGeneration(viewerSourceFromDocument(mesh), source))
    throw new TypeError("The Mesh source changed; review Open in destinations again.");
  const reference = mesh.source.resource;
  if (sha256Checksum(bytes) !== reference.checksum)
    throw new TypeError("The Mesh source buffer checksum differs from the saved reference.");
  const decoded = decodeMeshBuffers(bytes), { positions, indices } = decoded;
  if (positions.length !== reference.vertexCount * 3 || (indices?.length ?? 0) !== reference.indexCount ||
      (decoded.normals !== null) !== reference.hasNormals || (decoded.uvs !== null) !== reference.hasUvs)
    throw new TypeError("The Mesh source buffer layout differs from the saved reference.");
  const count = indices?.length ?? positions.length / 3;
  if (!Number.isInteger(count) || count < 3 || count % 3 !== 0 || count / 3 > MAX_OPEN_IN_GEOMETRY_TRIANGLES ||
      positions.some(value => !Number.isFinite(value)) ||
      (indices?.some(index => index >= reference.vertexCount) ?? false))
    throw new TypeError("Geometry promotion requires 1–4096 finite Mesh triangles with valid indices.");
  const point = (index: number) => ({ x: positions[index * 3]!, y: positions[index * 3 + 1]!, z: positions[index * 3 + 2]! });
  const triangles = Array.from({ length: count / 3 }, (_, triangle) => {
    const at = (corner: number) => indices?.[triangle * 3 + corner] ?? triangle * 3 + corner;
    return { a: point(at(0)), b: point(at(1)), c: point(at(2)) };
  });
  const document = createGeometryDocument({ stableKey: { operation: "mesh.promote-geometry",
    sourceDocumentId: mesh.identity.id }, metadata: { title: `${mesh.metadata.label} geometry` },
    source: { geometry: { triangles }, objects: [], surfaces: [], constructions: [], relationships: [],
      parameters: {}, extensions: { "math3d.mesh.geometry-copy.v1": { resourceChecksum: reference.checksum,
        triangleCount: triangles.length, precision: "float32-source" } } } });
  const relation = createDocumentRelation({ kind: "promoted-from", sources: [viewerSourceFromDocument(mesh)],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(document) },
    operation: "mesh.promote-geometry", parameters: { resourceChecksum: reference.checksum,
      triangleCount: triangles.length, precision: "float32-source" } });
  const existing = project.workspace.entries.find(item => item.expected.id === document.identity.id);
  if (existing) {
    const savedRelation = project.workspace.relations.find(item => item.relationId === relation.relationId);
    if (existing.module !== "geometry" || !savedRelation ||
        !matchesScientificSourceGeneration(viewerSourceFromDocument(existing.checkpoint), viewerSourceFromDocument(document)))
      throw new TypeError("The existing Geometry companion changed; fork it through dependency refresh.");
    return { project, targetDocumentId: existing.expected.id, existing: true };
  }
  const workspace = createMixedWorkspaceDocument({ ...project.workspace,
    entries: [...project.workspace.entries, { module: "geometry", checkpoint: document,
      expected: document.identity, replay: null }],
    activeDocumentIds: [...new Set([...project.workspace.activeDocumentIds, document.identity.id])],
    relations: [...project.workspace.relations, relation] });
  return { project: replaceMath3DProjectWorkspace(project, workspace), targetDocumentId: document.identity.id, existing: false };
};
