import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DExplicitObject } from "./graph2dDocument";
import { analyzeGraph2DDerivative, differentiateGraph2DExpression } from "./graph2dDerivatives";
import { evaluateGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";
import { graph2DExpressionPossibleDomainBoundary } from "./graph2dInterval";
import { graph2DQualityForNumericalCandidate, graph2DQualityForScan,
  type Graph2DNumericalCandidateQuality } from "./graph2dAnalysisQuality";
import type { ScientificSourceGeneration } from "./scientificJobs";
import { compactGraph2DUnresolvedIntervals, type Graph2DUnresolvedInterval } from "./graph2dUnresolvedCoverage";

export const GRAPH2D_CRITICAL_POINT_ALGORITHM_VERSION = "5" as const;
export const GRAPH2D_CRITICAL_POINT_GRID_INTERVALS = 256;
export const GRAPH2D_CRITICAL_POINT_MAX_CANDIDATES = 256;
export const GRAPH2D_CRITICAL_POINT_MAX_EVALUATIONS = 12000;
export const GRAPH2D_CRITICAL_POINT_MAX_SCAN_CELLS = 2048;
const MAX_REFINEMENT_DEPTH = 3;
export type Graph2DCriticalPointKind = "zero" | "minimum" | "maximum" | "inflection";
export type Graph2DCriticalPoint = Readonly<{
  candidateId: string;
  objectId: string;
  kind: Graph2DCriticalPointKind;
  x: number;
  y: number;
  residual: number;
  /** Local |dx/dg| for g=f, f′, or f″; null when the local slope is unresolved. */
  localSensitivity: number | null;
  /** Residual times local sensitivity, a linear estimate rather than a certified bound. */
  estimatedXError: number | null;
  method: "sample" | "bracket-bisection" | "minimum-absolute-residual";
  confidence: "numerical" | "heuristic";
  quality: Graph2DNumericalCandidateQuality;
  multiplicity: "unknown" | "even-possible";
  source: ScientificSourceGeneration;
}>;
export type Graph2DCriticalPointAnalysis = Readonly<{
  objectId: string;
  interval: Readonly<{ min: number; max: number }>;
  status: "complete" | "incomplete" | "unavailable";
  quality: "approximate" | "incomplete" | null;
  candidates: readonly Graph2DCriticalPoint[];
  evaluations: number;
  diagnostics: readonly Readonly<{ code: string; message: string; count: number }>[];
  unresolvedIntervals: readonly Graph2DUnresolvedInterval[];
  publication: AnalysisResultEnvelope;
}>;

const sourceGeneration = (document: Graph2DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const allowedX = (object: Graph2DExplicitObject, x: number): boolean =>
  x > object.domain.min && x < object.domain.max ||
  x === object.domain.min && object.domain.includeMin ||
  x === object.domain.max && object.domain.includeMax;
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);

/** Bounded visible-interval scan with residual-checked refinement and source-linked candidates. */
export const analyzeGraph2DCriticalPoints = (input: Readonly<{
  document: Graph2DDocument;
  objectId: string;
  interval?: Readonly<{ min: number; max: number }>;
  maxEvaluations?: number;
}>): Graph2DCriticalPointAnalysis => {
  const object = input.document.source.objects.find((entry) => entry.id === input.objectId);
  if (!object || object.kind !== "explicit-cartesian") throw new TypeError("Graph2D explicit function does not exist.");
  const requested = input.interval ?? { min: input.document.display.viewport.xMin, max: input.document.display.viewport.xMax };
  if (!Number.isFinite(requested.min) || !Number.isFinite(requested.max) || requested.min >= requested.max)
    throw new TypeError("Invalid Graph2D analysis interval.");
  const interval = { min: Math.max(requested.min, object.domain.min), max: Math.min(requested.max, object.domain.max) };
  const source = sourceGeneration(input.document);
  const started = Date.now();
  const diagnostics = new Map<string, { message: string; count: number }>();
  const note = (code: string, message: string) => {
    const existing = diagnostics.get(code);
    diagnostics.set(code, { message, count: (existing?.count ?? 0) + 1 });
  };
  const candidates: Graph2DCriticalPoint[] = [];
  const unresolvedRaw: Graph2DUnresolvedInterval[] = [];
  const unresolved = (min: number, max: number, reason: Graph2DUnresolvedInterval["reason"]) =>
    unresolvedRaw.push({ min, max, reason });
  const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
  const symbolicFirst = differentiateGraph2DExpression(object.expression.ast, 1);
  const symbolicSecond = differentiateGraph2DExpression(object.expression.ast, 2);
  const derivativeAst = [null, symbolicFirst.ok ? symbolicFirst.ast : null,
    symbolicSecond.ok ? symbolicSecond.ast : null] as const;
  const maxEvaluations = Math.min(GRAPH2D_CRITICAL_POINT_MAX_EVALUATIONS,
    Math.max(1, Math.floor(input.maxEvaluations ?? GRAPH2D_CRITICAL_POINT_MAX_EVALUATIONS)));
  let evaluations = 0;
  let incomplete = false;
  const evaluate = (ast: Graph2DExpressionAst, x: number): number | null => {
    if (evaluations >= maxEvaluations) {
      if (!incomplete) {
        note("evaluation-limit", "Evaluation budget reached; results are not exhaustive.");
        unresolved(interval.min, interval.max, "work-limit");
      }
      incomplete = true;
      return null;
    }
    evaluations += 1;
    const result = evaluateGraph2DExpression(ast, { ...variables, x });
    return result.ok ? result.value : null;
  };
  const rawValueAt = (order: 0 | 1 | 2, x: number): number | null => {
    if (!allowedX(object, x)) return null;
    if (order === 0) return evaluate(object.expression.ast, x);
    const ast = derivativeAst[order];
    if (ast) return evaluate(ast, x);
    const h = Math.pow(Number.EPSILON, 1 / (order + 2)) * Math.max(1, Math.abs(x));
    if (x - h <= object.domain.min || x + h >= object.domain.max) return null;
    const left = evaluate(object.expression.ast, x - h), center = evaluate(object.expression.ast, x),
      right = evaluate(object.expression.ast, x + h);
    if (!finite(left) || !finite(center) || !finite(right)) return null;
    const result = order === 1 ? (right - left) / (2 * h) : (right - 2 * center + left) / (h * h);
    return Number.isFinite(result) ? result : null;
  };
  const fieldCache = new Map<string, number | null>();
  const valueAt = (order: 0 | 1 | 2, x: number): number | null => {
    const key = `${order}:${x}`;
    if (fieldCache.has(key)) return fieldCache.get(key)!;
    const result = rawValueAt(order, x);
    fieldCache.set(key, result);
    return result;
  };
  const xTolerance = Math.max(1e-10, 16 * Number.EPSILON * Math.max(1, Math.abs(interval.min), Math.abs(interval.max)),
    Math.min(1e-5, (interval.max - interval.min) * 1e-9));
  const residualTolerance = 1e-7;
  const bracket = (order: 0 | 1 | 2, left: number, right: number, leftValue: number, rightValue: number) => {
    let a = left, b = right, fa = leftValue, fb = rightValue;
    for (let iteration = 0; iteration < 48 && b - a > xTolerance && !incomplete; iteration += 1) {
      const midpoint = (a + b) / 2;
      if (midpoint === a || midpoint === b) break;
      const fm = valueAt(order, midpoint);
      if (!finite(fm)) return null;
      if (fm === 0) return { x: midpoint, residual: 0 };
      if (Math.sign(fm) === Math.sign(fa)) { a = midpoint; fa = fm; }
      else { b = midpoint; fb = fm; }
    }
    const weight = Math.abs(fa) + Math.abs(fb);
    const interpolatedX = weight > 0 ? (a * Math.abs(fb) + b * Math.abs(fa)) / weight : (a + b) / 2;
    const interpolatedValue = valueAt(order, interpolatedX);
    if (!finite(interpolatedValue)) return null;
    const bestEndpoint = Math.abs(fa) <= Math.abs(fb) ? { x: a, residual: Math.abs(fa) } :
      { x: b, residual: Math.abs(fb) };
    const { x, residual } = Math.abs(interpolatedValue) < bestEndpoint.residual ?
      { x: interpolatedX, residual: Math.abs(interpolatedValue) } : bestEndpoint;
    const initialSlope = Math.abs((rightValue - leftValue) / (right - left));
    return residual <= Math.max(residualTolerance, initialSlope * xTolerance * 2) ? { x, residual } : null;
  };
  const add = (kind: Graph2DCriticalPointKind, x: number, residual: number,
    method: Graph2DCriticalPoint["method"], confidence: Graph2DCriticalPoint["confidence"],
    multiplicity: Graph2DCriticalPoint["multiplicity"] = "unknown") => {
    const y = valueAt(0, x);
    if (!finite(y)) { note("undefined-candidate", "A candidate was rejected because the source is undefined there."); return; }
    const previous = candidates.findIndex((entry) => entry.kind === kind && Math.abs(entry.x - x) <= Math.max(xTolerance * 8, 1e-7));
    const localSlope = kind === "zero" ? valueAt(1, x) : kind === "inflection" ? (() => {
      const h = 1e-4 * Math.max(1, Math.abs(x));
      const left = valueAt(2, x - h), right = valueAt(2, x + h);
      return finite(left) && finite(right) ? (right - left) / (2 * h) : null;
    })() : valueAt(2, x);
    const localSensitivity = finite(localSlope) && Math.abs(localSlope) > 1e-10 ? 1 / Math.abs(localSlope) : null;
    const candidate: Graph2DCriticalPoint = { candidateId: "graph2d.critical-point." + structuralHash({ source, objectId: object.id, kind, x }).slice(7),
      objectId: object.id, kind, x, y, residual, localSensitivity,
      estimatedXError: localSensitivity === null ? null : residual * localSensitivity,
      method, confidence, quality: graph2DQualityForNumericalCandidate({ method, confidence, residual },
        residualTolerance), multiplicity, source };
    if (previous >= 0) {
      if (candidate.residual < candidates[previous]!.residual ||
          candidate.confidence === "numerical" && candidates[previous]!.confidence === "heuristic") candidates[previous] = candidate;
      return;
    }
    if (candidates.length >= GRAPH2D_CRITICAL_POINT_MAX_CANDIDATES) {
      incomplete = true; note("candidate-limit", "Candidate limit reached; the interval is only partially analyzed."); return;
    }
    candidates.push(candidate);
  };
  let scanCells = 0;
  let refinementIncomplete = false;
  if (interval.min < interval.max) {
    const baseGrid = Array.from({ length: GRAPH2D_CRITICAL_POINT_GRID_INTERVALS + 1 }, (_, index) =>
      interval.min + (interval.max - interval.min) * index / GRAPH2D_CRITICAL_POINT_GRID_INTERVALS);
    const grid = [baseGrid[0]!];
    const orders = [0, 1, 2] as const;
    const suspicious = (a: number, midpoint: number, b: number): boolean => {
      if (!Number.isFinite(a) || !Number.isFinite(midpoint) || !Number.isFinite(b)) return true;
      if (a * b > 0 && (a * midpoint <= 0 || Math.abs(midpoint) < 0.15 * Math.min(Math.abs(a), Math.abs(b)))) return true;
      const scale = Math.max(1, Math.abs(a), Math.abs(midpoint), Math.abs(b));
      return Math.abs(midpoint - (a + b) / 2) > 0.12 * scale;
    };
    const refineCell = (left: number, right: number, depth: number): void => {
      if (incomplete) { grid.push(right); return; }
      const midpoint = (left + right) / 2;
      if (midpoint === left || midpoint === right) { grid.push(right); return; }
      const domainBoundary = graph2DExpressionPossibleDomainBoundary(object.expression.ast,
        [left, right], variables);
      const needsRefinement = domainBoundary || orders.some((order) => {
        const a = valueAt(order, left), m = valueAt(order, midpoint), b = valueAt(order, right);
        return a === null || m === null || b === null || suspicious(a, m, b);
      });
      if (!needsRefinement) { grid.push(right); return; }
      if (depth >= MAX_REFINEMENT_DEPTH || grid.length >= GRAPH2D_CRITICAL_POINT_MAX_SCAN_CELLS) {
        refinementIncomplete = true;
        note(domainBoundary ? "domain-boundary" : "refinement-limit", domainBoundary ?
          "A possible domain boundary remains between samples; nearby features may be missed." :
          "Adaptive refinement stopped before every suspicious cell was resolved.");
        unresolved(left, right, domainBoundary ? "undefined" : "refinement-limit");
        grid.push(right);
        return;
      }
      refineCell(left, midpoint, depth + 1);
      refineCell(midpoint, right, depth + 1);
    };
    for (let index = 0; index < baseGrid.length - 1; index += 1)
      refineCell(baseGrid[index]!, baseGrid[index + 1]!, 0);
    scanCells = grid.length - 1;
    const fields = ([0, 1, 2] as const).map((order) => grid.map((x) => valueAt(order, x)));
    const riskyCells = grid.slice(1).map((right, index) =>
      graph2DExpressionPossibleDomainBoundary(object.expression.ast, [grid[index]!, right], variables));
    if (fields[0]!.some((entry) => entry === null)) {
      refinementIncomplete = true;
      note("invalid-samples", "Undefined samples split the scanned interval; nearby features may be missed.");
    }
    for (let index = 0; index < grid.length - 1; index += 1)
      if (fields[0]![index] === null || fields[0]![index + 1] === null)
        unresolved(grid[index]!, grid[index + 1]!, "undefined");
    for (let index = 0; index < grid.length; index += 1) {
      const x = grid[index]!;
      const f = fields[0]![index];
      const left = fields[0]![index - 1] ?? null, right = fields[0]![index + 1] ?? null;
      const residual = finite(f) ? Math.abs(f) : Infinity;
      const localMinimum = (index === 0 || finite(left) && Math.abs(left) >= residual) &&
        (index === grid.length - 1 || finite(right) && Math.abs(right) >= residual) &&
        (finite(left) && Math.abs(left) > residual || finite(right) && Math.abs(right) > residual);
      if (f === 0 && localMinimum) add("zero", x, 0, "sample", "numerical");
    }
    for (let index = 1; index < grid.length - 1 && !incomplete; index += 1) {
      for (const order of [1, 2] as const) {
        const previous = fields[order]![index - 1], middle = fields[order]![index], next = fields[order]![index + 1];
        if (!finite(previous) || !finite(middle) || !finite(next) ||
            Math.abs(middle) > residualTolerance || Math.sign(previous) === Math.sign(next)) continue;
        const checked = analyzeGraph2DDerivative({ document: input.document, objectId: object.id, x: grid[index]!, order });
        if (checked.status !== "numerical" || checked.value === null || Math.abs(checked.value) > residualTolerance) {
          refinementIncomplete = true;
          unresolved(grid[index - 1]!, grid[index + 1]!, "derivative-check");
          note("unresolved-derivative", "A derivative sign change could not be confirmed at a differentiable point."); continue;
        }
        if (order === 1) add(previous < 0 && next > 0 ? "minimum" : "maximum", grid[index]!,
          Math.abs(checked.value), "sample", "numerical");
        else add("inflection", grid[index]!, Math.abs(checked.value), "sample", "numerical");
      }
    }
    for (let index = 0; index < grid.length - 1 && !incomplete; index += 1) {
      if (riskyCells[index]) continue;
      const a = grid[index]!, b = grid[index + 1]!;
      for (const order of [0, 1, 2] as const) {
        const fa = fields[order]![index], fb = fields[order]![index + 1];
        if (!finite(fa) || !finite(fb) || fa === 0 || fb === 0 || Math.sign(fa) === Math.sign(fb)) continue;
        const refined = bracket(order, a, b, fa, fb);
        if (!refined) { refinementIncomplete = true;
          unresolved(a, b, "residual-check");
          note("unresolved-bracket", "A sign-change bracket failed residual or continuity checks."); continue; }
        if (order === 0) { add("zero", refined.x, refined.residual, "bracket-bisection", "numerical"); continue; }
        const checked = analyzeGraph2DDerivative({ document: input.document, objectId: object.id, x: refined.x, order });
        if (checked.status !== "numerical" || checked.value === null ||
            Math.abs(checked.value) > Math.max(residualTolerance, Math.abs((fb - fa) / (b - a)) * xTolerance * 2)) {
          refinementIncomplete = true;
          unresolved(a, b, "derivative-check");
          note("unresolved-derivative", "A derivative sign change could not be confirmed at a differentiable point."); continue;
        }
        if (order === 1) add(fa < 0 && fb > 0 ? "minimum" : "maximum", refined.x,
          Math.abs(checked.value), "bracket-bisection", "numerical");
        else add("inflection", refined.x, Math.abs(checked.value), "bracket-bisection", "numerical");
      }
    }
    // A sign-preserving zero can indicate an even-multiplicity root. It remains heuristic.
    for (let index = 1; index < grid.length - 1 && !incomplete; index += 1) {
      const left = fields[0]![index - 1], middle = fields[0]![index], right = fields[0]![index + 1];
      if (!finite(left) || !finite(middle) || !finite(right) ||
          Math.abs(middle) > Math.abs(left) || Math.abs(middle) > Math.abs(right) ||
          Math.sign(left) !== Math.sign(right)) continue;
      let a = grid[index - 1]!, b = grid[index + 1]!;
      for (let step = 0; step < 32 && !incomplete; step += 1) {
        const x1 = a + (b - a) / 3, x2 = b - (b - a) / 3;
        const f1 = valueAt(0, x1), f2 = valueAt(0, x2);
        if (!finite(f1) || !finite(f2)) break;
        if (Math.abs(f1) <= Math.abs(f2)) b = x2; else a = x1;
      }
      const x = (a + b) / 2, value = valueAt(0, x);
      if (finite(value) && Math.abs(value) <= residualTolerance) add("zero", x, Math.abs(value),
        "minimum-absolute-residual", "heuristic", "even-possible");
    }
    for (const order of [1, 2] as const) {
      for (let index = 1; index < grid.length - 1; index += 1) {
        const previous = fields[order]![index - 1], middle = fields[order]![index], next = fields[order]![index + 1];
        if (finite(previous) && finite(middle) && finite(next) && Math.abs(middle) <= residualTolerance &&
            Math.sign(previous) === Math.sign(next)) {
          note(order === 1 ? "stationary-unclassified" : "inflection-unclassified",
            order === 1 ? "A stationary sample without a slope sign change is not classified as an extremum." :
              "A zero second derivative without a concavity sign change is not classified as an inflection.");
        }
      }
    }
  } else note("empty-interval", "The requested interval does not overlap the function domain.");
  if (refinementIncomplete) incomplete = true;
  if (diagnostics.has("candidate-limit")) unresolved(interval.min, interval.max, "work-limit");
  if (!symbolicFirst.ok || !symbolicSecond.ok) note("numerical-derivative-field", "Derivative field used bounded finite differences where symbolic rules were unavailable.");
  candidates.sort((a, b) => a.x - b.x || a.kind.localeCompare(b.kind));
  const status = interval.min >= interval.max ? "unavailable" : incomplete ? "incomplete" : "complete";
  const quality = graph2DQualityForScan(status);
  const diagnosticList = [...diagnostics.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, entry]) => ({ code, ...entry }));
  const unresolvedIntervals = compactGraph2DUnresolvedIntervals(unresolvedRaw, interval);
  const publication = createAnalysisResultEnvelope({
    resultId: "graph2d.critical-points." + structuralHash({ source, objectId: object.id, interval,
      maxEvaluations, algorithmVersion: GRAPH2D_CRITICAL_POINT_ALGORITHM_VERSION }).slice(7),
    status: status === "unavailable" ? "unsupported" : "numerical",
    provenance: { source, operation: { type: "graph2d.critical-points", algorithm: "adaptive-grid-bracket-residual",
      algorithmVersion: GRAPH2D_CRITICAL_POINT_ALGORITHM_VERSION,
      parameters: { objectId: object.id, interval, gridIntervals: GRAPH2D_CRITICAL_POINT_GRID_INTERVALS,
        maxScanCells: GRAPH2D_CRITICAL_POINT_MAX_SCAN_CELLS, maxRefinementDepth: MAX_REFINEMENT_DEPTH,
        maxCandidates: GRAPH2D_CRITICAL_POINT_MAX_CANDIDATES, maxEvaluations } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: residualTolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_CRITICAL_POINT_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { status, quality, interval, evaluations, scanCells, unresolvedIntervalCount: unresolvedIntervals.length,
      candidateCount: candidates.length,
      approximateCount: candidates.filter((entry) => entry.quality === "approximate").length,
      refinedCount: candidates.filter((entry) => entry.quality === "refined").length,
      zeroCount: candidates.filter((entry) => entry.kind === "zero").length,
      extremaCount: candidates.filter((entry) => entry.kind === "minimum" || entry.kind === "maximum").length,
      inflectionCount: candidates.filter((entry) => entry.kind === "inflection").length },
    warnings: ["Bounded numerical scan is not a proof of exhaustive roots or critical points; narrow or unresolved features may be missed.",
      ...(incomplete ? ["Analysis is partial because a budget, limit, or unresolved cell prevented full bounded refinement."] : [])],
    diagnostics: diagnosticList.map((entry) => ({ code: entry.code, severity: "warning" as const,
      message: `${entry.message} (${entry.count})` })), artifacts: [],
  });
  return { objectId: object.id, interval, status, quality, candidates, evaluations,
    diagnostics: diagnosticList, unresolvedIntervals, publication };
};

export const isGraph2DCriticalPointCurrent = (candidate: Graph2DCriticalPoint, document: Graph2DDocument): boolean =>
  candidate.source.documentId === document.identity.id && candidate.source.revision === document.identity.revision &&
  candidate.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry) => entry.id === candidate.objectId);
