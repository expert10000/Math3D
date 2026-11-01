import { VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE, structuralHash,
  verifyVectorField3DTrajectoryResult, type AnalysisResultEnvelope,
  type Math3DProject } from "@math3d/core";
import { createNotebookReference, inspectNotebookReference,
  WORKBOOK_STAGE_ORDER, type NotebookReference, type Workbook } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export const SCIENTIFIC_TRAJECTORY_REPORT = "scientific-trajectory-report/v1" as const;
export const isScientificTrajectory = (result: AnalysisResultEnvelope) =>
  result.provenance.operation.type === VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE;

export function createScientificTrajectoryWorkbook(project: Math3DProject,
  result: AnalysisResultEnvelope, id: string, blockId: string): Workbook {
  if (!isScientificTrajectory(result) || !project.workspace.results.some(item =>
    item.resultId === result.resultId && structuralHash(item) === structuralHash(result)))
    throw new TypeError("A published trajectory solver result is required.");
  return { id, title: "Field report · trajectory solver", updatedAt: Date.now(),
    stages: WORKBOOK_STAGE_ORDER.map(stage => ({ ...stage,
      blocks: stage.id === "compute" ? [{ id: blockId, type: "reference" as const,
        title: "Verified trajectory solver report",
        notebookReference: createNotebookReference(project, "result", result.resultId),
        scientificRegionReport: { schemaVersion: 1 as const,
          kind: SCIENTIFIC_TRAJECTORY_REPORT } }] : [] })) };
}

export function verifyScientificTrajectoryReport(project: Math3DProject,
  reference: NotebookReference): AnalysisResultEnvelope {
  const inspected = inspectNotebookReference(project, reference);
  const result = inspected.result;
  if (inspected.status !== "current" || !result || !isScientificTrajectory(result))
    throw new TypeError("The saved trajectory result or Project reference changed.");
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const source = documents.get(result.provenance.source.documentId);
  if (source?.format !== "math3d.vector-field3d-document")
    throw new TypeError("The trajectory source document is missing.");
  return verifyVectorField3DTrajectoryResult(result, source);
}

export function scientificTrajectoryReportMarkdown(result: AnalysisResultEnvelope): string {
  if (!isScientificTrajectory(result)) throw new TypeError("Not a trajectory solver result.");
  const summary = result.summary as unknown as { solver: Record<string, unknown>;
    totalEvaluations: number; trajectories: Array<Record<string, unknown>> };
  const coordinateUnits = result.provenance.operation.parameters.coordinateUnits as string[];
  const arcUnit = coordinateUnits.every(unit => unit === coordinateUnits[0]) ?
    coordinateUnits[0] : "mixed coordinate units";
  const rows = summary.trajectories.map(path =>
    `| ${path.seedId} | ${path.direction} | ${path.stopReason} | ${path.acceptedSteps} | ${path.rejectedSteps} | ${path.evaluations} | ${path.maxEstimatedLocalError ?? "gap"} | ${path.parameterEnd ?? "gap"} | ${path.arcLength ?? "gap"} | ${Array.isArray(path.endpoint) ? path.endpoint.join(", ") : "gap"} |`);
  return [`# Verified trajectory solver report`,
    `Result: ${result.resultId}`,
    `Source: ${result.provenance.source.documentId} · revision ${result.provenance.source.revision} · ${result.provenance.source.structuralHash}`,
    `Method: ${summary.solver.method}; mode ${summary.solver.mode}; absolute tolerance ${summary.solver.absoluteTolerance}; relative tolerance ${summary.solver.relativeTolerance}; maximum steps ${summary.solver.maxSteps}.`,
    `Total evaluations: ${summary.totalEvaluations}. Parameter unit: ${summary.solver.parameterUnit}. Coordinate units: ${coordinateUnits.join(", ")}.`,
    `| Seed | Direction | Stop reason | Accepted steps | Rejected steps | Evaluations | Largest local error | Final parameter (${summary.solver.parameterUnit}) | Arc length (${arcUnit}) | Endpoint (${coordinateUnits.join(", ")}) |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|\n${rows.join("\n")}`,
    `Solver settings and source recipe:\n\`\`\`json\n${JSON.stringify({ solver: summary.solver,
      parameters: result.provenance.operation.parameters }, null, 2)}\n\`\`\``,
    result.warnings.length ? `Warnings: ${result.warnings.join("; ")}` : "Warnings: none",
  ].join("\n\n");
}
