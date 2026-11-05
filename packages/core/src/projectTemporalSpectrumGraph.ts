import { structuralHash } from "./documentIdentity";
import type { Graph2DTemporalSpectrumOrigin } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";
import type { Math3DProject } from "./math3dProject";
import { projectTemporalSpectrumStatus, type TemporalSpectrumResult } from
  "./temporalSpectrum";
import type { VerifiedTemporalTransfers } from "./temporalFieldSourceDocument";

export const temporalSpectrumGraphRows = (result: TemporalSpectrumResult,
  series: "psd" | "autocorrelation"): readonly Graph2DPointRow[] =>
  (series === "psd" ? result.psd.map(item => ({ x: item.frequency,
    y: item.density })) : result.autocorrelation.map(item => ({
    x: item.separation, y: item.coefficient }))).map((item, index) => ({
      id: `row_${index + 1}`, ...item }));

export function createTemporalSpectrumGraphOrigin(project: Math3DProject,
  result: TemporalSpectrumResult, series: "psd" | "autocorrelation",
  transfers?: VerifiedTemporalTransfers): Graph2DTemporalSpectrumOrigin {
  const publication = result.publication;
  if (!project.workspace.results.some(item => item.resultId === publication.resultId &&
      structuralHash(item.summary) === structuralHash(publication.summary)) ||
      projectTemporalSpectrumStatus(project, publication, transfers).status !== "current")
    throw new TypeError("Save and verify the temporal spectrum before Graph handoff.");
  const summary = publication.summary;
  const recipe = publication.provenance.operation.parameters.recipe as
    { window?: string; detrend?: string } | undefined;
  const rows = temporalSpectrumGraphRows(result, series);
  if (rows.length < 2 || rows.length > 64 || rows.some(row =>
      !Number.isFinite(row.x) || row.y !== null && !Number.isFinite(row.y)))
    throw new TypeError("Temporal spectrum rows are unavailable or exceed the bounded artifact.");
  return { kind: "project-temporal-spectrum/v1", projectId: project.identity.id,
    resultId: publication.resultId, summaryHash: structuralHash(summary),
    rowsSha256: structuralHash(rows), series,
    axisUnit: String(series === "psd" ? summary.frequencyUnit : summary.timeUnit),
    valueUnit: String(series === "psd" ? summary.powerUnit : "1"),
    sampleCount: Number(summary.sampleCount) as 16 | 32 | 64,
    window: recipe?.window as "rectangular" | "hann",
    detrend: recipe?.detrend as "none" | "mean",
    interpolation: summary.interpolation as "none" | "linear" };
}

export function projectTemporalSpectrumGraphStatus(project: Math3DProject | null | undefined,
  origin: Graph2DTemporalSpectrumOrigin, rows: readonly Graph2DPointRow[] | null,
  transfers?: VerifiedTemporalTransfers):
  Readonly<{ status: "current" | "withheld"; reason: string | null }> {
  if (!project || project.identity.id !== origin.projectId)
    return { status: "withheld", reason: "project-missing" };
  const result = project.workspace.results.find(item => item.resultId === origin.resultId);
  if (!result) return { status: "withheld", reason: "result-missing" };
  if (structuralHash(result.summary) !== origin.summaryHash ||
      result.summary.sampleCount !== origin.sampleCount ||
      result.summary.window !== origin.window ||
      result.summary.detrend !== origin.detrend ||
      result.summary.interpolation !== origin.interpolation ||
      String(origin.series === "psd" ? result.summary.frequencyUnit : result.summary.timeUnit) !==
        origin.axisUnit ||
      String(origin.series === "psd" ? result.summary.powerUnit : "1") !== origin.valueUnit)
    return { status: "withheld", reason: "result-changed" };
  if (!rows || structuralHash(rows) !== origin.rowsSha256)
    return { status: "withheld", reason: "series-artifact-missing-or-changed" };
  const source = projectTemporalSpectrumStatus(project, result, transfers);
  return source.status === "current" ? { status: "current", reason: null } :
    { status: "withheld", reason: source.reason };
}
