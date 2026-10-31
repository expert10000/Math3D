import { VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE, structuralHash,
  type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";
import { createNotebookReference, WORKBOOK_STAGE_ORDER, type Workbook } from "@math3d/workbook";
import { inspectNotebookReference, type NotebookReference } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { checkSavedRegionResultSources, type SavedRegionSourceStatus } from
  "../vectorfield3d/checkSavedRegionResultSources";

export const SCIENTIFIC_SUBRECTANGLE_REPORT = "scientific-subrectangle-report/v1";
export const isScientificSubrectangle = (result: AnalysisResultEnvelope) =>
  result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE ||
  result.provenance.operation.type === VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE;

export const subrectangleSourcesCurrent = (status: SavedRegionSourceStatus | undefined): boolean => {
  if (status === "source-current") return true;
  if (!status || typeof status === "string") return false;
  return status.kind === "vector-derived" ?
    [status.vector, status.divergence, status.curlMagnitude].every(value => value === "source-current") :
    [status.vector, status.scalar, status.complex, status.complexMagnitude,
      status.complexPhase, status.divergence, status.curlMagnitude].every(value => value === "source-current");
};

/** The Workbook stores a citation and recipe; figures are resolved only after source verification. */
export function createScientificSubrectangleWorkbook(project: Math3DProject,
  result: AnalysisResultEnvelope, id: string, blockId: string): Workbook {
  if (!isScientificSubrectangle(result) || !project.workspace.results.some(item =>
    item.resultId === result.resultId && structuralHash(item) === structuralHash(result)))
    throw new TypeError("A published Project subrectangle is required.");
  const reference = createNotebookReference(project, "result", result.resultId);
  return { id, title: `Field report · ${result.provenance.operation.type ===
    VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE ? "combined" : "vector"} subrectangle`,
    updatedAt: Date.now(), stages: WORKBOOK_STAGE_ORDER.map(stage => ({ ...stage,
      blocks: stage.id === "compute" ? [{ id: blockId, type: "reference" as const,
        title: "Verified subrectangle report", notebookReference: reference,
        scientificRegionReport: { schemaVersion: 1 as const,
          kind: SCIENTIFIC_SUBRECTANGLE_REPORT } }] : [] })) };
}

export function scientificSubrectangleReportMarkdown(result: AnalysisResultEnvelope): string {
  if (!isScientificSubrectangle(result)) throw new TypeError("Not a subrectangle result.");
  const p = result.provenance.operation.parameters;
  const s = result.summary;
  const fields = result.provenance.operation.type === VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE
    ? ["vector", "scalar", "complexMagnitude", "complexPhase", "divergence", "curlMagnitude"]
    : ["vector", "divergence", "curlMagnitude"];
  const unit = (field: string) => field === "complexPhase" ? "rad" :
    String(s[field === "complexMagnitude" ? "complexUnit" : `${field}Unit`] ?? "");
  const vectorReferences = p.vectorReferences as Array<{ axes?: Array<{
    name: string; unit: string }> }> | undefined;
  const axisUnits = vectorReferences?.[0]?.axes?.map(axis =>
    `${axis.name} (${axis.unit})`).join(", ") ?? "see source document";
  const rows = fields.map(field => {
    const stats = s[field] as { count: number; gaps: number; mean: number | null;
      min: number | null; max: number | null };
    return `| ${field} | ${unit(field)} | ${stats.count} | ${stats.gaps} | ${stats.mean ?? "gap"} | ${stats.min ?? "gap"} | ${stats.max ?? "gap"} |`;
  });
  return [`# Verified scientific subrectangle`,
    `Result: ${result.resultId}`,
    `Source: ${result.provenance.source.documentId} · revision ${result.provenance.source.revision} · generation ${result.provenance.source.generation} · ${result.provenance.source.structuralHash}`,
    `Physical region: ${JSON.stringify(p.region)}\nSelected bounds: ${JSON.stringify(p.bounds)}\nCoordinate units: ${axisUnits}\nPositions: ${s.sampleCount}`,
    `Method: ${result.provenance.operation.algorithm} ${result.provenance.operation.algorithmVersion}; ${String(p.method ?? "verified 17×17 source-grid sampling")}`,
    `Engine: ${result.provenance.engine.name} ${result.provenance.engine.version}; precision ${result.provenance.numericContext?.precision?.binaryBits ?? "unknown"} binary bits; elapsed ${result.provenance.elapsedMs} ms`,
    `| Field | Unit | Values | Gaps | Mean | Min | Max |\n|---|---|---:|---:|---:|---:|---:|\n${rows.join("\n")}`,
    `Source references, verified sample and profile hashes:\n\`\`\`json\n${JSON.stringify({ profiles: p.profiles,
      vectorReferences: p.vectorReferences, scalarReference: p.scalarReference,
      realReference: p.realReference, imaginaryReference: p.imaginaryReference,
      vectorSamples: p.vectorSamples,
      derivedSamples: p.derivedSamples, scalarSampleSha256: p.scalarSampleSha256,
      realSampleSha256: p.realSampleSha256,
      imaginarySampleSha256: p.imaginarySampleSha256 }, null, 2)}\n\`\`\``,
    result.warnings.length ? `Warnings: ${result.warnings.join("; ")}` : "Warnings: none",
  ].join("\n\n");
}

/** Always replays the Project and rechecks source bytes before disclosing figures. */
export async function verifyScientificSubrectangleReport(project: Math3DProject,
  reference: NotebookReference,
  bridge: Parameters<typeof checkSavedRegionResultSources>[2] =
    typeof window === "undefined" ? undefined : window.scientificScenes):
  Promise<AnalysisResultEnvelope> {
  const inspected = inspectNotebookReference(project, reference);
  const result = inspected.result;
  if (inspected.status !== "current" || !result || !isScientificSubrectangle(result))
    throw new TypeError("The saved subrectangle result or source generation changed.");
  const documents = verifyMixedWorkspaceReplay(project.workspace);
  const source = documents.get(result.provenance.source.documentId);
  if (source?.format !== "math3d.vector-field3d-document")
    throw new TypeError("The report's vector source is missing.");
  const graphs = [...documents.values()].filter((document): document is
    import("@math3d/core").Graph2DDocument => document.format ===
      "math3d.graph2d-document");
  const status = await checkSavedRegionResultSources(result, source, bridge, graphs);
  if (!subrectangleSourcesCurrent(status))
    throw new TypeError(`Report values withheld: required source verification failed (${JSON.stringify(status)}). Repair or relink the scientific scene.`);
  return result;
}
