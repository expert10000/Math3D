import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { analyzeGraph2DDerivative } from "./graph2dDerivatives";
import type { Graph2DDocument, Graph2DExplicitObject } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_INTERSECTION_ALGORITHM_VERSION = "1" as const;
export const GRAPH2D_INTERSECTION_GRID_CELLS = 256;
export const GRAPH2D_INTERSECTION_MAX_EVALUATIONS = 12000;
export const GRAPH2D_INTERSECTION_MAX_CANDIDATES = 64;
export type Graph2DIntersectionCandidate = Readonly<{
  candidateId: string;
  resultId: string;
  firstObjectId: string;
  secondObjectId: string;
  x: number;
  y: number;
  residual: number;
  classification: "crossing" | "tangent-possible";
  method: "sample" | "bracket-bisection" | "minimum-absolute-residual";
  confidence: "numerical" | "heuristic";
  source: ScientificSourceGeneration;
}>;
export type Graph2DIntersectionAnalysis = Readonly<{
  resultId: string;
  firstObjectId: string;
  secondObjectId: string;
  source: ScientificSourceGeneration;
  interval: Readonly<{ min: number; max: number }>;
  status: "complete" | "incomplete" | "unavailable";
  candidates: readonly Graph2DIntersectionCandidate[];
  evaluations: number;
  invalidCells: number;
  unresolvedBrackets: number;
  coincidentCells: number;
  publication: AnalysisResultEnvelope;
}>;

const allowed = (object: Graph2DExplicitObject, x: number) =>
  (x > object.domain.min || x === object.domain.min && object.domain.includeMin) &&
  (x < object.domain.max || x === object.domain.max && object.domain.includeMax);

