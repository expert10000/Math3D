import { algebraicLocusGeometryDocument, sampledAlgebraicLocusGeometryDocument,
  parseSampledAlgebraicLocusGeometryDocument, matchesScientificSourceGeneration,
  upsertMath3DProjectAlgebraicLocusSample, createAnalysisResultEnvelope,
  createDocumentRelation, createMixedWorkspaceDocument, replaceMath3DProjectWorkspace,
  sageAlgebraicLocusSceneStatus, structuralHash,
  upsertMath3DProjectAlgebraicLocusScene, viewerSourceFromDocument,
  type Math3DProject, type SageAlgebraicLocusScene,
  type SageAlgebraicLocusSample } from "@math3d/core";
import type { SageRunResponse } from "../integrations/sage/sageSchemas";
import type { SageBackend } from "../services/sageOperationExecution";

export const SAGE_LOCUS_SINGULARITIES_OPERATION = "sage.symbolic.singularities";
const rational = /^(?:0|-?[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/;
const validIdealResponse = (response: SageRunResponse) => response.result.dimension === 1 &&
  response.result.codimension === 2 &&
  response.result.field === "QQ rational points, real-locus completeness checked over AA" &&
  Array.isArray(response.result.jacobianMinors) &&
  (response.result.jacobianMinors as unknown[]).every(item => typeof item === "string") &&
  Array.isArray(response.result.points) && response.result.points.length <= 64 &&
  response.result.points.every(point => point && typeof point === "object" &&
    Object.keys(point).sort().join(",") === "x,y,z" &&
    Object.values(point).every(value => typeof value === "string" && rational.test(value)));

/** Store the exact broker response beside the pinned locus Geometry contract. */
export function saveSageLocusSingularities(project: Math3DProject, scene: SageAlgebraicLocusScene,
  response: SageRunResponse, backend: SageBackend, sample?: SageAlgebraicLocusSample): Math3DProject {
  const ideal = scene.source.equations.length > 1;
  if (ideal && (scene.source.equations.length !== 2 || scene.domain.bounds.length !== 3 ||
      backend !== "docker" || !sample || sample.scene.sceneHash !== scene.sceneHash ||
      !validIdealResponse(response) ||
      response.result.criterion !== "all generators vanish and Jacobian rank is below codimension") ||
      response.operation !== SAGE_LOCUS_SINGULARITIES_OPERATION ||
      !response.success || response.engine !== "sagemath" ||
      sageAlgebraicLocusSceneStatus(scene, project) !== "current")
    throw new TypeError(ideal ?
      "A current sampled two-generator 3D ideal and successful Docker Sage Jacobian response are required." :
      "Only a current single-polynomial locus with a successful Sage singularities response can be saved.");
  const exact = sample ? upsertMath3DProjectAlgebraicLocusSample(project, sample) :
    upsertMath3DProjectAlgebraicLocusScene(project, scene);
  const geometry = sample ? sampledAlgebraicLocusGeometryDocument(sample) :
    algebraicLocusGeometryDocument(scene);
  const source = viewerSourceFromDocument(geometry);
  const result = createAnalysisResultEnvelope({
    resultId: `sage-locus-singularities:${structuralHash({ source,
      response: JSON.parse(JSON.stringify(response)), backend }).slice(7)}`,
    status: "exact", provenance: { source,
      operation: { type: SAGE_LOCUS_SINGULARITIES_OPERATION,
        algorithm: ideal ? "sagemath-ideal-jacobian-minors-v1" :
          "sagemath-symbolic-singularities-v1", algorithmVersion: "1",
        parameters: { sceneHash: scene.sceneHash,
          algebraObjectId: scene.source.target.id,
          algebraRevision: scene.source.target.revision,
          algebraContentHash: scene.source.target.contentHash,
          ...(ideal ? { equations: [...scene.source.equations],
            sampleResultHash: sample!.resultHash } : { polynomial: scene.source.equations[0] }),
          variables: scene.domain.bounds.map(bound => bound.variable), backend } },
      engine: { name: "SageMath", version: response.engineVersion ?? "unreported" },
      numericContext: { precision: { binaryBits: 53 } },
      elapsedMs: response.elapsedMs ?? 0 },
    summary: { exactResult: JSON.parse(JSON.stringify(response.result)), latex: response.latex,
      sceneHash: scene.sceneHash, backend },
    warnings: response.warnings, diagnostics: [], artifacts: [],
  });
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: result.provenance.operation.type }, operation: SAGE_LOCUS_SINGULARITIES_OPERATION,
    parameters: result.provenance.operation.parameters });
  return replaceMath3DProjectWorkspace(exact, createMixedWorkspaceDocument({ ...exact.workspace,
    results: [...exact.workspace.results.filter(item => item.resultId !== result.resultId), result],
    relations: [...exact.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}

/** Read exact broker output only while its pinned algebra and sampled Geometry source still qualify. */
export function inspectSavedSageLocusSingularities(project: Math3DProject, resultId: string) {
  const result = project.workspace.results.find(item => item.resultId === resultId &&
    item.provenance.operation.type === SAGE_LOCUS_SINGULARITIES_OPERATION);
  if (!result) return { status: "withheld" as const, reason: "Saved Sage result is missing." };
  const parameters = result.provenance.operation.parameters as Record<string, unknown>;
  const record = project.algebraObjects?.find(item => item.id === parameters.algebraObjectId);
  const source = record?.revisions.find(item => item.revision === parameters.algebraRevision);
  const geometry = project.workspace.entries.find(entry => entry.module === "geometry" &&
    entry.expected.id === result.provenance.source.documentId);
  if (!source || source.contentHash !== parameters.algebraContentHash ||
      record?.revisions.at(-1)?.revision !== parameters.algebraRevision ||
      !geometry || geometry.checkpoint.identity.structuralHash !== geometry.expected.structuralHash)
    return { status: "withheld" as const,
      reason: "Pinned algebra revision or saved locus Geometry changed or is missing." };
  let sourceMatches = matchesScientificSourceGeneration(result.provenance.source,
    viewerSourceFromDocument({ identity: geometry.expected }));
  if (!sourceMatches && !parameters.sampleResultHash) {
    // Publishing a bounded sample replaces the exact-only Geometry checkpoint at the same ID.
    // The earlier exact Sage result remains qualified only if that sample contains the identical scene.
    try {
      const { sample } = parseSampledAlgebraicLocusGeometryDocument(geometry.checkpoint, project);
      sourceMatches = sample.scene.sceneHash === parameters.sceneHash &&
        matchesScientificSourceGeneration(result.provenance.source,
          viewerSourceFromDocument(algebraicLocusGeometryDocument(sample.scene)));
    } catch { /* An invalid or different sample cannot carry the exact result. */ }
  }
  if (!sourceMatches) return { status: "withheld" as const,
    reason: "Pinned algebra revision or saved locus Geometry changed or is missing." };
  if (parameters.sampleResultHash) {
    try {
      const parsed = parseSampledAlgebraicLocusGeometryDocument(geometry.checkpoint, project);
      if (parsed.sample.resultHash !== parameters.sampleResultHash ||
          parsed.sample.scene.sceneHash !== parameters.sceneHash)
        throw new TypeError("Sample provenance differs.");
    } catch { return { status: "withheld" as const,
      reason: "Bounded real-locus sample is missing or changed." }; }
  }
  return { status: "current" as const, result };
}
