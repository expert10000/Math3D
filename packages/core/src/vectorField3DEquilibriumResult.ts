import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash,
  type CanonicalJsonValue } from "./documentIdentity";
import { searchVectorField3DEquilibria,
  type VectorField3DEquilibriumSearch } from "./vectorField3DEquilibria";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { compactVerifiedVectorSource } from "./vectorField3DTrajectoryResult";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE = "vector3d.equilibrium-solver" as const;

/** Save numerical outcomes and verified references, never search samples or field arrays. */
export function createVectorField3DEquilibriumResult(document: VectorField3DDocument,
  search: VectorField3DEquilibriumSearch): AnalysisResultEnvelope {
  if (search.source.documentId !== document.identity.id ||
      search.source.revision !== document.identity.revision ||
      search.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("The equilibrium source generation changed.");
  const source = viewerSourceFromDocument(document);
  const summary = { stopReason: search.status, attemptedSeeds: search.attemptedSeeds,
    rejectedSeeds: search.rejectedSeeds, evaluations: search.evaluations,
    maxEvaluations: search.maxEvaluations, seedResolution: search.seedResolution,
    stopCounts: search.stopCounts,
    residualTolerance: search.residualTolerance, candidateCount: search.candidates.length,
    candidates: search.candidates.map(candidate => ({ position: candidate.position,
      residual: candidate.residual, iterations: candidate.iterations,
      stopReason: "converged", classification: candidate.classification,
      conditionEstimate: candidate.conditionEstimate,
      eigenvalueRealParts: candidate.eigenvalueRealParts,
      eigenvalueUnit: candidate.eigenvalueUnit })) };
  const parameters: Record<string, CanonicalJsonValue> = {
    sourceHash: document.identity.structuralHash,
    seedResolution: search.seedResolution, maxEvaluations: search.maxEvaluations,
    seedIds: document.source.seeds.map(seed => seed.id),
    coordinateUnits: document.source.axes.map(axis => axis.unit),
    residualUnit: document.source.field.kind === "scientific-bundle" ?
      document.source.field.componentUnits[0] : document.source.field.components[0].unit };
  if (document.source.field.kind === "scientific-bundle") {
    parameters.sourceReferences = JSON.parse(canonicalJsonStringify(
      document.source.field.references)) as CanonicalJsonValue;
    parameters.verifiedSource = JSON.parse(canonicalJsonStringify(
      compactVerifiedVectorSource(document, { ...search,
        sourceHash: search.sourceHash ?? undefined }))) as CanonicalJsonValue;
  }
  const resultId = `vector3d-equilibria:${structuralHash({ source, parameters, summary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE,
      algorithm: "bounded-newton-seeds",
      algorithmVersion: document.source.field.kind === "scientific-bundle" ?
        "solver-report-v2" : "solver-report-v1", parameters },
      numericContext: { precision: { binaryBits: 53 }, tolerance: {
        absolute: document.source.solver.absoluteTolerance } },
      engine: { name: "Math3D equilibrium search", version: "1" }, elapsedMs: 0 },
    summary, warnings: search.status === "budget-reached" ?
      ["The bounded search stopped at its evaluation or candidate budget."] : [],
    diagnostics: [], artifacts: [] });
}

/** Compare a freshly rerun search with every saved outcome and source digest. */
export function verifyVectorField3DEquilibriumResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument,
  replayedSearch?: VectorField3DEquilibriumSearch): AnalysisResultEnvelope {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE)
    throw new TypeError("A saved equilibrium result is required.");
  const parameters = saved.provenance.operation.parameters;
  if ((parameters.seedResolution !== 3 && parameters.seedResolution !== 5) ||
      typeof parameters.maxEvaluations !== "number" ||
      !Number.isSafeInteger(parameters.maxEvaluations))
    throw new TypeError("Saved equilibrium solver settings changed.");
  if (document.source.field.kind === "scientific-bundle" && !replayedSearch)
    throw new TypeError("The measured equilibrium source must be verified and rerun.");
  const fresh = createVectorField3DEquilibriumResult(document,
    document.source.field.kind === "expressions" ? searchVectorField3DEquilibria(document,
      undefined, { seedResolution: parameters.seedResolution,
        maxEvaluations: parameters.maxEvaluations as number }) : replayedSearch!);
  if (saved.resultId !== fresh.resultId ||
      canonicalJsonStringify(saved.provenance.source) !==
        canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !==
        canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved equilibrium solver statistics differ from the verified source.");
  return saved;
}
