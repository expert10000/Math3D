import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation, type DocumentRelation } from "./documentRelations";
import { type VectorField3DDifferentialArtifact } from "./vectorField3DDifferential";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_POINT_RESULT_TYPE = "vector3d.point-calculus" as const;

const sourceReference = (document: VectorField3DDocument): CanonicalJsonValue =>
  document.source.field.kind === "scientific-bundle" ? {
    kind: "scientific-bundle",
    components: document.source.field.references.map(reference => ({
      datasetId: reference.datasetId, component: reference.component,
      sceneFingerprint: reference.sceneFingerprint, resourceSha256: reference.resourceSha256,
      locator: reference.locator,
    })),
  } : { kind: "expressions" };

/** Compact result metadata; every numerical entry is checked against a fresh stencil on reopen. */
export function createVectorField3DPointResult(document: VectorField3DDocument,
  calculus: VectorField3DDifferentialArtifact, elapsedMs = 0): AnalysisResultEnvelope {
  if (calculus.status !== "ready" || !calculus.jacobian)
    throw new TypeError("Only a ready point calculus result can enter the Project graph.");
  if (calculus.source.documentId !== document.identity.id ||
      calculus.source.revision !== document.identity.revision ||
      calculus.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Point calculus source generation changed.");
  const source = viewerSourceFromDocument(document);
  const parameters: Record<string, CanonicalJsonValue> = {
    position: [...calculus.position], coordinateUnits: document.source.axes.map(axis => axis.unit),
    stencilGrid: calculus.stencilGrid ?? "bounded", sourceHash: calculus.sourceHash,
    sourceReference: sourceReference(document),
  };
  const summary: Record<string, CanonicalJsonValue> = {
    position: [...calculus.position], derivativeMethod: calculus.method,
    stencilGrid: calculus.stencilGrid ?? "bounded", sourceHash: calculus.sourceHash,
    jacobianRows: calculus.jacobian.map(row => [...row]),
    jacobianUnits: calculus.jacobianUnits.map(row => [...row]),
    eigenvalues: calculus.eigenanalysis.eigenvalues?.map(value => ({ ...value })) ?? null,
    eigenvalueUnit: calculus.eigenanalysis.unit,
    eigenvalueConfidence: calculus.eigenanalysis.status,
    conditionEstimate: calculus.eigenanalysis.conditionEstimate,
    divergence: calculus.divergence, divergenceUnit: calculus.divergenceUnit,
    curl: calculus.curl ? [...calculus.curl] : null, curlUnit: calculus.curlUnit,
    verifiedSamples: calculus.verifiedSamples?.map(part => ({ ...part })) ?? [],
    stencils: calculus.stencils.map(stencil => ({ ...stencil, coordinates: [...stencil.coordinates] })),
  };
  const resultId = `vector3d-point:${structuralHash({ source, parameters, summary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_POINT_RESULT_TYPE,
      algorithm: calculus.method, algorithmVersion: calculus.stencilGrid === "source" ? "source-grid-1" : "bounded-1",
      parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D point calculus", version: "1" }, elapsedMs },
    summary, warnings: calculus.eigenanalysis.status === "uncertain" ?
      ["Eigenvalues are uncertain at this probe."] : [],
    diagnostics: calculus.eigenanalysis.diagnostics.map(message => ({
      code: "vector3d.eigenanalysis", severity: "info" as const, message })), artifacts: [] });
}

export function vectorField3DPointResultRelation(result: AnalysisResultEnvelope): DocumentRelation {
  if (result.provenance.operation.type !== VECTOR_FIELD3D_POINT_RESULT_TYPE)
    throw new TypeError("Expected a point calculus result.");
  return createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: VECTOR_FIELD3D_POINT_RESULT_TYPE }, operation: VECTOR_FIELD3D_POINT_RESULT_TYPE,
    parameters: result.provenance.operation.parameters });
}

export function reverifyVectorField3DPointResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument, calculus: VectorField3DDifferentialArtifact): void {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_POINT_RESULT_TYPE)
    throw new TypeError("This is not a saved point calculus result.");
  const fresh = createVectorField3DPointResult(document, calculus);
  if (saved.resultId !== fresh.resultId || saved.status !== fresh.status ||
      canonicalJsonStringify(saved.provenance.source) !== canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !== canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved point calculus result changed or no longer matches the verified source.");
}
