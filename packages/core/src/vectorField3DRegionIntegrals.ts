import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, createStableDocumentId, structuralHash, type CanonicalJsonValue } from "./documentIdentity";
import { createDocumentRelation } from "./documentRelations";
import { evaluateGraph2DExpression } from "./mathExpressionRealAst";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { normalizeScientificSelection, type ScientificSelection } from "./scientificSelection";
import { type VectorField3DDocument } from "./vectorField3DDocument";
import { createOrientedPolylineSelection, analyzeVectorField3DLineIntegral } from "./vectorField3DLineIntegral";
import { viewerSourceFromDocument } from "./viewerProvenance";

type Vec3 = readonly [number, number, number];
type Pair = readonly [number, number];
export type RegionGeometry = Extract<ScientificSelection["geometry"], { kind: "oriented-plane-region" | "oriented-box-region" }>;
export type RegionMeasure = "surface-flux" | "volume-divergence" | "volume-magnitude" | "curl-flux";
export type RegionAnalysis = Readonly<{ state: "complete" | "partial" | "unavailable";
  reason: "source-unavailable" | "incompatible-units" | "out-of-domain" | "undefined-field" | "evaluation-cap" | null;
  measure: RegionMeasure; value: number | null; partialValue: number | null;
  unit: string | null; coverage: number; completedSamples: number; totalSamples: number;
  evaluations: number; resolution: number; method: "midpoint-grid-central-difference";
  maxEvaluations: number; orientation: string }>;
export const REGION_MAX_EVALUATIONS = 32768;

export function createOrientedRegionSelection(document: VectorField3DDocument,
  geometry: RegionGeometry, stableKey: string): ScientificSelection {
  const candidate = { format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "authored", id: createStableDocumentId("scientific-selection",
      { sourceId: document.identity.id, stableKey }) }, role: "analysis",
    source: { kind: "document", documentId: document.identity.id,
      checkpoint: { revision: document.identity.revision,
        structuralHash: document.identity.structuralHash } },
    frame: { kind: "cartesian", axes: document.source.axes.map(axis =>
      ({ name: axis.label, unit: axis.unit })) }, geometry };
  const checked = normalizeScientificSelection(candidate);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
}

const pointIn = (point: Vec3, bounds: readonly Pair[]) =>
  point.every((v, i) => v >= bounds[i]![0] && v <= bounds[i]![1]);