/** Pair-only bounded scan; no implicit all-pairs work occurs. */
export const analyzeGraph2DIntersections = (input: Readonly<{
  document: Graph2DDocument;
  firstObjectId: string;
  secondObjectId: string;
  interval?: Readonly<{ min: number; max: number }>;
}>): Graph2DIntersectionAnalysis => {
  const first = input.document.source.objects.find((entry) => entry.id === input.firstObjectId);
  const second = input.document.source.objects.find((entry) => entry.id === input.secondObjectId);
  if (!first || !second || first.id === second.id) throw new TypeError("Select two distinct Graph2D functions.");
  const requested = input.interval ?? { min: input.document.display.viewport.xMin, max: input.document.display.viewport.xMax };
  if (!Number.isFinite(requested.min) || !Number.isFinite(requested.max) || requested.min >= requested.max)
    throw new TypeError("Invalid Graph2D intersection interval.");
  const interval = { min: Math.max(requested.min, first.domain.min, second.domain.min),
    max: Math.min(requested.max, first.domain.max, second.domain.max) };
  const source: ScientificSourceGeneration = { documentId: input.document.identity.id,
    revision: input.document.identity.revision, structuralHash: input.document.identity.structuralHash,
    generation: input.document.identity.revision };
  const resultId = "graph2d.intersections." + structuralHash({ source, firstObjectId: first.id,
    secondObjectId: second.id, interval, algorithmVersion: GRAPH2D_INTERSECTION_ALGORITHM_VERSION }).slice(7);
  const started = Date.now();
  const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
  let evaluations = 0, incomplete = false, invalidCells = 0, unresolvedBrackets = 0, coincidentCells = 0;
  const value = (object: Graph2DExplicitObject, x: number): number | null => {
    if (!allowed(object, x)) return null;
    if (evaluations >= GRAPH2D_INTERSECTION_MAX_EVALUATIONS) { incomplete = true; return null; }
    evaluations += 1;
    const result = evaluateGraph2DExpression(object.expression.ast, { ...variables, x });
    return result.ok ? result.value : null;
  };
  const difference = (x: number): number | null => {
    const a = value(first, x), b = value(second, x);
    return a === null || b === null ? null : a - b;
  };
  const candidates: Graph2DIntersectionCandidate[] = [];
  const xTolerance = interval.min < interval.max ? Math.max(1e-10,
    16 * Number.EPSILON * Math.max(1, Math.abs(interval.min), Math.abs(interval.max)),
    Math.min(1e-5, (interval.max - interval.min) * 1e-9)) : 1e-10;
  const residualTolerance = 1e-7;
  const add = (x: number, residual: number, classification: Graph2DIntersectionCandidate["classification"],
    method: Graph2DIntersectionCandidate["method"], confidence: Graph2DIntersectionCandidate["confidence"]) => {
    const a = value(first, x), b = value(second, x);
    if (a === null || b === null || Math.abs(a - b) > Math.max(residualTolerance, residual * 2)) return;
    const candidate: Graph2DIntersectionCandidate = { candidateId: `${resultId}.${structuralHash({ x }).slice(7)}`,
      resultId, firstObjectId: first.id, secondObjectId: second.id, x, y: (a + b) / 2,
      residual: Math.abs(a - b), classification, method, confidence, source };
    const previous = candidates.findIndex((entry) => Math.abs(entry.x - x) <= Math.max(xTolerance * 8, 1e-7));
    if (previous >= 0) {
      if (candidate.residual < candidates[previous]!.residual ||
        candidate.confidence === "numerical" && candidates[previous]!.confidence === "heuristic") candidates[previous] = candidate;
      return;
    }
    if (candidates.length >= GRAPH2D_INTERSECTION_MAX_CANDIDATES) { incomplete = true; return; }
    candidates.push(candidate);
  };
  if (interval.min < interval.max) {
    const grid = Array.from({ length: GRAPH2D_INTERSECTION_GRID_CELLS + 1 }, (_, index) =>
      interval.min + (interval.max - interval.min) * index / GRAPH2D_INTERSECTION_GRID_CELLS);
    const field = grid.map(difference);
    for (let index = 0; index < field.length; index += 1) {
      const current = field[index], left = field[index - 1], right = field[index + 1];
      if (current !== 0 || left === 0 || right === 0) continue;
      const crossing = left !== null && left !== undefined && right !== null && right !== undefined &&
        left !== 0 && right !== 0 && Math.sign(left) !== Math.sign(right);
      add(grid[index]!, 0, crossing ? "crossing" : "tangent-possible", "sample",
        crossing ? "numerical" : "heuristic");
    }
    for (let index = 0; index < grid.length - 1 && !incomplete; index += 1) {
      const left = field[index], right = field[index + 1];
      if (left === null || right === null) { invalidCells += 1; continue; }
      if (left === 0 && right === 0) { coincidentCells += 1; continue; }
      if (left === 0 || right === 0 || Math.sign(left) === Math.sign(right)) continue;
      let a = grid[index]!, b = grid[index + 1]!, fa = left, fb = right;
      let valid = true;
      for (let step = 0; step < 48 && b - a > xTolerance && !incomplete; step += 1) {
        const midpoint = (a + b) / 2;
        if (midpoint === a || midpoint === b) break;
        const fm = difference(midpoint);
        if (fm === null) { valid = false; break; }
        if (fm === 0) { a = b = midpoint; fa = fb = 0; break; }
        if (Math.sign(fm) === Math.sign(fa)) { a = midpoint; fa = fm; }
        else { b = midpoint; fb = fm; }
      }
      const x = Math.abs(fa) <= Math.abs(fb) ? a : b;
      const residual = Math.min(Math.abs(fa), Math.abs(fb));
      if (!valid || residual > Math.max(residualTolerance, Math.abs((right - left) /
        (grid[index + 1]! - grid[index]!)) * xTolerance * 2)) { unresolvedBrackets += 1; continue; }
      add(x, residual, "crossing", "bracket-bisection", "numerical");
    }
    // A sign-preserving local minimum of |f-g| can be a tangency. This remains heuristic.
    for (let index = 1; index < grid.length - 1 && !incomplete; index += 1) {
      const left = field[index - 1], middle = field[index], right = field[index + 1];
      if (left === null || middle === null || right === null ||
        Math.abs(middle) >= Math.abs(left) || Math.abs(middle) >= Math.abs(right) ||
        Math.sign(left) !== Math.sign(right)) continue;
      let a = grid[index - 1]!, b = grid[index + 1]!;
      for (let step = 0; step < 32 && !incomplete; step += 1) {
        const x1 = a + (b - a) / 3, x2 = b - (b - a) / 3;
        const f1 = difference(x1), f2 = difference(x2);
        if (f1 === null || f2 === null) { a = b = NaN; break; }
        if (Math.abs(f1) <= Math.abs(f2)) b = x2; else a = x1;
      }
      const x = (a + b) / 2, residual = difference(x);
      if (Number.isFinite(x) && residual !== null && Math.abs(residual) <= residualTolerance) {
        const d1 = analyzeGraph2DDerivative({ document: input.document, objectId: first.id, x, order: 1 });
        const d2 = analyzeGraph2DDerivative({ document: input.document, objectId: second.id, x, order: 1 });
        if (d1.value !== null && d2.value !== null && Math.abs(d1.value - d2.value) <= 1e-4)
          add(x, Math.abs(residual), "tangent-possible", "minimum-absolute-residual", "heuristic");
      }
    }
  }
  candidates.sort((a, b) => a.x - b.x);
  const status = interval.min >= interval.max ? "unavailable" : incomplete || coincidentCells ? "incomplete" : "complete";
  const publication = createAnalysisResultEnvelope({ resultId,
    status: status === "unavailable" ? "unsupported" : "numerical",
    provenance: { source, operation: { type: "graph2d.intersections", algorithm: "pair-grid-bracket-and-minimum-residual",
      algorithmVersion: GRAPH2D_INTERSECTION_ALGORITHM_VERSION,
      parameters: { firstObjectId: first.id, secondObjectId: second.id, interval,
        gridCells: GRAPH2D_INTERSECTION_GRID_CELLS, maxCandidates: GRAPH2D_INTERSECTION_MAX_CANDIDATES } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: residualTolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_INTERSECTION_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { interval, status, candidateCount: candidates.length, invalidCells, unresolvedBrackets,
      coincidentCells, evaluations },
    warnings: ["Tangencies and narrow intersections are heuristic and may be missed; multiplicity is not certified.",
      ...(incomplete ? ["Intersection scan reached a work or candidate limit."] : [])],
    diagnostics: [
      ...(invalidCells ? [{ code: "invalid-cells", severity: "warning" as const,
        message: `${invalidCells} cells touched an undefined sample.` }] : []),
      ...(unresolvedBrackets ? [{ code: "unresolved-brackets", severity: "warning" as const,
        message: `${unresolvedBrackets} sign changes did not pass residual checks.` }] : []),
      ...(coincidentCells ? [{ code: "coincident-cells", severity: "warning" as const,
        message: `${coincidentCells} cells appear coincident; isolated intersections are not enumerated there.` }] : []),
    ], artifacts: [] });
  return { resultId, firstObjectId: first.id, secondObjectId: second.id, source, interval, status,
    candidates, evaluations, invalidCells, unresolvedBrackets, coincidentCells, publication };
};

export const isGraph2DIntersectionCurrent = (result: Graph2DIntersectionAnalysis, document: Graph2DDocument): boolean =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry) => entry.id === result.firstObjectId) &&
  document.source.objects.some((entry) => entry.id === result.secondObjectId);
