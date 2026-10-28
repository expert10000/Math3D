import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation, type DocumentRelation } from "./documentRelations";
import { type Graph2DFieldReference } from "./graph2dFieldReference";
import { type VectorField3DDocument, type VectorField3DOverlayRegion } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_REGION_RESULT_TYPE = "vector3d.linked-region" as const;
export type VectorField3DRegionStatistics = Readonly<{ mean: number; min: number; max: number }>;
export type VectorField3DRegionSummary = Readonly<{
  sampleCount: number; vectorCount: number; scalarCount: number; alignedCount: number;
  vector: VectorField3DRegionStatistics | null;
  scalar: VectorField3DRegionStatistics | null;
  scalarOutsideAreaPercent: number; vectorOutsideAreaPercent: number;
  vectorUnit: string; scalarUnit: string;
  scalarSampleSha256: string; vectorSourceHash: string;
}>;
export type VectorField3DRegionSampleDigest = Readonly<{ name: string; sampleSha256: string }>;

/** Save a compact, source-linked 17×17 region calculation; no field lattice enters the Project. */
export function createVectorField3DRegionResult(document: VectorField3DDocument,
  region: VectorField3DOverlayRegion, summary: VectorField3DRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  overlaySamples: readonly VectorField3DRegionSampleDigest[]): AnalysisResultEnvelope {
  const workspace = document.workspace;
  const scalar = workspace?.scalarOverlay?.visible ? workspace.scalarOverlay : null;
  const complex = !scalar && workspace?.complexOverlay?.visible ?
    { ...workspace.complexOverlay,
      mode: workspace.complexOverlay.mode === "phase-contours" ?
        "phase" as const : workspace.complexOverlay.mode } : null;
  if (!workspace || !region.visible ||
      canonicalJsonStringify(workspace.overlayRegion) !== canonicalJsonStringify(region) ||
      Number(!!scalar) + Number(!!complex) !== 1 || summary.alignedCount < 1 ||
      !summary.vector || !summary.scalar || summary.sampleCount !== 289 ||
      overlaySamples.length !== (complex ? 2 : 1) ||
      vectorSamples.length !== (document.source.field.kind === "scientific-bundle" ? 3 : 0))
    throw new TypeError("Only a freshly verified aligned region can be published.");
  const refs: readonly Graph2DFieldReference[] = complex ? [complex.real, complex.imaginary] :
    [scalar!.reference];
  const parameters: Record<string, CanonicalJsonValue> = {
    region: region as unknown as CanonicalJsonValue,
    overlayKind: complex ? "complex" : "scalar",
    overlayMode: complex?.mode ?? "scalar",
    overlayReferences: refs as unknown as CanonicalJsonValue,
    vectorReferences: document.source.field.kind === "scientific-bundle" ?
      document.source.field.references as unknown as CanonicalJsonValue : [],
    vectorSamples: vectorSamples as unknown as CanonicalJsonValue,
    overlaySamples: overlaySamples as unknown as CanonicalJsonValue,
  };
  const compactSummary: Record<string, CanonicalJsonValue> = {
    sampleCount: summary.sampleCount, vectorCount: summary.vectorCount,
    scalarCount: summary.scalarCount, alignedCount: summary.alignedCount,
    vector: summary.vector, scalar: summary.scalar,
    scalarOutsideAreaPercent: summary.scalarOutsideAreaPercent,
    vectorOutsideAreaPercent: summary.vectorOutsideAreaPercent,
    vectorUnit: summary.vectorUnit, scalarUnit: summary.scalarUnit,
    scalarSampleSha256: summary.scalarSampleSha256,
    vectorSourceHash: summary.vectorSourceHash,
  };
  const source = viewerSourceFromDocument(document);
  const resultId = `vector3d-region:${structuralHash({ source, parameters, compactSummary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_REGION_RESULT_TYPE,
      algorithm: "aligned-physical-region", algorithmVersion: "17x17-v1", parameters },
      numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D Field Explorer", version: "1" }, elapsedMs: 0 },
    summary: compactSummary, warnings: [], diagnostics: [], artifacts: [] });
}

export function vectorField3DRegionResultRelation(result: AnalysisResultEnvelope): DocumentRelation {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_REGION_RESULT_TYPE)
    throw new TypeError("Expected a linked region result.");
  return createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: VECTOR_FIELD3D_REGION_RESULT_TYPE },
    operation: VECTOR_FIELD3D_REGION_RESULT_TYPE,
    parameters: result.provenance.operation.parameters });
}

export function reverifyVectorField3DRegionResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument, region: VectorField3DOverlayRegion,
  summary: VectorField3DRegionSummary,
  vectorSamples: readonly VectorField3DRegionSampleDigest[],
  overlaySamples: readonly VectorField3DRegionSampleDigest[]): void {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_REGION_RESULT_TYPE)
    throw new TypeError("This is not a saved linked region result.");
  const fresh = createVectorField3DRegionResult(document, region, summary,
    vectorSamples, overlaySamples);
  if (saved.resultId !== fresh.resultId ||
      canonicalJsonStringify(saved.provenance.source) !== canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !== canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved region result differs from the verified sources or physical bounds.");
}
