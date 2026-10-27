import { canonicalJsonStringify, createDocumentRelation, createMixedWorkspaceDocument,
  createScientificDatasetLink, parseScientificSceneManifest,
  scientificTileLayout, sha256Checksum, viewerSourceFromDocument,
  type MixedWorkspaceDocument, type VectorField3DDocument,
  type VectorField3DIsosurface } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import type { SurfaceMeshSource } from "../mesh/surfaceMesh";

export const SCIENTIFIC_ISOSURFACE_MESH_OPERATION = "vector3d.speed-isosurface-mesh";
export type IsosurfaceMeshOrigin = Extract<SurfaceMeshSource,
  { kind: "derivedVectorFieldIsosurface" }>;

export function promoteScientificIsosurfaceMesh(workspace: MixedWorkspaceDocument,
  field: VectorField3DDocument, surface: VectorField3DIsosurface) {
  if (surface.source.documentId !== field.identity.id ||
      surface.source.revision !== field.identity.revision ||
      surface.source.structuralHash !== field.identity.structuralHash ||
      surface.triangleCount < 1 || surface.indices.length !== surface.triangleCount * 3 ||
      surface.positions.length !== surface.vertexCount * 3 ||
      surface.normals.length !== surface.positions.length)
    throw new TypeError("Isosurface does not match the current field and mesh geometry.");
  const origin: IsosurfaceMeshOrigin = {
    kind: "derivedVectorFieldIsosurface", source: surface.source,
    sourceHash: surface.sourceHash, sourceReferences: surface.sourceReferences,
    recipe: { level: surface.level, unit: surface.unit,
      clipBounds: surface.clipBounds, triangleBudget: surface.triangleBudget,
      gridShape: surface.gridShape },
    topology: surface.topology, complete: surface.complete, clipped: surface.clipped,
    verifiedTiles: surface.verifiedTiles ?? null,
  };
  const adapter = MeshDocumentAdapter.fromMesh({ label: `|F| = ${surface.level} ${surface.unit}`,
    positions: surface.positions, normals: surface.normals, indices: surface.indices,
    source: origin });
  const mesh = adapter.document();
  const entries = [...workspace.entries];
  const sourceEntry = entries.findIndex(entry => entry.expected.id === field.identity.id);
  const replacement = { module: "vector3d" as const, checkpoint: field,
    expected: field.identity, replay: null };
  if (sourceEntry < 0) entries.push(replacement);
  else entries[sourceEntry] = replacement;
  if (entries.some(entry => entry.expected.id === mesh.identity.id))
    throw new TypeError("This isosurface Mesh is already in the Project.");
  entries.push({ module: "mesh", checkpoint: mesh, expected: mesh.identity, replay: null });
  const relation = createDocumentRelation({ kind: "generated-by",
    sources: [viewerSourceFromDocument(field)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(mesh) },
    operation: SCIENTIFIC_ISOSURFACE_MESH_OPERATION,
    parameters: { level: surface.level, clipBounds: surface.clipBounds,
      triangleBudget: surface.triangleBudget, topology: surface.topology } });
  const next = createMixedWorkspaceDocument({ ...workspace, entries,
    activeDocumentIds: [...new Set([...workspace.activeDocumentIds,
      field.identity.id, mesh.identity.id])],
    relations: [...workspace.relations, relation] });
  return { workspace: next, adapter };
}

