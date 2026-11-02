import { structuralHash, type AnalysisResultEnvelope,
  type Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export type ScientificSolverKind = "trajectory" | "equilibrium";
type AuditBase = Readonly<{ schemaVersion: 1; kind: "scientific-solver-audit";
  analysis: ScientificSolverKind; projectId: string; resultId: string }>;
export type ScientificSolverAuditExport = AuditBase & (
  Readonly<{ verification: { status: "verified"; checkedAt: string;
    resultHash: string; method: "source-verification-and-numerical-replay" };
    source: AnalysisResultEnvelope["provenance"]["source"];
    sourceReferences: unknown[]; sourceHashes: { document: string;
      measured: unknown | null }; operation: AnalysisResultEnvelope["provenance"]["operation"];
    engine: AnalysisResultEnvelope["provenance"]["engine"];
    settings: unknown; units: { coordinates: string[]; vector: string[];
      parameter?: string; residual?: string };
    diagnostics: { warnings: readonly string[];
      records: AnalysisResultEnvelope["diagnostics"] };
    figures: AnalysisResultEnvelope["summary"] }> |
  Readonly<{ verification: { status: "withheld"; checkedAt: string;
    reason: string } }>);

/** Reverify at call time. A failure record intentionally contains no saved figures or recipe. */
export async function createScientificSolverAuditExport(project: Math3DProject,
  reference: NotebookReference, analysis: ScientificSolverKind,
  verify: () => Promise<AnalysisResultEnvelope>,
  now: () => Date = () => new Date()): Promise<ScientificSolverAuditExport> {
  const base: AuditBase = { schemaVersion: 1, kind: "scientific-solver-audit",
    analysis, projectId: project.identity.id, resultId: reference.targetId };
  try {
    const result = await verify();
    if (result.resultId !== reference.targetId ||
        result.provenance.operation.type !== `vector3d.${analysis}-solver`)
      throw new TypeError("The verified solver result does not match the Workbook reference.");
    const source = verifyMixedWorkspaceReplay(project.workspace)
      .get(result.provenance.source.documentId);
    if (source?.format !== "math3d.vector-field3d-document")
      throw new TypeError("The verified vector source is unavailable.");
    const parameters = result.provenance.operation.parameters;
    const units = { coordinates: source.source.axes.map(axis => axis.unit),
      vector: source.source.field.kind === "scientific-bundle" ?
        [...source.source.field.componentUnits] :
        source.source.field.components.map(component => component.unit),
      ...(analysis === "trajectory" ?
        { parameter: String((result.summary.solver as Record<string, unknown>).parameterUnit) } :
        { residual: String(parameters.residualUnit) }) };
    return { ...base, verification: { status: "verified",
      checkedAt: now().toISOString(), resultHash: structuralHash(result),
      method: "source-verification-and-numerical-replay" },
    source: result.provenance.source,
    sourceReferences: Array.isArray(parameters.sourceReferences) ?
      parameters.sourceReferences : [],
    sourceHashes: { document: result.provenance.source.structuralHash,
      measured: parameters.verifiedSource ?? null },
    operation: result.provenance.operation, engine: result.provenance.engine,
    settings: analysis === "trajectory" ? result.summary.solver : {
      seedResolution: parameters.seedResolution,
      maxEvaluations: parameters.maxEvaluations,
      residualTolerance: result.summary.residualTolerance },
    units, diagnostics: { warnings: result.warnings, records: result.diagnostics },
    figures: result.summary } as ScientificSolverAuditExport;
  } catch (cause) {
    return { ...base, verification: { status: "withheld",
      checkedAt: now().toISOString(), reason: cause instanceof Error ?
        cause.message.slice(0, 500) : "Source or solver verification failed." } };
  }
}

export function downloadScientificSolverAuditExport(record: ScientificSolverAuditExport): void {
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.analysis}-solver-audit-${record.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