/** Midpoint cells either contribute a complete sample or no claimed value. */
export function analyzeVectorField3DRegion(document: VectorField3DDocument,
  selection: ScientificSelection, measure: RegionMeasure, resolution = 8,
  maxEvaluations = REGION_MAX_EVALUATIONS): RegionAnalysis {
  if (selection.identity.kind !== "authored" ||
      (selection.geometry.kind !== "oriented-plane-region" && selection.geometry.kind !== "oriented-box-region") ||
      selection.source?.kind !== "document" || selection.source.documentId !== document.identity.id)
    throw new TypeError("Choose a saved oriented region for this vector source.");
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 24 ||
      !Number.isInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > REGION_MAX_EVALUATIONS)
    throw new RangeError("Region resolution or evaluation cap is out of range.");
  const geometry = selection.geometry;
  if ((measure === "curl-flux" || measure === "surface-flux") && geometry.kind !== "oriented-plane-region" &&
      measure === "curl-flux" ||
      (measure === "volume-divergence" || measure === "volume-magnitude") && geometry.kind !== "oriented-box-region")
    throw new TypeError("The measure requires its corresponding plane or box geometry.");
  const surface = measure === "surface-flux" || measure === "curl-flux";
  const totalSamples = resolution ** (surface ? 2 : 3);
  // A box surface is a separate surface-flux case with six faces.
  const count = measure === "surface-flux" && geometry.kind === "oriented-box-region" ?
    6 * resolution * resolution : totalSamples;
  const orientation = geometry.kind === "oriented-box-region" ? geometry.normal :
    `${geometry.normalSign > 0 ? "+" : "-"}${"xyz"[geometry.normalAxis]}; right-hand boundary`;
  const base = { measure, resolution, maxEvaluations, totalSamples: count,
    method: "midpoint-grid-central-difference" as const,
    orientation };
  const unavailable = (reason: RegionAnalysis["reason"]): RegionAnalysis =>
    ({ ...base, state: "unavailable", reason, value: null, partialValue: null,
      unit: null, coverage: 0, completedSamples: 0, evaluations: 0 });
  const field = document.source.field;
  if (field.kind !== "expressions") return unavailable("source-unavailable");
  const axes = document.source.axes;
  if (axes.some(axis => axis.unit !== axes[0].unit) ||
      field.components.some(component => component.unit !== field.components[0].unit))
    return unavailable("incompatible-units");
  const lengthUnit = axes[0].unit, fieldUnit = field.components[0].unit;
  const unit = measure === "curl-flux" ? `${fieldUnit}·${lengthUnit}` :
    surface || measure === "volume-divergence" ? `${fieldUnit}·${lengthUnit}²` :
      `${fieldUnit}·${lengthUnit}³`;
  let evaluations = 0, completedSamples = 0, sum = 0;
  let reason: RegionAnalysis["reason"] = null;
  const evaluate = (point: Vec3): Vec3 | null => {
    if (!pointIn(point, axes.map(axis => [axis.min, axis.max] as Pair))) {
      reason ??= "out-of-domain"; return null;
    }
    if (evaluations >= maxEvaluations) { reason ??= "evaluation-cap"; return null; }
    evaluations++;
    const variables = { x: point[0], y: point[1], z: point[2] };
    const values = field.components.map(component => evaluateGraph2DExpression(
      component.ast, variables, { maxEvaluations: 256 }));
    if (values.some(item => !item.ok || !Number.isFinite(item.value))) {
      reason ??= "undefined-field"; return null;
    }
    return values.map(item => item.ok ? item.value : NaN) as unknown as Vec3;
  };
  const derivative = (point: Vec3, component: number, axis: number): number | null => {
    const domain = axes[axis]!;
    const h = Math.min((domain.max - domain.min) * 1e-4,
      point[axis] - domain.min, domain.max - point[axis]);
    if (!(h > 0)) { reason ??= "out-of-domain"; return null; }
    const plus = point.map((v, i) => i === axis ? v + h : v) as unknown as Vec3;
    const minus = point.map((v, i) => i === axis ? v - h : v) as unknown as Vec3;
    const a = evaluate(plus), b = evaluate(minus);
    return a && b ? (a[component]! - b[component]!) / (2 * h) : null;
  };
  const integratePlane = (normalAxis: number, coordinate: number, bounds: readonly [Pair, Pair],
    sign: number, derivativeFlux: boolean) => {
    const tangent = [0, 1, 2].filter(axis => axis !== normalAxis);
    const cellArea = (bounds[0][1] - bounds[0][0]) * (bounds[1][1] - bounds[1][0]) /
      (resolution * resolution);
    for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution; j++) {
      const point = [0, 0, 0] as number[];
      point[normalAxis] = coordinate;
      point[tangent[0]!] = bounds[0][0] + (i + .5) * (bounds[0][1] - bounds[0][0]) / resolution;
      point[tangent[1]!] = bounds[1][0] + (j + .5) * (bounds[1][1] - bounds[1][0]) / resolution;
      const p = point as unknown as Vec3;
      let value: number | null;
      if (derivativeFlux) {
        const a = tangent[0]!, b = tangent[1]!;
        const da = derivative(p, b, a), db = derivative(p, a, b);
        const parity = normalAxis === 1 ? -1 : 1;
        value = da === null || db === null ? null : parity * (da - db);
      } else value = evaluate(p)?.[normalAxis] ?? null;
      if (value !== null) { sum += sign * value * cellArea; completedSamples++; }
    }
  };
  if (geometry.kind === "oriented-plane-region") {
    integratePlane(geometry.normalAxis, geometry.coordinate, geometry.bounds,
      geometry.normalSign, measure === "curl-flux");
  } else if (measure === "surface-flux") {
    for (let axis = 0; axis < 3; axis++) {
      const tangent = [0, 1, 2].filter(i => i !== axis);
      const faceBounds = [geometry.bounds[tangent[0]!]!, geometry.bounds[tangent[1]!]!] as [Pair, Pair];
      const orientationSign = geometry.normal === "outward" ? 1 : -1;
      integratePlane(axis, geometry.bounds[axis]![0], faceBounds, -orientationSign, false);
      integratePlane(axis, geometry.bounds[axis]![1], faceBounds, orientationSign, false);
    }
  } else {
    const cellVolume = geometry.bounds.reduce((v, b) => v * (b[1] - b[0]), 1) /
      resolution ** 3;
    for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution; j++)
      for (let k = 0; k < resolution; k++) {
        const index = [i, j, k];
        const point = geometry.bounds.map((b, axis) => b[0] +
          (index[axis]! + .5) * (b[1] - b[0]) / resolution) as unknown as Vec3;
        let value: number | null;
        if (measure === "volume-magnitude") {
          const vector = evaluate(point);
          value = vector ? Math.hypot(...vector) : null;
        } else {
          const terms = [0, 1, 2].map(axis => derivative(point, axis, axis));
          value = terms.every(term => term !== null) ? terms.reduce((a, b) => a! + b!, 0)! : null;
          if (value !== null && geometry.normal === "inward") value = -value;
        }
        if (value !== null) { sum += value * cellVolume; completedSamples++; }
      }
  }
  const state = completedSamples === count ? "complete" : completedSamples ? "partial" : "unavailable";
  return { ...base, state, reason: state === "complete" ? null : reason,
    value: state === "complete" ? sum : null,
    partialValue: state === "partial" ? sum : null, unit,
    coverage: completedSamples / count, completedSamples, evaluations };
}