/** Recheck exactly the v3 tiles named by the saved mesh before declaring it current. */
export async function reverifyScientificIsosurfaceMesh(origin: IsosurfaceMeshOrigin,
  field: VectorField3DDocument,
  bridge?: Window["scientificScenes"]): Promise<"current" | "stale"> {
  if (field.identity.id !== origin.source.documentId ||
      field.identity.revision !== origin.source.revision ||
      field.identity.structuralHash !== origin.source.structuralHash)
    return "stale";
  if (!origin.sourceReferences) return "current";
  if (field.source.field.kind !== "scientific-bundle" ||
      !bridge?.openGraphDatasetReference) return "stale";
  const refs = origin.sourceReferences;
  if (canonicalJsonStringify(field.source.field.references) !== canonicalJsonStringify(refs) ||
      origin.sourceHash !== createScientificDatasetLink(refs).sourceHash) return "stale";
  try {
    const opened = await bridge.openGraphDatasetReference({ locator: refs[0].locator,
      sceneFingerprint: refs[0].sceneFingerprint });
    if (!opened.ok) return "stale";
    try {
      const manifest = parseScientificSceneManifest(opened.source.manifestJson);
      if (!manifest.ok) return "stale";
      if (origin.verifiedTiles) {
        if (manifest.value.schema !== "scientific-scene/v3" ||
            !bridge.previewVectorTiles || origin.verifiedTiles.length !== 3) return "stale";
        const dataset = manifest.value.datasets.find(item => item.id === refs[0].datasetId);
        if (!dataset || dataset.shape.length !== 3) return "stale";
        const samples = new Map<string, [number, number, number]>();
        for (const saved of origin.verifiedTiles) {
          if (!refs.some(ref => ref.component === saved.name &&
              ref.resourceSha256 === saved.resourceSha256) ||
              saved.tileIndices.length < 1 ||
              saved.verifiedTiles !== saved.tileIndices.length ||
              new Set(saved.tileIndices).size !== saved.tileIndices.length ||
              saved.tileSetSha256 !== sha256Checksum(new TextEncoder().encode(
                saved.tileIndices.map((index, at) =>
                  `${index}:${saved.tileSha256[at]}`).join("|"))).slice(7)) return "stale";
          const resource = manifest.value.resources.find(item => item.sha256 === saved.resourceSha256);
          if (!resource?.tileShape || !resource.tileSha256 ||
              saved.tileIndices.length !== saved.tileSha256.length) return "stale";
          const layout = scientificTileLayout(dataset.shape, resource.tileShape);
          if (saved.totalTiles !== layout.length) return "stale";
          for (const index of saved.tileIndices) {
            const tile = layout[index];
            if (!tile || resource.tileSha256[index] !== saved.tileSha256[saved.tileIndices.indexOf(index)])
              return "stale";
            samples.set(tile.start.join(","), tile.start);
          }
        }
        const expected = new Map(origin.verifiedTiles.map(part => [part.name,
          new Map(part.tileIndices.map((index, at) => [index, part.tileSha256[at]!]))]));
        const seen = new Map(origin.verifiedTiles.map(part => [part.name, new Set<number>()]));
        const points = [...samples.values()];
        for (let at = 0; at < points.length; at += 32) {
          const transfers = await bridge.previewVectorTiles({ fingerprint: opened.source.fingerprint,
            datasetId: refs[0].datasetId, components: refs.map(ref => ref.component) as
              [string, string, string], indicesBatch: points.slice(at, at + 32) });
          for (const transfer of transfers) for (const part of transfer.components) {
            const hash = expected.get(part.name)?.get(part.tileIndex);
            if (hash === undefined) continue;
            if (part.tileSha256 !== hash || sha256Checksum(part.bytes) !== `sha256:${hash}`)
              return "stale";
            seen.get(part.name)!.add(part.tileIndex);
          }
        }
        if (origin.verifiedTiles.some(part =>
          seen.get(part.name)?.size !== part.tileIndices.length)) return "stale";
      } else {
        if (manifest.value.schema === "scientific-scene/v3" ||
            !bridge.previewVectorVolume) return "stale";
        await bridge.previewVectorVolume({ fingerprint: opened.source.fingerprint,
          datasetId: refs[0].datasetId,
          components: refs.map(ref => ref.component) as [string, string, string] });
      }
      return "current";
    } finally { await bridge.closeGraphDataset(opened.source.fingerprint); }
  } catch { return "stale"; }
}
