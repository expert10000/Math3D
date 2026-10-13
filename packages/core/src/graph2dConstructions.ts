import type { Graph2DGraphObject, Graph2DSource } from "./graph2dDocument";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_CONSTRUCTIONS_CAPABILITY = "graph2d.constructions.v1" as const;
export const GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY = "graph2d.constructions.candidates.v1" as const;
export const GRAPH2D_CONSTRUCTION_VERSION = 1 as const;
export const GRAPH2D_MAX_CONSTRUCTIONS = 32;
export const GRAPH2D_MAX_CONSTRUCTION_DEPTH = 16;
export const GRAPH2D_MAX_CONSTRUCTION_EVALUATIONS = 12000;
export const GRAPH2D_MAX_CONSTRUCTION_ARTIFACT_BYTES = 1024 * 1024;

export type Graph2DConstructionStyle = Readonly<{ visible: boolean; color: string; lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted" }>;
export type Graph2DConstructionSourceInput = Readonly<{ kind: "source"; objectId: string }>;
export type Graph2DConstructionObjectInput = Readonly<{ kind: "construction"; objectId: string }>;
export type Graph2DConstructionAnchor = Readonly<{ parameter: "x" | "t" | "theta"; value: number }>;
type ConstructionBase = Readonly<{ id: string; label: string; style: Graph2DConstructionStyle }>;
export type Graph2DPointOnCurveConstruction = ConstructionBase & Readonly<{
  kind: "point-on-curve"; inputs: readonly Graph2DConstructionSourceInput[]; anchor: Graph2DConstructionAnchor;
  requiredCapability: typeof GRAPH2D_CONSTRUCTIONS_CAPABILITY;
}>;
export type Graph2DDerivedLineConstruction = ConstructionBase & Readonly<{
  kind: "tangent" | "normal"; inputs: readonly Graph2DConstructionObjectInput[]; anchor: null;
  requiredCapability: typeof GRAPH2D_CONSTRUCTIONS_CAPABILITY;
}>;
export type Graph2DCandidateAnchor = Readonly<{
  interval: Readonly<{ min: number; max: number }>;
  seedX: number; matchRadius: number; candidateId: string;
  method: "sample" | "bracket-bisection" | "minimum-absolute-residual";
  residual: number; confidence: "numerical" | "heuristic";
  classification: "crossing" | "tangent-possible" | null;
  sourceGeneration: ScientificSourceGeneration;
}>;
export type Graph2DCandidateConstruction = ConstructionBase & Readonly<{
  kind: "root" | "minimum" | "maximum" | "intersection";
  inputs: readonly Graph2DConstructionSourceInput[]; anchor: Graph2DCandidateAnchor;
  requiredCapability: typeof GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY;
}>;
export type Graph2DConstructionObject = Graph2DPointOnCurveConstruction | Graph2DDerivedLineConstruction | Graph2DCandidateConstruction;
export type Graph2DConstructionSet = Readonly<{ version: typeof GRAPH2D_CONSTRUCTION_VERSION;
  objects: readonly Graph2DConstructionObject[] }>;
export type Graph2DConstructionAction =
  | Readonly<{ type: "create"; object: Graph2DConstructionObject }>
  | Readonly<{ type: "update"; object: Graph2DConstructionObject }>
  | Readonly<{ type: "delete"; objectId: string }>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const validId = (value: unknown): value is string => typeof value === "string" && /^construction_[1-9][0-9]{0,5}$/.test(value);
const validLabel = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  value.length <= 160 && value.trim() === value;
const validStyle = (value: unknown): value is Graph2DConstructionStyle => record(value) &&
  exact(value, ["visible", "color", "lineWidth", "lineStyle"]) && typeof value.visible === "boolean" &&
  typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color) &&
  typeof value.lineWidth === "number" && Number.isFinite(value.lineWidth) && value.lineWidth >= 0.5 && value.lineWidth <= 12 &&
  ["solid", "dashed", "dotted"].includes(String(value.lineStyle));
const validInput = (value: unknown): value is Graph2DConstructionSourceInput | Graph2DConstructionObjectInput =>
  record(value) && exact(value, ["kind", "objectId"]) &&
  (value.kind === "source" || value.kind === "construction") && typeof value.objectId === "string";
const sourceParameter = (source: Graph2DGraphObject): Graph2DConstructionAnchor["parameter"] | null =>
  source.kind === "explicit-cartesian" ? "x" : source.kind === "parametric" ? "t" : source.kind === "polar" ? "theta" : null;
