import { analyzeGraph2DDerivative, analyzeGraph2DLocalDifferential, analyzeGraph2DCriticalPoints,
  analyzeGraph2DIntegral, analyzeGraph2DIntersections, analyzeGraph2DArcLength, analyzeGraph2DPolarMeasurement,
  analyzeGraph2DPolarLocalDifferential, analyzeGraph2DParametricLocalDifferential,
  evaluateGraph2DPolar, evaluateGraph2DParametric, evaluateGraph2DExpression,
  type AnalysisResultEnvelope, type Graph2DDocument, type Graph2DLineOverlay, type Graph2DProbe, type Graph2DAreaFillSegment,
  type Graph2DCriticalPoint, type Graph2DCriticalPointAnalysis, type Graph2DIntersectionCandidate,
  type Graph2DIntersectionAnalysis, structuralHash } from "@math3d/core";
import { graph2DPublicationAnalysisTables, type Graph2DPublicationTable } from "@math3d/core";
import { analyzeGraph2DRegression, graph2DRegressionResidualTable, graph2DRegressionCurveTable, type Graph2DRegression, type Graph2DPointRow } from "@math3d/core";
const publicationProjection = (results: readonly { publication: AnalysisResultEnvelope }[]) => {
  const { analyses, analysisNotes } = graph2DPublicationAnalysisTables(results);
  return { publicationTables: analyses, publicationNotes: analysisNotes };
};

export type MobileGraphAnalysisKind = "derivatives" | "tangent" | "features" | "integral" | "intersections" | "arc-length" |
  "polar-area" | "polar-arc-length" | "polar-tangent" | "parametric-tangent" | "regression-linear" | "regression-quadratic" | "regression-cubic" | "regression-quartic" | "regression-spline" | "regression-exponential" | "regression-logistic";
export type MobileGraphAnalysisDraft = { kind: MobileGraphAnalysisKind; objectId: string; secondId: string;
  x: string; min: string; max: string; tolerance: string; smoothing?: string;
  amplitude?: string; rate?: string; capacity?: string; midpoint?: string; mode: "signed" | "absolute" };
export type MobileGraphAnalysisRow = { label: string; detail: string; probe?: Graph2DProbe;
  candidate?: Graph2DCriticalPoint | Graph2DIntersectionCandidate };
export type MobileGraphAnalysis = { kind: MobileGraphAnalysisKind; inputHash: string; publications: readonly AnalysisResultEnvelope[];
  rows: readonly MobileGraphAnalysisRow[]; overlays: readonly Graph2DLineOverlay[]; areaSegments?: readonly Graph2DAreaFillSegment[];
  candidateAnalysis?: Graph2DCriticalPointAnalysis | Graph2DIntersectionAnalysis;
  publicationTables?: readonly Graph2DPublicationTable[]; publicationNotes?: readonly string[] };
export type MobileGraphRegressionAnalysis = MobileGraphAnalysis & { regression?: Graph2DRegression };
export const mobileGraphAnalysisDraft = (document: Graph2DDocument): MobileGraphAnalysisDraft => {
  const selected = document.source.objects.find(object => object.id === document.selection.objectId);
  const parametricDefault = selected?.kind === "parametric" ?
    selected.domain.includeMin ? selected.domain.min : (selected.domain.min + selected.domain.max) / 2 : 0;
  return { kind: selected?.kind === "polar" ? "polar-area" : selected?.kind === "parametric" ? "parametric-tangent" : "derivatives",
    objectId: selected?.id ?? document.source.objects.find(object => object.kind === "explicit-cartesian")?.id ?? "",
    secondId: "", x: String(selected?.kind === "parametric" ? document.selection.probe?.parameter ?? parametricDefault : document.selection.probe?.x ?? 0),
    min: String(selected?.kind === "polar" ? selected.domain.min : -1),
    max: String(selected?.kind === "polar" ? selected.domain.max : 1), tolerance: "0.00001", smoothing: "0.001",
    amplitude: "1", rate: "1", capacity: "1", midpoint: "0", mode: "signed" };
};
const number = (text: string) => {
  if (!text.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text)))
    throw new TypeError("Enter finite numeric inputs.");
  return Number(text);
};
export const mobileGraphSplineSmoothness = (draft: MobileGraphAnalysisDraft) => number(draft.smoothing ?? "0.001");
export const mobileGraphExponentialInitial = (draft: MobileGraphAnalysisDraft) => ({
  amplitude: number(draft.amplitude ?? "1"), rate: number(draft.rate ?? "1") });
