import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import { analyzeGraph2DCriticalPoints, type Graph2DCriticalPointAnalysis } from "./graph2dCriticalPoints";
import { analyzeGraph2DDerivative } from "./graph2dDerivatives";
import type { Graph2DDocument } from "./graph2dDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_INTERVAL_ALGORITHM_VERSION = "1" as const;
export const GRAPH2D_INTERVAL_GRID_CELLS = 256;
export type Graph2DIntervalSign = "positive" | "negative" | "zero" | "unknown";
export type Graph2DIntervalBoundary = "view" | "domain" | "critical" | "invalid-sample";
export type Graph2DIntervalPartition = Readonly<{
  intervalId: string;
  resultId: string;
  min: number;
  max: number;
  leftBoundary: Graph2DIntervalBoundary;
  rightBoundary: Graph2DIntervalBoundary;
  monotonicity: "increasing" | "decreasing" | "constant" | "unknown";
  concavity: "up" | "down" | "linear" | "unknown";
  confidence: "numerical" | "unknown";
}>;
export type Graph2DIntervalAnalysis = Readonly<{
  objectId: string;
  resultId: string;
  source: ScientificSourceGeneration;
  interval: Readonly<{ min: number; max: number }>;
  partitions: readonly Graph2DIntervalPartition[];
  invalidSamples: number;
  status: "complete" | "incomplete" | "unavailable";
  publication: AnalysisResultEnvelope;
}>;

const sign = (value: number | null): Graph2DIntervalSign => {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (Math.abs(value) <= 1e-8) return "zero";
  return value > 0 ? "positive" : "negative";
};
const uniqueSign = (values: readonly Graph2DIntervalSign[]): Graph2DIntervalSign =>
  values.length && values.every((value) => value === values[0]) ? values[0]! : "unknown";

