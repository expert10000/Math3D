import { createScientificDatasetLink, createVectorField3DDerivedLine,
  sampleVectorField3DDerivedSlice, sampleVectorField3DSlice,
  sampleVectorField3DSparseSlice, ScientificDerivedResultCache,
  structuralHash, verifyVectorField3DSparseSamples, verifyVectorField3DVolumes,
  type VectorField3DDerivedChannel, type VectorField3DDerivedLine,
  type VectorField3DDocument, type VectorField3DSliceArtifact,
  type VectorField3DSparseSamples, type VectorField3DVolumes } from "@math3d/core";

type FullTransfer = Readonly<{ manifestJson: string; fingerprint: string;
  volumes: VectorField3DVolumes }>;
type SparseTransfer = Readonly<{ manifestJson: string; fingerprint: string;
  samples: VectorField3DSparseSamples }>;
export type VerifiedVectorTransfer = FullTransfer | SparseTransfer;

const cache = new ScientificDerivedResultCache(48);

export function invalidateVerifiedDerivedResults(documentId: string): void {
  cache.invalidateDocument(documentId);
}

const binding = (document: VectorField3DDocument, sourceHash: string) => ({
  documentId: document.identity.id, revision: document.identity.revision,
  documentHash: document.identity.structuralHash, sourceHash,
});

/** Verify every supplied component before consulting the in-memory derived-result cache. */
export function cachedVerifiedVectorField3DSlice(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2, fixedCoordinate: number,
  channel: "component" | VectorField3DDerivedChannel,
  transfer: VerifiedVectorTransfer): VectorField3DSliceArtifact {
  if (document.source.field.kind !== "scientific-bundle")
    throw new TypeError("A cached scientific slice requires a saved bundle.");
  const link = createScientificDatasetLink(document.source.field.references);
  let transferHash: string;
  if ("samples" in transfer) {
    const verified = verifyVectorField3DSparseSamples(document, transfer.manifestJson,
      transfer.fingerprint, transfer.samples);
    transferHash = structuralHash({ fingerprint: transfer.fingerprint,
      selection: verified.selection, components: verified.components.map(part => ({
        name: part.name, sampleSha256: part.sampleSha256,
        ...(part.verifiedChunks ? { verifiedChunks: part.verifiedChunks } : {}),
        ...(part.verifiedTiles ? { verifiedTiles: part.verifiedTiles } : {}) })) });
  } else {
    const verified = verifyVectorField3DVolumes(document, transfer.manifestJson,
      transfer.fingerprint, transfer.volumes);
    transferHash = structuralHash({ fingerprint: transfer.fingerprint,
      components: verified.map(part => ({ name: part.component,
        sampleSha256: part.sampleSha256, sampleShape: part.sampleShape,
        ...(part.verifiedChunks ? { verifiedChunks: part.verifiedChunks } : {}),
        ...(part.verifiedTiles ? { verifiedTiles: part.verifiedTiles } : {}) })) });
  }
  const result = cache.getOrCompute(binding(document, link.sourceHash),
    { kind: "vector-slice/v1", normalAxis, fixedCoordinate, channel,
      transferKind: "samples" in transfer ? transfer.samples.selection.kind : "volume" },
    transferHash, () => channel === "component" ?
      "samples" in transfer ? sampleVectorField3DSparseSlice(document, normalAxis,
        fixedCoordinate, transfer) : sampleVectorField3DSlice(document, normalAxis,
        fixedCoordinate, transfer) : sampleVectorField3DDerivedSlice(document,
        normalAxis, fixedCoordinate, channel, transfer));
  return result;
}

/** A Graph line always re-verifies its transfer before reusing either cached result. */
export function cachedVerifiedVectorField3DDerivedLine(document: VectorField3DDocument,
  normalAxis: 0 | 1 | 2, fixedCoordinate: number, operation: VectorField3DDerivedChannel,
  varyingAxis: 0 | 1 | 2, profileFixedCoordinate: number,
  transfer: VerifiedVectorTransfer): VectorField3DDerivedLine {
  const slice = cachedVerifiedVectorField3DSlice(document, normalAxis, fixedCoordinate,
    operation, transfer);
  if (document.source.field.kind !== "scientific-bundle")
    throw new TypeError("A derived Graph line requires a saved scientific bundle.");
  const sourceHash = createScientificDatasetLink(document.source.field.references).sourceHash;
  if (slice.sourceHash !== sourceHash || slice.source.documentId !== document.identity.id ||
      slice.source.revision !== document.identity.revision ||
      slice.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Derived Graph line source revision changed.");
  return cache.getOrCompute(binding(document, sourceHash),
    { kind: "vector-derived-line/v1", operation: slice.channel,
      normalAxis: slice.normalAxis, fixedCoordinate: slice.fixedCoordinate,
      varyingAxis, profileFixedCoordinate, stencilGrid: slice.stencilGrid ?? "bounded" },
    structuralHash({ verifiedSamples: slice.verifiedSamples?.map(part => ({
      name: part.name, sampleSha256: part.sampleSha256,
      ...(part.verifiedChunks !== undefined ? { verifiedChunks: part.verifiedChunks } : {}),
      ...(part.totalChunks !== undefined ? { totalChunks: part.totalChunks } : {}),
      ...(part.verifiedTiles !== undefined ? { verifiedTiles: part.verifiedTiles } : {}),
      ...(part.totalTiles !== undefined ? { totalTiles: part.totalTiles } : {}),
    })) ?? [], shape: slice.shape,
      coordinates: slice.coordinates, values: slice.values }),
    () => createVectorField3DDerivedLine(document, slice, varyingAxis,
      profileFixedCoordinate));
}