export const mobileGraphLogisticInitial = (draft: MobileGraphAnalysisDraft) => ({
  capacity: number(draft.capacity ?? "1"), rate: number(draft.rate ?? "1"), midpoint: number(draft.midpoint ?? "0") });
const format = (value: number | null) => value === null ? "unavailable" : value.toPrecision(8);
export const mobileGraphAnalysisInputHash = (draft: MobileGraphAnalysisDraft) => structuralHash(draft);

/** A finished shared-core fit is published only after its input hash is still current. */
export const mobileGraphRegressionResult = (draft: MobileGraphAnalysisDraft, fit: Graph2DRegression): MobileGraphRegressionAnalysis => {
  const projection = publicationProjection([{ publication: fit.publication, summary: fit.publication.summary } as { publication: AnalysisResultEnvelope }]);
  return { kind: draft.kind, inputHash: mobileGraphAnalysisInputHash(draft), regression: fit, overlays: [],
    ...projection, publications: [fit.publication],
    publicationTables: [...projection.publicationTables, graph2DRegressionResidualTable(fit), graph2DRegressionCurveTable(fit)],
    publicationNotes: fit.n > 2048 ? [`Regression residual table includes first 2048 of ${fit.n} original rows.`] : [],
    rows: [{ label: `${fit.model} regression · n=${fit.n} · excluded=${fit.excluded}`, detail: `${fit.model === "spline" ? "descriptive RMSE" : `df=${fit.degreesOfFreedom} · residual SD`}=${format(fit.residualSD)} · R²=${format(fit.rSquared)}` },
      ...(fit.model === "spline" ? [
        { label: "Cubic smoothing spline", detail: `${fit.spline.controlPoints} control points · λ=${fit.spline.lambda} · no extrapolation` },
        { label: "Uncertainty", detail: "No confidence or prediction intervals are provided for this regularized model." },
      ] : fit.model === "exponential-decay" ? [
        { label: "Exponential decay", detail: `y=${format(fit.parameters.amplitude)}*exp(-${format(fit.parameters.rate)}*(x-${format(fit.parameters.anchor)}))` },
        { label: "Solver", detail: `${fit.solver.status} in ${fit.solver.iterations} iterations; ${fit.solver.rejectedSteps} rejected. Local result, no global or uniqueness guarantee.` },
        { label: "Uncertainty", detail: "No parameter uncertainty or confidence/prediction intervals are reported." },
      ] : fit.model === "logistic-growth" ? [
        { label: "Logistic growth", detail: `y=${format(fit.parameters.capacity)}/(1+exp(-${format(fit.parameters.rate)}*(x-${format(fit.parameters.midpoint)})))` },
        { label: "Solver", detail: `${fit.solver.status} in ${fit.solver.iterations} iterations; ${fit.solver.rejectedSteps} rejected. Local result, no global or uniqueness guarantee.` },
        { label: "Uncertainty", detail: "No parameter uncertainty or confidence/prediction intervals are reported." },
      ] : [
        { label: "Centered/scaled equation", detail: `z=(x-${fit.center})/${fit.scale}; y=${fit.coefficients.map((c, i) => `${format(c)}${i ? `*z^${i}` : ""}`).join(" + ")}` },
        { label: "95% pointwise limits", detail: "Brown fit; purple dashed mean response; purple dotted new observation. Not simultaneous; no extrapolation. Log axes omit non-positive parts." },
      ]),
      { label: "Residuals", detail: `${fit.residuals.length} original rows; observed minus fitted. Report/CSV includes first 2,048 rows and all 129 fitted samples${fit.model === "spline" || fit.model === "exponential-decay" || fit.model === "logistic-growth" ? "." : " with intervals."} Results are transient; fit again after reopening.` }] };
};

