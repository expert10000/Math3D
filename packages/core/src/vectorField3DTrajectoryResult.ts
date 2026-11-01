import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { integrateVectorField3DTrajectories,
  type VectorField3DTrajectoryArtifact } from "./vectorField3DTrajectories";
import { viewerSourceFromDocument } from "./viewerProvenance";

export const VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE = "vector3d.trajectory-solver" as const;

/** Publish solver diagnostics only; trajectory point arrays stay in the viewer. */
export function createVectorField3DTrajectoryResult(document: VectorField3DDocument,
  artifact: VectorField3DTrajectoryArtifact): AnalysisResultEnvelope {
  if (document.source.field.kind !== "expressions")
    throw new TypeError("Trajectory Solver Workbook reports currently require an authored expression field.");
  if (artifact.source.documentId !== document.identity.id ||
      artifact.source.revision !== document.identity.revision ||
      artifact.source.structuralHash !== document.identity.structuralHash)
    throw new TypeError("The trajectory source generation changed.");
  const direction = artifact.trajectories[0]?.direction;
  if (!direction || artifact.trajectories.some(path => path.direction !== direction))
    throw new TypeError("One consistent trajectory direction is required.");
  const source = viewerSourceFromDocument(document);
  const summary = {
    solver: { ...artifact.solver }, totalEvaluations: artifact.totalEvaluations,
    trajectories: artifact.trajectories.map(path => ({ seedId: path.seedId,
      direction: path.direction, acceptedSteps: path.acceptedSteps,
      rejectedSteps: path.rejectedSteps, evaluations: path.evaluations,
      stopReason: path.stopReason, maxEstimatedLocalError:
        Number.isFinite(path.maxEstimatedLocalError) ? path.maxEstimatedLocalError : null,
      stopDetail: path.stopDetail,
      endpoint: path.points.at(-1)?.position ?? null,
      parameterEnd: path.points.at(-1)?.time ?? null,
      arcLength: path.points.at(-1)?.arcLength ?? null })) };
  const parameters = { seedIds: document.source.seeds.map(seed => seed.id), direction,
    coordinateUnits: document.source.axes.map(axis => axis.unit),
    sourceHash: document.identity.structuralHash };
  const resultId = `vector3d-trajectories:${structuralHash({ source,
    parameters, summary }).slice(7)}`;
  return createAnalysisResultEnvelope({ resultId, status: "numerical",
    provenance: { source, operation: { type: VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE,
      algorithm: artifact.solver.method, algorithmVersion: "solver-report-v1",
      parameters }, numericContext: { precision: { binaryBits: 53 },
      tolerance: { absolute: artifact.solver.absoluteTolerance,
        relative: artifact.solver.relativeTolerance } },
      engine: { name: "Math3D trajectory integrator", version: "1" }, elapsedMs: 0 },
    summary, warnings: artifact.trajectories.some(path =>
      ["solver-failure", "undefined", "step-limit", "cancelled"].includes(path.stopReason)) ?
      ["One or more trajectories stopped before the requested limit."] : [],
    diagnostics: [], artifacts: [] });
}

/** Rerun the pinned expression source before disclosing saved solver numbers. */
export function verifyVectorField3DTrajectoryResult(saved: AnalysisResultEnvelope,
  document: VectorField3DDocument): AnalysisResultEnvelope {
  if (saved.provenance.operation.type !== VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE ||
      document.source.field.kind !== "expressions")
    throw new TypeError("A saved authored-field trajectory result is required.");
  const fresh = createVectorField3DTrajectoryResult(document,
    integrateVectorField3DTrajectories(document, {
      direction: saved.provenance.operation.parameters.direction === "backward" ?
        "backward" : "forward" }));
  if (saved.resultId !== fresh.resultId ||
      canonicalJsonStringify(saved.provenance.source) !==
        canonicalJsonStringify(fresh.provenance.source) ||
      canonicalJsonStringify(saved.provenance.operation) !==
        canonicalJsonStringify(fresh.provenance.operation) ||
      canonicalJsonStringify(saved.summary) !== canonicalJsonStringify(fresh.summary))
    throw new TypeError("Saved trajectory solver statistics differ from the verified source.");
  return saved;
}