export type TheoremCheck = Readonly<{ state: "consistent" | "inconclusive" | "mismatch";
  theorem: "divergence" | "stokes"; boundaryValue: number | null;
  interiorValue: number | null; absoluteResidual: number | null;
  relativeResidual: number | null; coarseResidual: number | null;
  resolution: number; orientation: string; unit: string | null;
  reason: string | null; method: string }>;

/** The bounds and right-hand boundary are taken from the same saved geometry. */
export function analyzeVectorField3DTheorem(document: VectorField3DDocument,
  selection: ScientificSelection, theorem: "divergence" | "stokes", resolution = 8): TheoremCheck {
  const geometry = selection.geometry;
  if (theorem === "divergence" && geometry.kind !== "oriented-box-region" ||
      theorem === "stokes" && geometry.kind !== "oriented-plane-region")
    throw new TypeError("Divergence needs a closed box; Stokes needs an oriented plane.");
  const boundary = analyzeVectorField3DRegion(document, selection,
    theorem === "divergence" ? "surface-flux" : "curl-flux", resolution);
  let interior: RegionAnalysis | null = null;
  let circulation: number | null = null;
  let circulationUnit: string | null = null;
  if (geometry.kind === "oriented-box-region")
    interior = analyzeVectorField3DRegion(document, selection, "volume-divergence", resolution);
  else if (geometry.kind === "oriented-plane-region") {
    const t = [0, 1, 2].filter(axis => axis !== geometry.normalAxis);
    const [a, b] = geometry.bounds;
    const vertices = [[a[0], b[0]], [a[1], b[0]], [a[1], b[1]], [a[0], b[1]]]
      .map(([x, y]) => { const p = [0, 0, 0]; p[geometry.normalAxis] = geometry.coordinate;
        p[t[0]!] = x!; p[t[1]!] = y!; return p as unknown as Vec3; });
    const positive = geometry.normalAxis === 1 ? -1 : 1;
    const path = createOrientedPolylineSelection(document, vertices, true,
      geometry.normalSign === positive ? "forward" : "reverse", `stokes:${selection.identity.kind === "authored" ? selection.identity.id : "legacy"}`);
    const integral = analyzeVectorField3DLineIntegral(document, path, "circulation");
    circulation = integral.value; circulationUnit = integral.unit;
  }
  const left = theorem === "stokes" ? circulation : boundary.value;
  const right = theorem === "stokes" ? boundary.value : interior!.value;
  const residual = left !== null && right !== null ? Math.abs(left - right) : null;
  const relative = residual === null ? null : residual / Math.max(Math.abs(left!), Math.abs(right!), 1e-12);
  const coarse = resolution >= 4 ? analyzeVectorField3DRegion(document, selection,
    theorem === "divergence" ? "surface-flux" : "curl-flux", Math.max(2, Math.floor(resolution / 2))) : null;
  const coarseResidual = coarse?.value !== null && coarse?.value !== undefined &&
    right !== null ? Math.abs(coarse.value - right) : null;
  const supported = left !== null && right !== null &&
    (interior === null || interior.coverage === 1) && boundary.coverage === 1 &&
    (interior === null || interior.unit === boundary.unit) &&
    (interior !== null || circulationUnit === boundary.unit);
  const threshold = 1e-3 * Math.max(1, Math.abs(left ?? 0), Math.abs(right ?? 0));
  const converges = coarseResidual === null || residual === null ||
    residual <= coarseResidual + threshold;
  return { state: !supported || !converges ? "inconclusive" : residual! <= threshold ?
    "consistent" : "mismatch", theorem, boundaryValue: left, interiorValue: right,
    absoluteResidual: residual, relativeResidual: relative, coarseResidual,
    resolution, orientation: boundary.orientation, unit: boundary.unit,
    reason: !supported ? "incomplete-coverage-or-units" : !converges ?
      "nonconvergent-resolution" : null,
    method: theorem === "divergence" ? "midpoint-face-flux-vs-central-divergence" :
      "midpoint-curl-flux-vs-simpson-circulation" };
}