const validCandidateAnchor = (value: unknown): value is Graph2DCandidateAnchor => {
  if (!record(value) || !exact(value, ["interval", "seedX", "matchRadius", "candidateId", "method", "residual", "confidence", "classification", "sourceGeneration"]) ||
      !record(value.interval) || !exact(value.interval, ["min", "max"]) ||
      typeof value.interval.min !== "number" || typeof value.interval.max !== "number" ||
      !Number.isFinite(value.interval.min) || !Number.isFinite(value.interval.max) ||
      value.interval.min >= value.interval.max || value.interval.max - value.interval.min > 1e6 ||
      typeof value.seedX !== "number" || !Number.isFinite(value.seedX) ||
      value.seedX < value.interval.min || value.seedX > value.interval.max ||
      typeof value.matchRadius !== "number" || !Number.isFinite(value.matchRadius) ||
      value.matchRadius <= 0 || value.matchRadius > (value.interval.max - value.interval.min) / 4 ||
      typeof value.candidateId !== "string" || value.candidateId.length < 8 || value.candidateId.length > 160 ||
      !["sample", "bracket-bisection", "minimum-absolute-residual"].includes(String(value.method)) ||
      typeof value.residual !== "number" || !Number.isFinite(value.residual) || value.residual < 0 ||
      !["numerical", "heuristic"].includes(String(value.confidence)) ||
      ![null, "crossing", "tangent-possible"].includes(value.classification as null) ||
      !record(value.sourceGeneration) || !exact(value.sourceGeneration, ["documentId", "revision", "structuralHash", "generation"])) return false;
  const generation = value.sourceGeneration;
  return typeof generation.documentId === "string" && generation.documentId.length > 0 && generation.documentId.length <= 160 &&
    typeof generation.structuralHash === "string" && generation.structuralHash.length > 0 && generation.structuralHash.length <= 160 &&
    Number.isSafeInteger(generation.revision) && Number(generation.revision) >= 0 &&
    Number.isSafeInteger(generation.generation) && Number(generation.generation) >= 0;
};

/** Validates only persisted intent. A source edit may leave an anchor outside its new domain; resolution marks it unavailable. */
export function validateGraph2DConstructionSet(value: unknown, sources: readonly Graph2DGraphObject[]): string[] {
  if (!record(value) || !exact(value, ["version", "objects"]) || value.version !== GRAPH2D_CONSTRUCTION_VERSION ||
      !Array.isArray(value.objects) || value.objects.length > GRAPH2D_MAX_CONSTRUCTIONS)
    return ["Invalid Graph construction set version or size."];
  const errors: string[] = [];
  const objects = value.objects as unknown[];
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const indexById = new Map<string, number>();
  for (const [index, item] of objects.entries()) {
    if (!record(item) || !exact(item, ["id", "kind", "label", "inputs", "anchor", "style", "requiredCapability"]) ||
        !validId(item.id) || !validLabel(item.label) || !validStyle(item.style) ||
        !["point-on-curve", "tangent", "normal", "root", "minimum", "maximum", "intersection"].includes(String(item.kind)) ||
        item.requiredCapability !== (["root", "minimum", "maximum", "intersection"].includes(String(item.kind)) ?
          GRAPH2D_CANDIDATE_CONSTRUCTIONS_CAPABILITY : GRAPH2D_CONSTRUCTIONS_CAPABILITY) ||
        !Array.isArray(item.inputs) || item.inputs.length !== (item.kind === "intersection" ? 2 : 1) ||
        !item.inputs.every(validInput)) {
      errors.push(`Invalid Graph construction at index ${index}.`); continue;
    }
    if (indexById.has(item.id) || sourceById.has(item.id)) errors.push(`Duplicate Graph construction ID ${item.id}.`);
    indexById.set(item.id, index);
    const input = item.inputs[0];
    if (item.kind === "point-on-curve") {
      const source = input.kind === "source" ? sourceById.get(input.objectId) : undefined;
      if (!source || sourceParameter(source) === null) errors.push(`Point construction ${item.id} needs a local curve source.`);
      if (!record(item.anchor) || !exact(item.anchor, ["parameter", "value"]) ||
          item.anchor.parameter !== (source ? sourceParameter(source) : null) ||
          typeof item.anchor.value !== "number" || !Number.isFinite(item.anchor.value) ||
          Math.abs(item.anchor.value) > 1e12)
        errors.push(`Point construction ${item.id} has an invalid parameter anchor.`);
    } else if (["root", "minimum", "maximum", "intersection"].includes(String(item.kind))) {
      const sourcesForCandidate = item.inputs as Graph2DConstructionSourceInput[];
      if (sourcesForCandidate.some(input => input.kind !== "source" || sourceById.get(input.objectId)?.kind !== "explicit-cartesian") ||
          new Set(sourcesForCandidate.map(input => input.objectId)).size !== sourcesForCandidate.length)
        errors.push(`Candidate construction ${item.id} needs distinct local explicit sources.`);
      if (!validCandidateAnchor(item.anchor) ||
          (item.kind === "intersection") !== (record(item.anchor) && item.anchor.classification !== null))
        errors.push(`Candidate construction ${item.id} has invalid matching provenance.`);
    } else {
      const dependency = input.kind === "construction" ? objects[indexById.get(input.objectId) ?? -1] : undefined;
      // Forward references are checked below after the full ID table is known.
      if (input.kind !== "construction" || item.anchor !== null)
        errors.push(`Line construction ${item.id} needs a point construction input and no anchor.`);
      if (dependency && record(dependency) && dependency.kind !== "point-on-curve")
        errors.push(`Line construction ${item.id} must depend on a point construction.`);
    }
  }
  const dependencies = new Map<string, string[]>();
  for (const item of objects) {
    if (!record(item) || !validId(item.id) || !Array.isArray(item.inputs) || !validInput(item.inputs[0])) continue;
    const input = item.inputs[0];
    if (input.kind !== "construction") continue;
    if (!indexById.has(input.objectId)) errors.push(`Construction ${item.id} references a missing local construction.`);
    else {
      dependencies.set(item.id, [input.objectId]);
      if (indexById.get(input.objectId)! >= indexById.get(item.id)!)
        errors.push(`Construction ${item.id} is not ordered after its dependency.`);
      const dependency = objects[indexById.get(input.objectId)!];
      if (item.kind !== "point-on-curve" && record(dependency) && dependency.kind !== "point-on-curve")
        errors.push(`Line construction ${item.id} must depend on a point construction.`);
    }
  }
  const visiting = new Set<string>(), depths = new Map<string, number>();
  let cycle = false;
  const depth = (id: string): number => {
    if (visiting.has(id)) { cycle = true; return 0; }
    if (depths.has(id)) return depths.get(id)!;
    visiting.add(id);
    const result = 1 + Math.max(0, ...(dependencies.get(id) ?? []).map(depth));
    visiting.delete(id); depths.set(id, result);
    return result;
  };
  for (const id of indexById.keys()) if (depth(id) > GRAPH2D_MAX_CONSTRUCTION_DEPTH)
    errors.push(`Construction ${id} exceeds dependency depth ${GRAPH2D_MAX_CONSTRUCTION_DEPTH}.`);
  if (cycle) errors.push("Graph construction dependency cycle.");
  return [...new Set(errors)];
}