/** Bounded numerical partitions; invalid neighborhoods are never assigned a smooth sign. */
export const analyzeGraph2DIntervals = (input: Readonly<{
  document: Graph2DDocument;
  objectId: string;
  interval?: Readonly<{ min: number; max: number }>;
  criticalPoints?: Graph2DCriticalPointAnalysis;
}>): Graph2DIntervalAnalysis => {
  const object = input.document.source.objects.find((entry) => entry.id === input.objectId);
  if (!object || object.kind !== "explicit-cartesian") throw new TypeError("Graph2D explicit function does not exist.");
  const requested = input.interval ?? { min: input.document.display.viewport.xMin, max: input.document.display.viewport.xMax };
  if (!Number.isFinite(requested.min) || !Number.isFinite(requested.max) || requested.min >= requested.max)
    throw new TypeError("Invalid Graph2D interval analysis request.");
  const interval = { min: Math.max(requested.min, object.domain.min), max: Math.min(requested.max, object.domain.max) };
  const started = Date.now();
  const source: ScientificSourceGeneration = { documentId: input.document.identity.id,
    revision: input.document.identity.revision, structuralHash: input.document.identity.structuralHash,
    generation: input.document.identity.revision };
  const resultId = "graph2d.intervals." + structuralHash({ source, objectId: object.id, interval,
    algorithmVersion: GRAPH2D_INTERVAL_ALGORITHM_VERSION }).slice(7);
  const partitions: Graph2DIntervalPartition[] = [];
  let invalidSamples = 0;
  let status: Graph2DIntervalAnalysis["status"] = interval.min < interval.max ? "complete" : "unavailable";
  if (status === "complete") {
    const critical = input.criticalPoints && input.criticalPoints.objectId === object.id &&
      input.criticalPoints.interval.min === interval.min && input.criticalPoints.interval.max === interval.max &&
      input.criticalPoints.publication.provenance.source.structuralHash === source.structuralHash &&
      input.criticalPoints.publication.provenance.source.revision === source.revision
      ? input.criticalPoints : analyzeGraph2DCriticalPoints({ document: input.document, objectId: object.id, interval });
    if (critical.status === "incomplete") status = "incomplete";
    const variables = Object.fromEntries(input.document.source.variables.map((entry) => [entry.name, entry.value]));
    const sample = (x: number) => evaluateGraph2DExpression(object.expression.ast, { ...variables, x });
    const step = (interval.max - interval.min) / GRAPH2D_INTERVAL_GRID_CELLS;
    const cuts: { x: number; kind: Graph2DIntervalBoundary }[] = [
      { x: interval.min, kind: interval.min === object.domain.min ? "domain" : "view" },
      { x: interval.max, kind: interval.max === object.domain.max ? "domain" : "view" },
    ];
    for (const candidate of critical.candidates) if (candidate.kind !== "zero" &&
      candidate.x > interval.min && candidate.x < interval.max) cuts.push({ x: candidate.x, kind: "critical" });
    const invalid: number[] = [];
    for (let index = 0; index <= GRAPH2D_INTERVAL_GRID_CELLS; index += 1) {
      const x = interval.min + (interval.max - interval.min) * index / GRAPH2D_INTERVAL_GRID_CELLS;
      if (sample(x).ok) continue;
      invalidSamples += 1;
      invalid.push(index);
    }
    for (let index = 0; index < invalid.length;) {
      let end = index;
      while (end + 1 < invalid.length && invalid[end + 1] === invalid[end]! + 1) end += 1;
      cuts.push({ x: Math.max(interval.min, interval.min + (invalid[index]! - 0.5) * step), kind: "invalid-sample" },
        { x: Math.min(interval.max, interval.min + (invalid[end]! + 0.5) * step), kind: "invalid-sample" });
      index = end + 1;
    }
    cuts.sort((a, b) => a.x - b.x);
    const ordered = cuts.filter((cut, index) => index === 0 || cut.x - cuts[index - 1]!.x >
      Math.max(1e-12, step * 1e-6));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const left = ordered[index]!, right = ordered[index + 1]!;
      const invalidNeighborhood = left.kind === "invalid-sample" && right.kind === "invalid-sample";
      const positions = [0.25, 0.5, 0.75].map((fraction) => left.x + (right.x - left.x) * fraction);
      const valid = !invalidNeighborhood && positions.every((x) => sample(x).ok);
      const derivative = (order: 1 | 2) => valid ? uniqueSign(positions.map((x) => {
        const estimate = analyzeGraph2DDerivative({ document: input.document, objectId: object.id, x, order });
        return estimate.status === "numerical" ? sign(estimate.value) : "unknown";
      })) : "unknown";
      const first = derivative(1), second = derivative(2);
      const monotonicity = first === "positive" ? "increasing" : first === "negative" ? "decreasing" :
        first === "zero" ? "constant" : "unknown";
      const concavity = second === "positive" ? "up" : second === "negative" ? "down" :
        second === "zero" ? "linear" : "unknown";
      partitions.push({ intervalId: `${resultId}.${index}`, resultId, min: left.x, max: right.x,
        leftBoundary: left.kind, rightBoundary: right.kind, monotonicity, concavity,
        confidence: monotonicity === "unknown" || concavity === "unknown" ? "unknown" : "numerical" });
    }
  }
  const publication = createAnalysisResultEnvelope({ resultId, status: status === "unavailable" ? "unsupported" : "numerical",
    provenance: { source, operation: { type: "graph2d.intervals", algorithm: "critical-cuts-and-multi-probe-signs",
      algorithmVersion: GRAPH2D_INTERVAL_ALGORITHM_VERSION,
      parameters: { objectId: object.id, interval, gridCells: GRAPH2D_INTERVAL_GRID_CELLS } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: 1e-8 } },
      engine: { name: "math3d-core", version: GRAPH2D_INTERVAL_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { interval, partitionCount: partitions.length, invalidSamples, status },
    warnings: ["Interval signs are numerical samples, not proofs; narrow changes may be missed.",
      ...(status === "incomplete" ? ["Critical point scan reached its work limit."] : [])],
    diagnostics: invalidSamples ? [{ code: "invalid-samples", severity: "warning",
      message: `${invalidSamples} undefined samples isolated as unknown intervals.` }] : [], artifacts: [] });
  return { objectId: object.id, resultId, source, interval, partitions, invalidSamples, status, publication };
};

export const isGraph2DIntervalAnalysisCurrent = (result: Graph2DIntervalAnalysis, document: Graph2DDocument): boolean =>
  result.source.documentId === document.identity.id && result.source.revision === document.identity.revision &&
  result.source.structuralHash === document.identity.structuralHash &&
  document.source.objects.some((entry) => entry.id === result.objectId);