/** One requested bounded shared-core operation, never automatic all-function work. */
export const runMobileGraphAnalysis = (document: Graph2DDocument, draft: MobileGraphAnalysisDraft, regressionRows: readonly Graph2DPointRow[] | null = null): MobileGraphRegressionAnalysis => {
  const object = document.source.objects.find((object) => object.id === draft.objectId);
  const result: MobileGraphAnalysis = { kind: draft.kind, inputHash: mobileGraphAnalysisInputHash(draft), publications: [], rows: [], overlays: [] };
  if (draft.kind === "regression-linear" || draft.kind === "regression-quadratic" || draft.kind === "regression-cubic" || draft.kind === "regression-quartic" || draft.kind === "regression-spline" || draft.kind === "regression-exponential" || draft.kind === "regression-logistic") {
    const fit = analyzeGraph2DRegression({ document, objectId: draft.objectId, rows: regressionRows,
      model: draft.kind === "regression-linear" ? "linear" : draft.kind === "regression-quadratic" ? "quadratic" :
        draft.kind === "regression-cubic" ? "cubic" : draft.kind === "regression-quartic" ? "quartic" :
          draft.kind === "regression-exponential" ? "exponential-decay" : draft.kind === "regression-logistic" ? "logistic-growth" : "spline",
      smoothing: draft.kind === "regression-spline" ? mobileGraphSplineSmoothness(draft) : undefined,
      initial: draft.kind === "regression-exponential" ? mobileGraphExponentialInitial(draft) :
        draft.kind === "regression-logistic" ? mobileGraphLogisticInitial(draft) : undefined });
    return mobileGraphRegressionResult(draft, fit);
  }
  if (draft.kind === "polar-area" || draft.kind === "polar-arc-length") {
    if (!object || object.kind !== "polar") throw new TypeError("Choose a polar curve to measure.");
    const tolerance = number(draft.tolerance);
    const interval = { min: number(draft.min), max: number(draft.max) };
    const analysis = analyzeGraph2DPolarMeasurement({ document, objectId: object.id,
      kind: draft.kind === "polar-area" ? "swept-area" : "arc-length", interval, tolerance });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication],
      rows: [{ label: `${analysis.kind === "swept-area" ? "Polar swept area" : "Polar arc length"}: ${format(analysis.value)}`,
        detail: `${analysis.status} · angular interval [${interval.min}, ${interval.max}] radians · ${analysis.method} · tolerance ${analysis.tolerance} · estimated error ${format(analysis.errorEstimate)} · ${analysis.evaluations} evaluations · unresolved cells ${analysis.unresolvedCells} · partial value ${format(analysis.partialValue)}${analysis.kind === "swept-area" ? " · counts repeated traversal" : ""}` }] };
  }
  if (draft.kind === "polar-tangent") {
    if (!object || object.kind !== "polar") throw new TypeError("Choose a polar curve to analyze.");
    const theta = number(draft.x);
    const variables = Object.fromEntries(document.source.variables.map(variable => [variable.name, variable.value]));
    const point = evaluateGraph2DPolar(object, variables, theta);
    if (!point) throw new TypeError("Angle is outside the polar source domain or the radius is undefined.");
    const probe = { objectId: object.id, x: point.x, y: point.y, parameter: theta };
    const differential = analyzeGraph2DPolarLocalDifferential({ ...document, selection: { objectId: object.id, probe } });
    if (!differential) throw new TypeError("Polar local differential is unavailable.");
    return { ...result, ...publicationProjection([differential]), publications: [differential.publication], overlays: differential.overlays,
      rows: [{ label: `Polar tangent: ${differential.tangent ?? "unavailable"}`,
        detail: `${differential.state} · θ=${format(theta)} radians · ${differential.tangentMethod}`, probe },
        { label: `Polar normal: ${differential.normal ?? "unavailable"}`, detail: "Perpendicular to the tangent for increasing θ" },
        { label: `Signed curvature: ${format(differential.curvature)}`,
          detail: differential.curvature === null ? "Needs a regular tangent and finite second radius derivative." :
            `${differential.curvatureMethod} · (r² + 2r′² − rr″)/(r² + r′²)^(3/2) · positive turns counterclockwise · no certified error bound` }] };
  }
  if (draft.kind === "parametric-tangent") {
    if (!object || object.kind !== "parametric") throw new TypeError("Choose a parametric curve to analyze.");
    const parameter = number(draft.x);
    const variables = Object.fromEntries(document.source.variables.map(variable => [variable.name, variable.value]));
    const point = evaluateGraph2DParametric(object, variables, parameter);
    if (!point) throw new TypeError("Parameter is outside the source domain or a coordinate is undefined.");
    const probe = { objectId: object.id, x: point.x, y: point.y, parameter };
    const differential = analyzeGraph2DParametricLocalDifferential({ ...document, selection: { objectId: object.id, probe } });
    if (!differential) throw new TypeError("Parametric local differential is unavailable.");
    return { ...result, ...publicationProjection([differential]), publications: [differential.publication], overlays: differential.overlays,
      rows: [{ label: `Parametric tangent: ${differential.tangent ?? "unavailable"}`,
        detail: `${differential.state} · t=${format(parameter)} · ${differential.tangentMethod}`, probe },
        { label: `Parametric normal: ${differential.normal ?? "unavailable"}`, detail: "Perpendicular to the tangent for increasing t" },
        { label: `Signed curvature: ${format(differential.curvature)}`,
          detail: differential.curvature === null ? "Needs a regular tangent and finite second coordinate derivatives." :
            `${differential.curvatureMethod} · (x′y″ − y′x″)/(x′² + y′²)^(3/2) · positive turns counterclockwise · no certified error bound` }] };
  }
  if (!object || object.kind !== "explicit-cartesian") throw new TypeError("Choose an explicit function to analyze.");
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
        { label: `Normal: ${differential.normal?.equation ?? "unavailable"}`, detail: "Perpendicular to a resolved tangent" },
        { label: `Signed curvature: ${format(differential.curvature)}`,
          detail: differential.curvature === null ? "Needs a finite first and second derivative at this point." :
            `${differential.curvatureMethod} · f''(x)/(1+f'(x)²)^(3/2) · positive bends upward as x increases · no certified error bound` }] };
  }
  const interval = { min: number(draft.min), max: number(draft.max) };
  if (interval.min >= interval.max || interval.max - interval.min > 1e6) throw new TypeError("Choose an increasing interval no wider than 1,000,000.");
  if (draft.kind === "features") {
    const analysis = analyzeGraph2DCriticalPoints({ document, objectId: object.id, interval });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], candidateAnalysis: analysis, rows: [{ label: `Feature scan: ${analysis.status}`, detail:
      `${analysis.evaluations} evaluations · ${analysis.candidates.length} candidates · narrow features may be missed; no proof of absence` },
      ...analysis.candidates.map((candidate) => ({ label: `${candidate.kind}: (${format(candidate.x)}, ${format(candidate.y)})`,
        detail: `${candidate.confidence} · ${candidate.method} · residual ${candidate.residual} · multiplicity ${candidate.multiplicity}`,
        probe: { objectId: object.id, x: candidate.x, y: candidate.y }, candidate }))] };
  }
  if (draft.kind === "intersections") {
    const analysis = analyzeGraph2DIntersections({ document, firstObjectId: object.id, secondObjectId: draft.secondId, interval });
    return { ...result, ...publicationProjection([analysis]), publications: [analysis.publication], candidateAnalysis: analysis, rows: [{ label: `Intersections: ${analysis.status}`, detail:
      `${analysis.evaluations} evaluations · invalid cells ${analysis.invalidCells} · unresolved brackets ${analysis.unresolvedBrackets} · coincident cells ${analysis.coincidentCells} · pair-only scan, not a proof` },
      ...analysis.candidates.map((candidate) => ({ label: `Intersection: (${format(candidate.x)}, ${format(candidate.y)})`,
        detail: `${candidate.confidence} · ${candidate.classification} · ${candidate.method} · residual ${candidate.residual}`,
        probe: { objectId: candidate.firstObjectId, x: candidate.x, y: candidate.y }, candidate }))] };
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
  if (object?.kind === "polar" && probe.parameter !== undefined) {
    const point = evaluateGraph2DPolar(object, Object.fromEntries(document.source.variables.map(entry => [entry.name, entry.value])), probe.parameter);
    if (!point) throw new TypeError("Result angle is outside the source domain or undefined.");
    return { objectId: object.id, x: point.x, y: point.y, parameter: probe.parameter };
  }
  if (object?.kind === "parametric" && probe.parameter !== undefined) {
    const point = evaluateGraph2DParametric(object, Object.fromEntries(document.source.variables.map(entry => [entry.name, entry.value])), probe.parameter);
    if (!point) throw new TypeError("Result parameter is outside the source domain or undefined.");
    return { objectId: object.id, x: point.x, y: point.y, parameter: probe.parameter };
  }
  if (!object || object.kind !== "explicit-cartesian" || probe.x < object.domain.min || probe.x > object.domain.max ||
    probe.x === object.domain.min && !object.domain.includeMin || probe.x === object.domain.max && !object.domain.includeMax)
    throw new TypeError("Result point is outside the source domain.");
  const evaluated = evaluateGraph2DExpression(object.expression.ast, { x: probe.x,
    ...Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value])) });
  if (!evaluated.ok) throw new TypeError("Result point is undefined.");
  return { ...probe, y: evaluated.value };
};
