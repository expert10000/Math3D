import { isScientificSourceGeneration, matchesScientificSourceGeneration } from "@math3d/core";
import type { SavedMeshChoice } from "./SavedMeshAnalysisPanel";

export type SweepMetric = "averageAbsH" | "averageK";
export const sweepMetricLabel = (metric: SweepMetric) => metric === "averageAbsH" ? "Mean |H|" : "Average Gaussian K";
const meshSource = (choice: SavedMeshChoice) => ({ documentId: choice.id, revision: choice.revision, structuralHash: choice.structuralHash, generation: choice.meshGeneration?.generation ?? choice.revision });
const retainedResult = (choice: SavedMeshChoice) => {
  const source = meshSource(choice);
  if (!isScientificSourceGeneration(source)) return undefined;
  return choice.results.find(result => result.resultId === choice.studyRun?.resultId &&
    result.provenance.operation.type === "mesh.saved.curvature" && result.status === "numerical" &&
    matchesScientificSourceGeneration(result.provenance.source, source));
};

export const availableSavedSweepRuns = (choices: readonly SavedMeshChoice[]) => choices.filter(choice => choice.studyRun && retainedResult(choice));

/** Export recorded statistics, never recompute or relabel an edited Mesh's historical result. */
export const savedStudySweepReport = (choices: readonly SavedMeshChoice[], sweepId: string, metric: SweepMetric) => {
  const members = choices.filter(choice => choice.studyRun?.sweepId === sweepId).sort((a, b) => a.studyRun!.value - b.studyRun!.value);
  const available = availableSavedSweepRuns(members);
  if (!available.length) throw new TypeError("This sweep has no retained curvature results matching its saved Mesh generations.");
  const first = available[0], run = first.studyRun!, lengthUnits = first.units ?? "unknown";
  if (available.length > 5 || new Set(available.map(choice => choice.studyRun!.value)).size !== available.length || new Set(members.map(choice => choice.id)).size !== members.length ||
      members.some(choice => choice.studyRun!.presetId !== run.presetId || choice.studyRun!.resolution !== run.resolution ||
        !matchesScientificSourceGeneration(choice.studyRun!.baseSource, run.baseSource) || (choice.units ?? "unknown") !== lengthUnits))
    throw new TypeError("Sweep runs must share their preset, base source generation, sampling and length units.");
  return {
    format: "math3d.saved-study-sweep.v1" as const,
    sweepId, presetId: run.presetId, parameter: run.presetId === "helicoid" ? "Pitch per radian" : "Waist radius",
    baseSource: run.baseSource, samplesPerAxis: run.resolution, lengthUnits,
    chart: { metric, label: sweepMetricLabel(metric), units: lengthUnits === "unknown" ? "unknown" : `${lengthUnits}${metric === "averageK" ? "^-2" : "^-1"}` },
    qualification: "Discrete saved Mesh estimates. Interior statistics exclude boundary/invalid vertices. Connecting sampled averages is not an error bound or proof of convergence/minimality. Catenoid axial ranges scale with waist radius. Historical source runs retain their recorded generations.",
    runs: available.map(choice => ({
      title: choice.title, parameterValue: choice.studyRun!.value, meshSource: meshSource(choice), surfaceSource: choice.surfaceGeneration ?? null,
      baseSource: choice.studyRun!.baseSource, current: choice.current, samplesPerAxis: choice.studyRun!.resolution,
      sampling: choice.sampling ?? null, lengthUnits: choice.units ?? "unknown", vertexCount: choice.vertexCount,
      interior: { ...choice.studyRun!.interior }, savedResult: retainedResult(choice)!,
    })),
    excludedRuns: members.filter(choice => !retainedResult(choice)).map(choice => ({ title: choice.title, parameterValue: choice.studyRun!.value,
      meshSource: meshSource(choice), resultId: choice.studyRun!.resultId, reason: "The recorded curvature result is missing or no longer matches this Mesh generation." })),
  };
};
export type SavedStudySweepReport = ReturnType<typeof savedStudySweepReport>;

export const savedStudySweepCsv = (report: SavedStudySweepReport) => {
  // Protect every text column, including quoted/multiline names, when opened in a spreadsheet.
  const cell = (value: unknown) => {
    const raw = String(value ?? ""), text = typeof value === "string" && (/^\s*[=+\-@]/.test(raw) || /^[\t\r\n]/.test(raw)) ? `'${raw}` : raw;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const headers = ["sweepId", "preset", "parameter", "parameterValue", "studyName", "included", "exclusionReason", "current", "samplesPerAxis", "lengthUnits",
    "baseSourceId", "baseSourceRevision", "baseSourceHash", "baseSourceGeneration", "surfaceId", "surfaceRevision", "surfaceHash", "surfaceGeneration", "meshId", "meshRevision", "meshHash", "meshGeneration",
    "vertexCount", "interiorVertices", "excludedVertices", "averageK", "averageH", "meanAbsH", "maxAbsH", "resultId", "authority", "algorithm", "algorithmVersion", "backend", "backendVersion", "warnings", "sampling", "chartMetric", "qualification"];
  const base = [report.baseSource.documentId, report.baseSource.revision, report.baseSource.structuralHash, report.baseSource.generation];
  const rows: unknown[][] = [headers];
  for (const run of report.runs) rows.push([report.sweepId, report.presetId, report.parameter, run.parameterValue, run.title, true, "", run.current, run.samplesPerAxis, run.lengthUnits,
    ...base, run.surfaceSource?.documentId, run.surfaceSource?.revision, run.surfaceSource?.structuralHash, run.surfaceSource?.generation, run.meshSource.documentId, run.meshSource.revision, run.meshSource.structuralHash, run.meshSource.generation,
    run.vertexCount, run.interior.count, run.interior.excluded, run.interior.averageK, run.interior.averageH, run.interior.averageAbsH, run.interior.maxAbsH,
    run.savedResult.resultId, run.savedResult.status, run.savedResult.provenance.operation.algorithm, run.savedResult.provenance.operation.algorithmVersion,
    run.savedResult.provenance.engine.name, run.savedResult.provenance.engine.version, JSON.stringify(run.savedResult.warnings), JSON.stringify(run.sampling), report.chart.metric, report.qualification]);
  for (const run of report.excludedRuns) rows.push([report.sweepId, report.presetId, report.parameter, run.parameterValue, run.title, false, run.reason, "", report.samplesPerAxis, report.lengthUnits,
    ...base, "", "", "", "", run.meshSource.documentId, run.meshSource.revision, run.meshSource.structuralHash, run.meshSource.generation,
    "", "", "", "", "", "", "", run.resultId, "", "", "", "", "", "", "", report.chart.metric, report.qualification]);
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
};
