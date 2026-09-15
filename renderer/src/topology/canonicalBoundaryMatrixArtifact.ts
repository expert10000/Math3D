import {
  constructExactSparseBoundaryMatrices,
  encodeExactSparseBoundaryMatrixArtifact,
  TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_ENCODING,
  type CanonicalFinite2DResult,
  type ExactSparseBoundaryMatrixSummary,
  type ScientificSourceGeneration,
  type StructuralHash,
  type TopologyDocument,
  type AnalysisArtifactHandle,
} from "@math3d/core";
import {
  type InMemoryArtifactRegistry,
  type ManagedArtifactMetadata,
} from "@math3d/kernel";

export type PublishedBoundaryMatrixArtifact =
  | Readonly<{
      status: "exact";
      handle: AnalysisArtifactHandle;
      source: ScientificSourceGeneration;
      canonicalHash: StructuralHash;
      summary: ExactSparseBoundaryMatrixSummary;
      metadata: ManagedArtifactMetadata;
    }>
  | Readonly<{
      status: "unsupported" | "failed";
      diagnostics: readonly Readonly<{ code: string; message: string }>[];
    }>;

/**
 * T06 storage adapter. Matrix bytes go directly to F07; only compact metadata and
 * a handle return to the caller.
 */
export const publishCanonicalBoundaryMatrixArtifact = (
  registry: InMemoryArtifactRegistry,
  canonical: CanonicalFinite2DResult,
  sourceDocument: TopologyDocument,
  ownerId: string
): PublishedBoundaryMatrixArtifact => {
  const constructed = constructExactSparseBoundaryMatrices(canonical, sourceDocument);
  if (constructed.status !== "exact") return constructed;

  const { handle, payload, summary } = constructed;
  const bytes = encodeExactSparseBoundaryMatrixArtifact(payload);
  registry.declare({
    handle,
    source: canonical.source,
    ownerId,
    encoding: TOPOLOGY_BOUNDARY_MATRIX_ARTIFACT_ENCODING,
  });
  registry.beginComputation(handle.artifactId, ownerId, canonical.source);
  const metadata = registry.publish({
    artifactId: handle.artifactId,
    source: canonical.source,
    ownerId,
    bytes,
  });
  return {
    status: "exact",
    handle,
    source: canonical.source,
    canonicalHash: canonical.canonicalHash,
    summary,
    metadata,
  };
};
