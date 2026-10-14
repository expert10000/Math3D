import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DGraphObject, Graph2DProbe } from "./graph2dDocument";
import { GRAPH2D_CONSTRUCTIONS_CAPABILITY, GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY, GRAPH2D_MAX_CONSTRUCTION_ARTIFACT_BYTES,
  GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS, nextGraph2DConstructionId,
  applyGraph2DConstructionAction, type Graph2DConstructionAction,
  type Graph2DConstructionObject, type Graph2DPointOnCurveConstruction, type Graph2DCandidateConstruction } from "./graph2dConstructions";
import { analyzeGraph2DCriticalPoints, isGraph2DCriticalPointCurrent,
  type Graph2DCriticalPoint, type Graph2DCriticalPointAnalysis } from "./graph2dCriticalPoints";
import { analyzeGraph2DIntersections, isGraph2DIntersectionCurrent,
  type Graph2DIntersectionAnalysis, type Graph2DIntersectionCandidate } from "./graph2dIntersections";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { evaluateGraph2DParametric } from "./graph2dParametric";
import { evaluateGraph2DPolar } from "./graph2dPolar";
import type { ScientificSourceGeneration } from "./scientificJobs";

export type Graph2DResolvedConstruction = Readonly<{
  id: string; kind: Graph2DConstructionObject["kind"]; label: string;
  state: "ready" | "unavailable"; reason: string | null;
  confidence: "source-defined" | "approximate" | "unavailable";
  sourceObjectId: string; point: Readonly<{ x: number; y: number }> | null;
  direction: Readonly<{ x: number; y: number }> | null;
  style: Graph2DConstructionObject["style"];
}>;
export type Graph2DConstructionArtifact = Readonly<{
  source: ScientificSourceGeneration; generationKey: string;
  objects: readonly Graph2DResolvedConstruction[];
  evaluations: number; bytes: number; truncated: boolean;
}>;
type Point = Readonly<{ x: number; y: number }>;
const sourceGeneration = (document: Graph2DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
export const graph2DConstructionGenerationKey = (document: Graph2DDocument): string =>
  structuralHash({ identity: document.identity, constructions: document.source.constructions ?? null,
    variables: document.source.variables });
export const isGraph2DConstructionArtifactCurrent = (artifact: Graph2DConstructionArtifact, document: Graph2DDocument): boolean =>
  artifact.generationKey === graph2DConstructionGenerationKey(document) &&
  artifact.source.documentId === document.identity.id && artifact.source.revision === document.identity.revision &&
  artifact.source.structuralHash === document.identity.structuralHash;

const parameterOf = (source: Graph2DGraphObject) => source.kind === "explicit-cartesian" ? "x" as const :
  source.kind === "parametric" ? "t" as const : source.kind === "polar" ? "theta" as const : null;

/** A selected, committed probe becomes source-linked intent; no sampled coordinates are copied. */
export function graph2DPointConstructionFromProbe(document: Graph2DDocument, label = "Point"): Graph2DPointOnCurveConstruction {
  const probe: Graph2DProbe | null = document.selection.probe;
  const source = document.source.objects.find(item => item.id === probe?.objectId);
  const parameter = source ? parameterOf(source) : null;
  const value = parameter === "x" ? probe?.x : probe?.parameter;
  if (!probe || !source || !parameter || value === undefined || !Number.isFinite(value))
    throw new TypeError("Select a committed probe on an explicit, parametric, or polar curve first.");
  return { id: nextGraph2DConstructionId(document.source), kind: "point-on-curve", label,
    inputs: [{ kind: "source", objectId: source.id }], anchor: { parameter, value },
    style: { visible: true, color: document.display.objects.find(item => item.objectId === source.id)?.color ?? "#2563eb",
      lineWidth: 2, lineStyle: "solid" }, requiredCapability: GRAPH2D_CONSTRUCTIONS_CAPABILITY };
}

export function graph2DDerivedConstructionFromPoint(document: Graph2DDocument, pointId: string,
  kind: "tangent" | "normal"): Graph2DConstructionObject {
  const point = document.source.constructions?.objects.find(item => item.id === pointId);
  if (point?.kind !== "point-on-curve") throw new TypeError("Select a saved point construction first.");
  return { id: nextGraph2DConstructionId(document.source), kind, label: kind === "tangent" ? "Tangent" : "Normal",
    inputs: [{ kind: "construction", objectId: pointId }], anchor: null, style: { ...point.style },
    requiredCapability: GRAPH2D_CONSTRUCTIONS_CAPABILITY };
}

/** Build a dependent line from a result probe without changing the current selection. */
export function graph2DLineConstructionActionsFromProbe(document: Graph2DDocument, probe: Graph2DProbe,
  kind: "tangent" | "normal"): readonly [Graph2DConstructionAction, Graph2DConstructionAction] {
  const selected = { ...document, selection: { objectId: probe.objectId, probe } };
  const point = graph2DPointConstructionFromProbe(selected, `Point ${(document.source.constructions?.objects.filter(item => item.kind === "point-on-curve").length ?? 0) + 1}`);
  const withPoint = { ...selected, source: applyGraph2DConstructionAction(document.source, { type: "create", object: point }) };
  const line = graph2DDerivedConstructionFromPoint(withPoint, point.id, kind);
  // Validate the complete pair before returning it to a command adapter.
  applyGraph2DConstructionAction(withPoint.source, { type: "create", object: line });
  return [{ type: "create", object: point }, { type: "create", object: line }];
}

/** Capture a bounded numerical candidate and a local, unique matching window. */
export function graph2DConstructionFromCandidate(document: Graph2DDocument,
  analysis: Graph2DCriticalPointAnalysis | Graph2DIntersectionAnalysis,
  candidate: Graph2DCriticalPoint | Graph2DIntersectionCandidate): Graph2DCandidateConstruction {
  const intersection = "firstObjectId" in candidate;
  if (!intersection && candidate.kind === "inflection") throw new TypeError("Only roots and extrema can be saved as candidate constructions.");
  if (intersection !== ("firstObjectId" in analysis) ||
      analysis.status !== "complete" ||
      !(intersection ? isGraph2DIntersectionCurrent(analysis as Graph2DIntersectionAnalysis, document) :
        isGraph2DCriticalPointCurrent(candidate as Graph2DCriticalPoint, document)) ||
      !analysis.candidates.some(item => item.candidateId === candidate.candidateId))
    throw new TypeError("Candidate is stale or does not belong to this analysis.");
  const interval = analysis.interval;
  const width = interval.max - interval.min;
  if (!(width > 0) || candidate.x < interval.min || candidate.x > interval.max)
    throw new TypeError("Candidate interval is unavailable.");
  const nearest = Math.min(...analysis.candidates.filter(item => item.candidateId !== candidate.candidateId &&
    (intersection ? "classification" in item && "classification" in candidate && item.classification === candidate.classification :
      "kind" in item && "kind" in candidate && item.kind === candidate.kind))
    .map(item => Math.abs(item.x - candidate.x)), Infinity);
  const matchRadius = Math.min(width / 16, nearest / 3);
  if (!(matchRadius > 0)) throw new TypeError("Candidate cannot be matched uniquely.");
  const ids = intersection ? [candidate.firstObjectId, candidate.secondObjectId] : [candidate.objectId];
  return { id: nextGraph2DConstructionId(document.source),
    kind: intersection ? "intersection" : candidate.kind === "zero" ? "root" : candidate.kind as "minimum" | "maximum",
    label: intersection ? "Intersection" : candidate.kind === "zero" ? "Root" : candidate.kind === "minimum" ? "Minimum" : "Maximum",
    inputs: ids.map(objectId => ({ kind: "source" as const, objectId })),
    anchor: { interval, seedX: candidate.x, matchRadius, candidateId: candidate.candidateId,
      method: candidate.method, residual: candidate.residual, confidence: candidate.confidence,
      classification: intersection ? candidate.classification : null, sourceGeneration: candidate.source },
    style: { visible: true, color: document.display.objects.find(item => item.objectId === ids[0])?.color ?? "#2563eb",
      lineWidth: 2, lineStyle: "solid" }, requiredCapability: GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY };
}

/** Resolves the ordered graph against exact source expressions, never sampler polylines. */
export function resolveGraph2DConstructions(document: Graph2DDocument): Graph2DConstructionArtifact {
  const source = sourceGeneration(document), generationKey = graph2DConstructionGenerationKey(document);
  const definitions = document.source.constructions?.objects ?? [];
  const variables = Object.fromEntries(document.source.variables.map(item => [item.name, item.value]));
  const resolved = new Map<string, Graph2DResolvedConstruction>();
  const objects: Graph2DResolvedConstruction[] = [];
  const criticalCache = new Map<string, Graph2DCriticalPointAnalysis>();
  const intersectionCache = new Map<string, Graph2DIntersectionAnalysis>();
  let evaluations = 0, bytes = 0, truncated = false;
  const evaluate = (object: Graph2DGraphObject, parameter: number): Point | null => {
    if (evaluations >= GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS) { truncated = true; return null; }
    evaluations += 1;
    if (object.kind === "explicit-cartesian") {
      if (parameter < object.domain.min || parameter > object.domain.max ||
        parameter === object.domain.min && !object.domain.includeMin || parameter === object.domain.max && !object.domain.includeMax) return null;
      const result = evaluateGraph2DExpression(object.expression.ast, { ...variables, x: parameter });
      return result.ok ? { x: parameter, y: result.value } : null;
    }
    if (object.kind === "parametric") {
      const point = evaluateGraph2DParametric(object, variables, parameter);
      return point ? { x: point.x, y: point.y } : null;
    }
    if (object.kind === "polar") {
      const point = evaluateGraph2DPolar(object, variables, parameter);
      return point ? { x: point.x, y: point.y } : null;
    }
    return null;
  };
  const tangentAt = (object: Graph2DGraphObject, parameter: number, center: Point): Point | null => {
    if (!("domain" in object)) return null;
    const domain = object.domain;
    const scale = Math.max(1, Math.abs(parameter));
    const step = Math.min(Math.cbrt(Number.EPSILON) * scale, (domain.max - domain.min) / 64);
    if (!(step > 16 * Number.EPSILON * scale)) return null;
    const left = evaluate(object, parameter - step), right = evaluate(object, parameter + step);
    const halfLeft = evaluate(object, parameter - step / 2), halfRight = evaluate(object, parameter + step / 2);
    const vector = (a: Point, b: Point, divisor: number): Point => ({ x: (b.x - a.x) / divisor, y: (b.y - a.y) / divisor });
    let coarse: Point, fine: Point;
    if (left && right && halfLeft && halfRight) {
      coarse = vector(left, right, 2 * step); fine = vector(halfLeft, halfRight, step);
      const oneSidedLeft = vector(left, center, step), oneSidedRight = vector(center, right, step);
      const disagreement = Math.hypot(oneSidedLeft.x - oneSidedRight.x, oneSidedLeft.y - oneSidedRight.y);
      if (disagreement > 0.01 * Math.max(1, Math.hypot(coarse.x, coarse.y))) return null;
    } else if (right && halfRight) {
      coarse = vector(center, right, step); fine = vector(center, halfRight, step / 2);
    } else if (left && halfLeft) {
      coarse = vector(left, center, step); fine = vector(halfLeft, center, step / 2);
    } else return null;
    const magnitude = Math.hypot(fine.x, fine.y);
    if (!Number.isFinite(magnitude) || magnitude <= 1e-10 ||
      Math.hypot(coarse.x - fine.x, coarse.y - fine.y) > 0.01 * Math.max(1, magnitude)) return null;
    return fine;
  };
  for (const definition of definitions) {
    let item: Graph2DResolvedConstruction;
    if (definition.kind === "point-on-curve") {
      const sourceObjectId = definition.inputs[0]?.objectId ?? "";
      const curve = document.source.objects.find(entry => entry.id === sourceObjectId);
      const point = curve && parameterOf(curve) === definition.anchor.parameter ? evaluate(curve, definition.anchor.value) : null;
      item = { id: definition.id, kind: definition.kind, label: definition.label, style: definition.style,
        state: point ? "ready" : "unavailable", reason: point ? null : "Point is outside the domain or undefined at this parameter.",
        confidence: point ? "source-defined" : "unavailable",
        sourceObjectId, point, direction: null };
    } else if (definition.kind === "root" || definition.kind === "minimum" || definition.kind === "maximum" ||
        definition.kind === "intersection") {
      const sourceObjectId = definition.inputs[0]?.objectId ?? "";
      const anchor = definition.anchor;
      const secondId = definition.kind === "intersection" ? definition.inputs[1]?.objectId ?? "" : "";
      const key = structuralHash({ sourceObjectId, secondId, interval: anchor.interval });
      let candidates: readonly (Graph2DCriticalPoint | Graph2DIntersectionCandidate)[] = [];
      let analysisAvailable = false;
      try {
        if (definition.kind === "intersection") {
          let analysis = intersectionCache.get(key);
          if (!analysis && evaluations < GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS) {
            analysis = analyzeGraph2DIntersections({ document, firstObjectId: sourceObjectId,
              secondObjectId: secondId, interval: anchor.interval,
              maxEvaluations: GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS - evaluations });
            evaluations += analysis.evaluations; intersectionCache.set(key, analysis);
          }
          if (analysis) { candidates = analysis.candidates; analysisAvailable = analysis.status === "complete"; }
        } else {
          let analysis = criticalCache.get(key);
          if (!analysis && evaluations < GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS) {
            analysis = analyzeGraph2DCriticalPoints({ document, objectId: sourceObjectId, interval: anchor.interval,
              maxEvaluations: GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS - evaluations });
            evaluations += analysis.evaluations; criticalCache.set(key, analysis);
          }
          if (analysis) { candidates = analysis.candidates; analysisAvailable = analysis.status === "complete"; }
        }
      } catch { /* Deleted or incompatible source: persisted intent stays unavailable. */ }
      if (evaluations >= GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS) truncated = true;
      const near = candidates.filter(candidate => Math.abs(candidate.x - anchor.seedX) <= anchor.matchRadius &&
        (definition.kind === "intersection" ? "classification" in candidate && candidate.classification === anchor.classification :
          "kind" in candidate && (candidate.kind === "zero" ? "root" : candidate.kind) === definition.kind));
      const match = near.length === 1 ? near[0] : null;
      const point = analysisAvailable && match ? { x: match.x, y: match.y } : null;
      item = { id: definition.id, kind: definition.kind, label: definition.label, style: definition.style,
        state: point ? "ready" : "unavailable", confidence: point ? "approximate" : "unavailable",
        reason: point ? null : !analysisAvailable ? "Source or bounded analysis is unavailable." :
          near.length > 1 ? "Matching window contains multiple candidates." : "Original candidate no longer has a unique local match.",
        sourceObjectId, point, direction: null };
    } else {
      const parent = resolved.get(definition.inputs[0]?.objectId ?? "");
      const pointDef = definitions.find(entry => entry.id === parent?.id);
      const curve = document.source.objects.find(entry => entry.id === parent?.sourceObjectId);
      const tangent = parent?.point && pointDef?.kind === "point-on-curve" && curve ?
        tangentAt(curve, pointDef.anchor.value, parent.point) : null;
      const direction = tangent ? definition.kind === "tangent" ? tangent : { x: -tangent.y, y: tangent.x } : null;
      item = { id: definition.id, kind: definition.kind, label: definition.label, style: definition.style,
        state: direction ? "ready" : "unavailable",
        confidence: direction ? "approximate" : "unavailable",
        reason: direction ? null : parent?.state !== "ready" ? "Input point is unavailable." : "Tangent is singular, discontinuous, or undefined here.",
        sourceObjectId: parent?.sourceObjectId ?? "", point: direction ? parent!.point : null, direction };
    }
    const itemBytes = new TextEncoder().encode(JSON.stringify(item)).length;
    if (bytes + itemBytes > GRAPH2D_MAX_CONSTRUCTION_ARTIFACT_BYTES) { truncated = true; break; }
    bytes += itemBytes; objects.push(item); resolved.set(item.id, item);
  }
  return { source, generationKey, objects, evaluations, bytes, truncated };
}
