import { algebraicLocusGeometryDocument, createAnalysisResultEnvelope,
  createDocumentRelation, createMixedWorkspaceDocument, replaceMath3DProjectWorkspace,
  sageAlgebraicLocusSceneStatus, structuralHash,
  upsertMath3DProjectAlgebraicLocusScene, viewerSourceFromDocument,
  type Math3DProject, type SageAlgebraicLocusScene } from "@math3d/core";
import type { SageRunResponse } from "../integrations/sage/sageSchemas";
import type { SageBackend } from "../services/sageOperationExecution";

export const SAGE_LOCUS_SINGULARITIES_OPERATION = "sage.symbolic.singularities";

/** Store the exact broker response beside the pinned locus Geometry contract. */
export function saveSageLocusSingularities(project: Math3DProject, scene: SageAlgebraicLocusScene,
  response: SageRunResponse, backend: SageBackend): Math3DProject {
  if (scene.source.equations.length !== 1 || response.operation !== SAGE_LOCUS_SINGULARITIES_OPERATION ||
      !response.success || response.engine !== "sagemath" ||
      sageAlgebraicLocusSceneStatus(scene, project) !== "current")
    throw new TypeError("Only a current single-polynomial locus with a successful Sage singularities response can be saved.");
  const exact = upsertMath3DProjectAlgebraicLocusScene(project, scene);
  const geometry = algebraicLocusGeometryDocument(scene);
  const source = viewerSourceFromDocument(geometry);
  const result = createAnalysisResultEnvelope({
    resultId: `sage-locus-singularities:${structuralHash({ source,
      response: JSON.parse(JSON.stringify(response)), backend }).slice(7)}`,
    status: "exact", provenance: { source,
      operation: { type: SAGE_LOCUS_SINGULARITIES_OPERATION,
        algorithm: "sagemath-symbolic-singularities-v1", algorithmVersion: "1",
        parameters: { sceneHash: scene.sceneHash,
          algebraObjectId: scene.source.target.id,
          algebraRevision: scene.source.target.revision,
          algebraContentHash: scene.source.target.contentHash,
          polynomial: scene.source.equations[0],
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