export function nextGraph2DConstructionId(source: Graph2DSource): string {
  const used = new Set(source.constructions?.objects.map(item => item.id) ?? []);
  for (let serial = 1; serial <= 999999; serial++) if (!used.has(`construction_${serial}`)) return `construction_${serial}`;
  throw new TypeError("Graph construction ID limit reached.");
}

/** Pure intent edit. Deletion of an input is explicit: remove dependents first. */
export function applyGraph2DConstructionAction(source: Graph2DSource, action: Graph2DConstructionAction): Graph2DSource {
  const objects = [...(source.constructions?.objects ?? [])];
  if (action.type === "create") {
    if (objects.some(item => item.id === action.object.id)) throw new TypeError("Graph construction ID already exists.");
    objects.push(action.object);
  } else if (action.type === "update") {
    const index = objects.findIndex(item => item.id === action.object.id);
    if (index < 0) throw new TypeError("Graph construction does not exist.");
    objects[index] = action.object;
  } else {
    const index = objects.findIndex(item => item.id === action.objectId);
    if (index < 0) throw new TypeError("Graph construction does not exist.");
    if (objects.some(item => item.inputs.some(input => input.kind === "construction" && input.objectId === action.objectId)))
      throw new TypeError("Remove dependent Graph constructions first.");
    objects.splice(index, 1);
  }
  const next: Graph2DSource = objects.length ? { ...source, constructions: { version: GRAPH2D_CONSTRUCTION_VERSION, objects } } :
    (({ constructions: _removed, ...remaining }) => remaining)(source);
  const errors = next.constructions ? validateGraph2DConstructionSet(next.constructions, next.objects) : [];
  if (errors.length) throw new TypeError(errors.join(" "));
  if (action.type !== "delete" && action.object.kind === "point-on-curve") {
    const sourceObject = source.objects.find(item => item.id === action.object.inputs[0]?.objectId);
    if (!sourceObject || !("domain" in sourceObject)) throw new TypeError("Construction source is unavailable.");
    const { min, max, includeMin, includeMax } = sourceObject.domain;
    const value = action.object.anchor.value;
    if (value < min || value > max || value === min && !includeMin || value === max && !includeMax)
      throw new TypeError("Construction anchor must lie inside the authored source domain.");
  }
  return next;
}