export function createVectorField3DRegionIntegralResult(document: VectorField3DDocument,
  selection: ScientificSelection, analysis: RegionAnalysis | TheoremCheck): AnalysisResultEnvelope {
  if (selection.identity.kind !== "authored" || selection.source?.kind !== "document" ||
      selection.source.documentId !== document.identity.id ||
      selection.source.checkpoint?.revision !== document.identity.revision ||
      selection.source.checkpoint.structuralHash !== document.identity.structuralHash)
    throw new TypeError("Region source generation must match the current vector source.");
  const isTheorem = "theorem" in analysis;
  const fresh = isTheorem ? analyzeVectorField3DTheorem(document, selection,
    analysis.theorem, analysis.resolution) : analyzeVectorField3DRegion(document, selection,
      analysis.measure, analysis.resolution, analysis.maxEvaluations);
  if (canonicalJsonStringify(fresh) !== canonicalJsonStringify(analysis))
    throw new TypeError("Region analysis no longer matches the saved source and geometry.");
  const summary = analysis as unknown as Readonly<Record<string, CanonicalJsonValue>>;
  const type = isTheorem ? "vector3d.theorem-check" : "vector3d.region-integral";
  const parameters: Record<string, CanonicalJsonValue> = {
    selectionId: selection.identity.id, selectionHash: structuralHash(selection),
    resolution: analysis.resolution, measure: isTheorem ? analysis.theorem : analysis.measure,
    maxEvaluations: isTheorem ? REGION_MAX_EVALUATIONS : analysis.maxEvaluations,
    summaryHash: structuralHash(summary) };
  const source = viewerSourceFromDocument(document);
  return createAnalysisResultEnvelope({ resultId: `${type}:${structuralHash({ source, parameters }).slice(7)}`,
    status: isTheorem ? analysis.state !== "inconclusive" ? "numerical" : "unsupported" :
      analysis.state === "complete" ? "numerical" : "unsupported",
    provenance: { source, operation: { type, algorithm: analysis.method,
      algorithmVersion: "1", parameters }, numericContext: { precision: { binaryBits: 53 } },
      engine: { name: "Math3D region integrals", version: "1" }, elapsedMs: 0 },
    summary, warnings: isTheorem ? analysis.state === "consistent" ? [] :
      [`Theorem check ${analysis.state}: ${analysis.reason ?? "residual exceeded tolerance"}.`] :
      analysis.state === "complete" ? [] : [`Region integral ${analysis.state}: ${analysis.reason}.`],
    diagnostics: [], artifacts: [] });
}

