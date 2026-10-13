import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DGraphObject, Graph2DProbe } from "./graph2dDocument";
import { GRAPH2D_CONSTRUCTIONS_CAPABILITY, GRAPH2D_MAX_CONSTRUCTION_ARTIFACT_BYTES,
  GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS, nextGraph2DConstructionId,
  type Graph2DConstructionObject, type Graph2DPointOnCurveConstruction } from "./graph2dConstructions";
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

/** Resolves the ordered graph against exact source expressions, never sampler polylines. */
export function resolveGraph2DConstructions(document: Graph2DDocument): Graph2DConstructionArtifact {
  const source = sourceGeneration(document), generationKey = graph2DConstructionGenerationKey(document);
  const definitions = document.source.constructions?.objects ?? [];
  const variables = Object.fromEntries(document.source.variables.map(item => [item.name, item.value]));
  const resolved = new Map<string, Graph2DResolvedConstruction>();
  const objects: Graph2DResolvedConstruction[] = [];
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
