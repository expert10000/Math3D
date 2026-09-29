import { analyzeGraph2DDerivative, analyzeGraph2DLocalDifferential, analyzeGraph2DCriticalPoints,
  analyzeGraph2DIntegral, analyzeGraph2DIntersections, analyzeGraph2DArcLength, evaluateGraph2DExpression,
  type AnalysisResultEnvelope, type Graph2DDocument, type Graph2DLineOverlay, type Graph2DProbe, type Graph2DAreaFillSegment, structuralHash } from "@math3d/core";
import { graph2DPublicationAnalysisTables, type Graph2DPublicationTable } from "@math3d/core";
const publicationProjection = (results: readonly { publication: AnalysisResultEnvelope }[]) => {
  const { analyses, analysisNotes } = graph2DPublicationAnalysisTables(results);
  return { publicationTables: analyses, publicationNotes: analysisNotes };
};

export type MobileGraphAnalysisKind = "derivatives" | "tangent" | "features" | "integral" | "intersections" | "arc-length";
export type MobileGraphAnalysisDraft = { kind: MobileGraphAnalysisKind; objectId: string; secondId: string;
  x: string; min: string; max: string; tolerance: string; mode: "signed" | "absolute" };
export type MobileGraphAnalysisRow = { label: string; detail: string; probe?: Graph2DProbe };
export type MobileGraphAnalysis = { kind: MobileGraphAnalysisKind; inputHash: string; publications: readonly AnalysisResultEnvelope[];
  rows: readonly MobileGraphAnalysisRow[]; overlays: readonly Graph2DLineOverlay[]; areaSegments?: readonly Graph2DAreaFillSegment[];
  publicationTables?: readonly Graph2DPublicationTable[]; publicationNotes?: readonly string[] };
export const mobileGraphAnalysisDraft = (document: Graph2DDocument): MobileGraphAnalysisDraft => ({ kind: "derivatives",
  objectId: document.selection.objectId ?? document.source.objects.find((object) => object.kind === "explicit-cartesian")?.id ?? "",
  secondId: "", x: String(document.selection.probe?.x ?? 0), min: "-1", max: "1", tolerance: "0.00001", mode: "signed" });
const number = (text: string) => {
  if (!text.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text)))
    throw new TypeError("Enter finite numeric inputs.");
  return Number(text);
};
const format = (value: number | null) => value === null ? "unavailable" : value.toPrecision(8);
export const mobileGraphAnalysisInputHash = (draft: MobileGraphAnalysisDraft) => structuralHash(draft);

