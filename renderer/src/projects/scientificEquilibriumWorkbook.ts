import { VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE, structuralHash,
  verifyVectorField3DEquilibriumResult, type AnalysisResultEnvelope,
  type Math3DProject } from "@math3d/core";
import { createNotebookReference, inspectNotebookReference,
  WORKBOOK_STAGE_ORDER, type NotebookReference, type Workbook } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { reverifyScientificEquilibriumResult,
  type ScientificEquilibriumBridge, type ScientificEquilibriumReplay } from
  "../vectorfield3d/reverifyScientificEquilibriumResult";

export const SCIENTIFIC_EQUILIBRIUM_REPORT = "scientific-equilibrium-report/v1" as const;
export const isScientificEquilibrium = (result: AnalysisResultEnvelope) =>
  result.provenance.operation.type === VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE;

export function createScientificEquilibriumWorkbook(project: Math3DProject,
  result: AnalysisResultEnvelope, id: string, blockId: string): Workbook {
  if (!isScientificEquilibrium(result) || !project.workspace.results.some(item =>
    item.resultId === result.resultId && structuralHash(item) === structuralHash(result)))
    throw new TypeError("A published equilibrium search result is required.");
  return { id, title: "Field report · equilibrium search", updatedAt: Date.now(),
    stages: WORKBOOK_STAGE_ORDER.map(stage => ({ ...stage,
      blocks: stage.id === "compute" ? [{ id: blockId, type: "reference" as const,
        title: "Verified equilibrium solver report",
        notebookReference: createNotebookReference(project, "result", result.resultId),
        scientificRegionReport: { schemaVersion: 1 as const,
          kind: SCIENTIFIC_EQUILIBRIUM_REPORT } }] : [] })) };
}

export async function verifyScientificEquilibriumReport(project: Math3DProject,
  reference: NotebookReference, bridge: ScientificEquilibriumBridge | undefined =
    typeof window === "undefined" ? undefined : window.scientificScenes,
  replay?: ScientificEquilibriumReplay): Promise<AnalysisResultEnvelope> {
  const inspected = inspectNotebookReference(project, reference), result = inspected.result;
  if (inspected.status !== "current" || !result || !isScientificEquilibrium(result))
    throw new TypeError("The saved equilibrium result or Project reference changed.");
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const source = documents.get(result.provenance.source.documentId);
  if (source?.format !== "math3d.vector-field3d-document")
    throw new TypeError("The equilibrium source document is missing.");
  return source.source.field.kind === "scientific-bundle" ?
    reverifyScientificEquilibriumResult(result, source, bridge, replay) :
    verifyVectorField3DEquilibriumResult(result, source);
}

export function scientificEquilibriumReportMarkdown(result: AnalysisResultEnvelope): string {
  if (!isScientificEquilibrium(result)) throw new TypeError("Not an equilibrium solver result.");
  const summary = result.summary as unknown as { stopReason: string;
    attemptedSeeds: number; rejectedSeeds: number; evaluations: number;
    maxEvaluations: number; seedResolution: number; residualTolerance: number;
    candidateCount: number; candidates: Array<Record<string, unknown>>;
    stopCounts: { converged: number; undefined: number;
      residual: number; duplicate: number } };
  const parameters = result.provenance.operation.parameters;
  const verifiedSource = parameters.verifiedSource as
    { kind: string; sourceHash: string; components: Array<Record<string, unknown>> } | undefined;
  const proof = verifiedSource ? [
    `Measured source hash: ${verifiedSource.sourceHash}.`,
    verifiedSource.kind === "tile-sets" ?
      `| Component | Resource SHA-256 | Verified tiles | Tile-set SHA-256 |\n|---|---|---:|---|\n${verifiedSource.components.map(part =>
        `| ${part.name} | ${part.resourceSha256} | ${part.verifiedTiles}/${part.totalTiles} | ${part.tileSetSha256} |`).join("\n")}` :
      `| Component | Resource SHA-256 | Sample SHA-256 | Sample shape |\n|---|---|---|---|\n${verifiedSource.components.map(part =>
        `| ${part.name} | ${part.resourceSha256} | ${part.sampleSha256} | ${part.sampleShape} |`).join("\n")}`,
  ] : [];
  const candidates = summary.candidates.map((candidate, index) =>
    `| ${index + 1} | ${Array.isArray(candidate.position) ? candidate.position.join(", ") : "gap"} | ${candidate.residual} | ${candidate.iterations} | ${candidate.stopReason} | ${candidate.classification} | ${candidate.conditionEstimate ?? "gap"} |`);
  return [`# Verified equilibrium solver report`,
    `Result: ${result.resultId}`,
    `Source: ${result.provenance.source.documentId} · revision ${result.provenance.source.revision} · ${result.provenance.source.structuralHash}`,
    `Bounded search: ${summary.seedResolution}×${summary.seedResolution}×${summary.seedResolution} grid plus saved seeds; ${summary.attemptedSeeds} attempted, ${summary.rejectedSeeds} rejected, ${summary.candidateCount} candidates. Stop reason: ${summary.stopReason}.`,
    `Seed outcomes: ${summary.stopCounts.converged} converged, ${summary.stopCounts.residual} above residual threshold, ${summary.stopCounts.undefined} undefined, ${summary.stopCounts.duplicate} duplicates.`,
    `Evaluations: ${summary.evaluations}/${summary.maxEvaluations}. Residual threshold: ${summary.residualTolerance} ${parameters.residualUnit}. Coordinates: ${parameters.coordinateUnits}. Unsampled equilibria may remain.`,
    ...proof,
    `| Candidate | Position | Residual (${parameters.residualUnit}) | Newton iterations | Stop reason | Classification | Condition estimate |\n|---:|---|---:|---:|---|---|---:|\n${candidates.join("\n")}`,
    `Source and search recipe:\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\``,
    result.warnings.length ? `Warnings: ${result.warnings.join("; ")}` : "Warnings: none",
  ].join("\n\n");
}