export function upsertProjectRegionResult(project: Math3DProject,
  result: AnalysisResultEnvelope): Math3DProject {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const parameters = result.provenance.operation.parameters;
  const selection = current.workspace.scientificSelections?.find(item =>
    item.identity.kind === "authored" && item.identity.id === parameters.selectionId);
  const document = current.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === result.provenance.source.documentId)?.checkpoint;
  if (!selection || document?.format !== "math3d.vector-field3d-document")
    throw new TypeError("Save the source and oriented region in this Project first.");
  const measure = parameters.measure;
  const resolution = parameters.resolution;
  if (typeof measure !== "string" || !Number.isInteger(resolution))
    throw new TypeError("Invalid region result recipe.");
  const analysis = measure === "divergence" || measure === "stokes" ?
    analyzeVectorField3DTheorem(document, selection, measure, resolution as number) :
    analyzeVectorField3DRegion(document, selection, measure as RegionMeasure,
      resolution as number, parameters.maxEvaluations as number);
  const expected = createVectorField3DRegionIntegralResult(document, selection, analysis);
  if (expected.resultId !== result.resultId || expected.status !== result.status ||
      canonicalJsonStringify(expected.summary) !== canonicalJsonStringify(result.summary) ||
      canonicalJsonStringify(expected.provenance.operation) !==
        canonicalJsonStringify(result.provenance.operation))
    throw new TypeError("Region result does not match the saved Project source and geometry.");
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source],
    sourceOrder: "ordered", target: { type: "result", resultId: result.resultId,
      resultType: result.provenance.operation.type }, operation: result.provenance.operation.type,
    parameters });
  return replaceMath3DProjectWorkspace(current, createMixedWorkspaceDocument({ ...current.workspace,
    results: [...current.workspace.results.filter(item => item.resultId !== result.resultId), result],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] }));
}

export function projectRegionResultStatus(project: Math3DProject,
  result: AnalysisResultEnvelope, liveDocument?: VectorField3DDocument): Readonly<{
    status: "current" | "withheld"; reason: string | null; value: number | null }> {
  if (!["vector3d.region-integral", "vector3d.theorem-check"].includes(result.provenance.operation.type))
    return { status: "withheld", reason: "wrong-result-type", value: null };
  const source = project.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === result.provenance.source.documentId)?.checkpoint;
  if (source?.format !== "math3d.vector-field3d-document")
    return { status: "withheld", reason: "source-missing", value: null };
  if ([source, liveDocument].some(doc => doc && (doc.identity.id !== result.provenance.source.documentId ||
      doc.identity.revision !== result.provenance.source.revision ||
      doc.identity.structuralHash !== result.provenance.source.structuralHash)))
    return { status: "withheld", reason: "source-changed", value: null };
  const selection = project.workspace.scientificSelections?.find(item => item.identity.kind === "authored" &&
    item.identity.id === result.provenance.operation.parameters.selectionId);
  if (!selection) return { status: "withheld", reason: "selection-missing", value: null };
  if (structuralHash(selection) !== result.provenance.operation.parameters.selectionHash)
    return { status: "withheld", reason: "selection-changed", value: null };
  if (structuralHash(result.summary) !== result.provenance.operation.parameters.summaryHash)
    return { status: "withheld", reason: "result-changed", value: null };
  const complete = result.provenance.operation.type === "vector3d.theorem-check" ?
    result.summary.state === "consistent" || result.summary.state === "mismatch" :
    result.summary.state === "complete";
  return complete ? { status: "current", reason: null,
    value: result.provenance.operation.type === "vector3d.theorem-check" ?
      result.summary.absoluteResidual as number : result.summary.value as number } :
    { status: "withheld", reason: String(result.summary.reason ?? result.summary.state), value: null };
}