/** One requested bounded shared-core operation, never automatic all-function work. */
export const runMobileGraphAnalysis = (document: Graph2DDocument, draft: MobileGraphAnalysisDraft): MobileGraphAnalysis => {
  const object = document.source.objects.find((object) => object.id === draft.objectId);
  if (!object || object.kind !== "explicit-cartesian") throw new TypeError("Choose an explicit function to analyze.");
  const result: MobileGraphAnalysis = { kind: draft.kind, inputHash: mobileGraphAnalysisInputHash(draft), publications: [], rows: [], overlays: [] };
  const tolerance = number(draft.tolerance);
  if (tolerance < 1e-10 || tolerance > 0.1) throw new TypeError("Mobile tolerance must be between 1e-10 and 0.1.");
  if (draft.kind === "derivatives" || draft.kind === "tangent") {
    const x = number(draft.x);
    if (draft.kind === "derivatives") {
      const estimates = ([1, 2] as const).map((order) => analyzeGraph2DDerivative({ document, objectId: object.id, x, order, tolerance }));
      return { ...result, ...publicationProjection(estimates), publications: estimates.map((estimate) => estimate.publication), rows: estimates.map((estimate) => ({
        label: `Derivative order ${estimate.order}: ${format(estimate.value)}`,
        detail: `${estimate.status} · ${estimate.method} · tolerance ${estimate.tolerance} · estimated error ${format(estimate.errorEstimate)}${estimate.formula ? ` · ${estimate.formula}` : ""}` })) };
    }
    const evaluated = evaluateGraph2DExpression(object.expression.ast, { x, ...Object.fromEntries(document.source.variables.map((variable) => [variable.name, variable.value])) });
    if (!evaluated.ok) throw new TypeError(evaluated.diagnostic.message);
    const probe = { objectId: object.id, x, y: evaluated.value };
    const differential = analyzeGraph2DLocalDifferential({ ...document, selection: { objectId: object.id, probe } });
    if (!differential) throw new TypeError("Tangent is unavailable.");
    return { ...result, ...publicationProjection([differential]), publications: [differential.publication], overlays: differential.overlays.filter((overlay) => overlay.kind === "tangent"),
      rows: [{ label: `Tangent: ${differential.tangent?.equation ?? "unavailable"}`, detail: `${differential.state} · ${differential.slopeMethod}`, probe },
        { label: `Normal: ${differential.normal?.equation ?? "unavailable"}`, detail: "Perpendicular to a resolved tangent" }] };
  }
  const interval = { min: number(draft.min), max: number(draft.max) };
  if (interval.min >= interval.max || interval.max - interval.min > 1e6) throw new TypeError("Choose an increasing interval no wider than 1,000,000.");
  if (draft.kind === "features") {
    const analysis = analyzeGraph2DCriticalPoints({ document, objectId: object.id, interval });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], rows: [{ label: `Feature scan: ${analysis.status}`, detail:
      `${analysis.evaluations} evaluations · ${analysis.candidates.length} candidates · narrow features may be missed; no proof of absence` },
      ...analysis.candidates.map((candidate) => ({ label: `${candidate.kind}: (${format(candidate.x)}, ${format(candidate.y)})`,
        detail: `${candidate.confidence} · ${candidate.method} · residual ${candidate.residual} · multiplicity ${candidate.multiplicity}`,
        probe: { objectId: object.id, x: candidate.x, y: candidate.y } }))] };
  }
  if (draft.kind === "intersections") {
    const analysis = analyzeGraph2DIntersections({ document, firstObjectId: object.id, secondObjectId: draft.secondId, interval });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], rows: [{ label: `Intersections: ${analysis.status}`, detail:
      `${analysis.evaluations} evaluations · invalid cells ${analysis.invalidCells} · unresolved brackets ${analysis.unresolvedBrackets} · coincident cells ${analysis.coincidentCells} · pair-only scan, not a proof` },
      ...analysis.candidates.map((candidate) => ({ label: `Intersection: (${format(candidate.x)}, ${format(candidate.y)})`,
        detail: `${candidate.confidence} · ${candidate.classification} · ${candidate.method} · residual ${candidate.residual}`,
        probe: { objectId: candidate.firstObjectId, x: candidate.x, y: candidate.y } }))] };
  }
  if (draft.kind === "integral") {
    const analysis = analyzeGraph2DIntegral({ document, objectId: object.id, interval, mode: draft.mode, tolerance });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], areaSegments: analysis.fillSegments, rows: [{ label: `${analysis.mode} integral: ${format(analysis.value)}`,
      detail: `${analysis.status} · adaptive Simpson · tolerance ${analysis.tolerance} · estimated error ${format(analysis.errorEstimate)} · ${analysis.evaluations} evaluations · skipped cells ${analysis.skippedCells} · partial value ${format(analysis.partialValue)} (not a full-interval answer)` }] };
  }
  if (draft.kind !== "arc-length") throw new TypeError("Unknown analysis operation.");
  const analysis = analyzeGraph2DArcLength({ document, objectId: object.id, interval, tolerance });
  return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], rows: [{ label: `Arc length: ${format(analysis.value)}`,
    detail: `${analysis.status} · ${analysis.method} · tolerance ${analysis.tolerance} · estimated error ${format(analysis.errorEstimate)} · ${analysis.evaluations} evaluations · unresolved cells ${analysis.unresolvedCells} · partial value ${format(analysis.partialValue)}` }] };
};

export const isMobileGraphAnalysisCurrent = (result: MobileGraphAnalysis, document: Graph2DDocument, draft: MobileGraphAnalysisDraft) =>
  result.inputHash === mobileGraphAnalysisInputHash(draft) && result.publications.length > 0 && result.publications.every((publication) => {
    const source = publication.provenance.source;
    return source.documentId === document.identity.id && source.revision === document.identity.revision && source.structuralHash === document.identity.structuralHash;
  });
export const mobileGraphAnalysisProbe = (document: Graph2DDocument, probe: Graph2DProbe): Graph2DProbe => {
  const object = document.source.objects.find((entry) => entry.id === probe.objectId);
  if (!object || object.kind !== "explicit-cartesian" || probe.x < object.domain.min || probe.x > object.domain.max ||
    probe.x === object.domain.min && !object.domain.includeMin || probe.x === object.domain.max && !object.domain.includeMax)
    throw new TypeError("Result point is outside the source domain.");
  const evaluated = evaluateGraph2DExpression(object.expression.ast, { x: probe.x,
    ...Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value])) });
  if (!evaluated.ok) throw new TypeError("Result point is undefined.");
  return { ...probe, y: evaluated.value };
};
