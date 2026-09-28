import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createDocumentRelation, evaluateDocumentRelationStatus, type DocumentRelation,
  type DocumentRelationStatus } from "./documentRelations";
import { advanceDocumentIdentity, type CanonicalJsonValue, type StableDocumentId } from "./documentIdentity";
import type { Graph2DDocument, Graph2DExplicitObject, Graph2DParametricObject } from "./graph2dDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";
import { createSurfaceDocument, type SurfaceDocument, type SurfaceDocumentSource } from "./surfaceDocument";
import { evaluateGraph2DExpression } from "./graph2dExpression";

export type Graph2DCurvePromotionSource = Graph2DExplicitObject | Graph2DParametricObject;
export type Graph2DPromotionTrace = Readonly<{
  sourceDocumentId: StableDocumentId;
  sourceRevision: number;
  sourceObjectId: string;
  targetDocumentId: StableDocumentId;
  operation: "graph2d.promote-curve" | "graph2d.revolve-surface" | "graph2d.extrude-surface";
  expressionMap: Readonly<Record<string, string>>;
}>;
export type Graph2DCurvePromotion = Readonly<{
  document: CurveDocument;
  relation: DocumentRelation;
  trace: Graph2DPromotionTrace;
}>;

const curveSource = (object: Graph2DCurvePromotionSource, graph: Graph2DDocument): CurveDocumentSource => {
  const parameter = object.kind === "explicit-cartesian" ? "x" : "t";
  const expressions = object.kind === "explicit-cartesian" ? { x: "x", y: object.expression.source } :
    { x: object.xExpression.source, y: object.yExpression.source };
  return {
    representation: object.kind === "explicit-cartesian" ? "explicit" : "parametric",
    dimension: 2,
    domain: { parameter, min: object.domain.min, max: object.domain.max, closed: false, periodic: false },
    units: { position: "unitless", parameter: "unitless", angle: "rad" },
    orientation: { direction: "increasing-parameter" }, derivatives: {},
    definition: { familyId: `graph2d.${object.kind}`, expressions,
      settings: { includeMin: object.domain.includeMin, includeMax: object.domain.includeMax } },
    dependencies: graph.source.variables.map((entry) => ({ ...entry, kind: "parameter" })),
  };
};

/** Creates a normal Curve document while preserving exact source expressions and endpoint intent. */
export const promoteGraph2DToCurve = (source: Graph2DDocument, objectId: string): Graph2DCurvePromotion => {
  const object = source.source.objects.find((entry): entry is Graph2DCurvePromotionSource =>
    entry.id === objectId && (entry.kind === "explicit-cartesian" || entry.kind === "parametric"));
  if (!object) throw new TypeError("Only explicit or parametric Graph2D objects can be promoted to Curve.");
  const document = createCurveDocument({ source: curveSource(object, source),
    stableKey: { operation: "graph2d.promote-curve", sourceDocumentId: source.identity.id, sourceObjectId: object.id },
    metadata: { title: object.label } });
  const expressionMap = document.source.definition.expressions!;
  const parameters = { sourceObjectId: object.id, expressionMap,
    domain: object.domain } as CanonicalJsonValue;
  const relation = createDocumentRelation({ kind: "promoted-from", sources: [viewerSourceFromDocument(source)],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(document) },
    operation: "graph2d.promote-curve", parameters });
  return { document, relation, trace: { sourceDocumentId: source.identity.id,
    sourceRevision: source.identity.revision, sourceObjectId: object.id,
    targetDocumentId: document.identity.id, operation: "graph2d.promote-curve", expressionMap } };
};

export const locateGraph2DPromotionSource = (promotion: Pick<Graph2DCurvePromotion, "trace">) => ({
  documentId: promotion.trace.sourceDocumentId, revision: promotion.trace.sourceRevision,
  objectId: promotion.trace.sourceObjectId,
});

export const locateGraph2DPromotionTarget = (promotion: Pick<Graph2DCurvePromotion, "trace">) => ({
  documentId: promotion.trace.targetDocumentId,
});

export type Graph2DRevolveOptions = Readonly<{
  axis: "x" | "y";
  orientation: "positive" | "negative";
  angleMin?: number;
  angleMax?: number;
}>;
export type Graph2DSurfacePromotion = Readonly<{
  document: SurfaceDocument;
  relation: DocumentRelation;
  trace: Graph2DPromotionTrace;
}>;

const profileExpressions = (object: Graph2DCurvePromotionSource): Readonly<Record<string, string>> =>
  object.kind === "explicit-cartesian" ? { x: "x", y: object.expression.source } :
    { x: object.xExpression.source, y: object.yExpression.source };

export const previewGraph2DRevolution = (source: Graph2DDocument, objectId: string,
  options: Graph2DRevolveOptions): SurfaceDocumentSource => {
  const object = source.source.objects.find((entry): entry is Graph2DCurvePromotionSource =>
    entry.id === objectId && (entry.kind === "explicit-cartesian" || entry.kind === "parametric"));
  const angleMin = options.angleMin ?? 0, angleMax = options.angleMax ?? Math.PI * 2;
  if (!object) throw new TypeError("Revolution requires an explicit or parametric Graph2D profile.");
  validateGraph2DProfile(source, object);
  if (!(["x", "y"] as const).includes(options.axis) || !(["positive", "negative"] as const).includes(options.orientation) ||
      !Number.isFinite(angleMin) || !Number.isFinite(angleMax) || angleMin >= angleMax || angleMax - angleMin > Math.PI * 2)
    throw new TypeError("Invalid revolution axis, orientation, or angular domain.");
  return { representation: "constructed",
    domain: { kind: "revolution", profile: { min: object.domain.min, max: object.domain.max,
      includeMin: object.domain.includeMin, includeMax: object.domain.includeMax }, angle: { min: angleMin, max: angleMax } },
    units: { length: "unitless", angle: "rad" }, orientation: { direction: options.orientation },
    definition: { familyId: "graph2d.revolution", expressions: profileExpressions(object),
      settings: { axis: options.axis, orientation: options.orientation }, sourceIds: [source.identity.id, object.id] },
    parameters: { axis: options.axis, angleMin, angleMax, parameter: object.kind === "parametric" ? "t" : "x",
      variables: Object.fromEntries(source.source.variables.map((entry) => [entry.name, entry.value])) }, branchPolicy: null };
};

/** Validates the complete preview before creating either target or lineage. */
export const revolveGraph2DProfile = (source: Graph2DDocument, objectId: string,
  options: Graph2DRevolveOptions): Graph2DSurfacePromotion => {
  const surfaceSource = previewGraph2DRevolution(source, objectId, options);
  const object = source.source.objects.find((entry) => entry.id === objectId)!;
  const document = createSurfaceDocument({ source: surfaceSource,
    stableKey: { operation: "graph2d.revolve-surface", sourceDocumentId: source.identity.id, sourceObjectId: objectId },
    metadata: { title: `${object.label} revolution` } });
  const expressionMap = surfaceSource.definition.expressions!;
  const relation = createDocumentRelation({ kind: "promoted-from", sources: [viewerSourceFromDocument(source)],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(document) },
    operation: "graph2d.revolve-surface", parameters: { sourceObjectId: objectId, ...options,
      domain: surfaceSource.domain, expressionMap } as CanonicalJsonValue });
  return { document, relation, trace: { sourceDocumentId: source.identity.id, sourceRevision: source.identity.revision,
    sourceObjectId: objectId, targetDocumentId: document.identity.id,
    operation: "graph2d.revolve-surface", expressionMap } };
};

export type Graph2DExtrudeOptions = Readonly<{
  direction: readonly [number, number, number];
  length: number;
  caps: "none" | "start" | "end" | "both";
}>;

export const previewGraph2DExtrusion = (source: Graph2DDocument, objectId: string,
  options: Graph2DExtrudeOptions): SurfaceDocumentSource => {
  const object = source.source.objects.find((entry): entry is Graph2DCurvePromotionSource =>
    entry.id === objectId && (entry.kind === "explicit-cartesian" || entry.kind === "parametric"));
  const directionLength = Math.hypot(...options.direction);
  if (!object) throw new TypeError("Extrusion requires an explicit or parametric Graph2D profile.");
  const profile = validateGraph2DProfile(source, object);
  if (options.direction.length !== 3 || options.direction.some((entry) => !Number.isFinite(entry)) ||
      directionLength === 0 || !Number.isFinite(options.length) || options.length <= 0 ||
      !(["none", "start", "end", "both"] as const).includes(options.caps))
    throw new TypeError("Invalid extrusion direction, length, or cap policy.");
  if (!Number.isFinite(directionLength)) throw new TypeError("Invalid extrusion direction.");
  if (options.caps !== "none") {
    if (!object.domain.includeMin || !object.domain.includeMax)
      throw new TypeError("Caps require included profile endpoints.");
    validateGraph2DCapProfile(profile);
  }
  const direction = options.direction.map((entry) => entry / directionLength) as unknown as readonly [number, number, number];
  return { representation: "constructed",
    domain: { kind: "extrusion", profile: { min: object.domain.min, max: object.domain.max,
      includeMin: object.domain.includeMin, includeMax: object.domain.includeMax }, distance: { min: 0, max: options.length } },
    units: { length: "unitless" }, orientation: { direction },
    definition: { familyId: "graph2d.extrusion", expressions: profileExpressions(object),
      settings: { capPolicy: options.caps, length: options.length }, sourceIds: [source.identity.id, object.id] },
    parameters: { direction, length: options.length, capPolicy: options.caps, parameter: object.kind === "parametric" ? "t" : "x",
      variables: Object.fromEntries(source.source.variables.map((entry) => [entry.name, entry.value])) }, branchPolicy: null };
};

export const extrudeGraph2DProfile = (source: Graph2DDocument, objectId: string,
  options: Graph2DExtrudeOptions): Graph2DSurfacePromotion => {
  const surfaceSource = previewGraph2DExtrusion(source, objectId, options);
  const object = source.source.objects.find((entry) => entry.id === objectId)!;
  const document = createSurfaceDocument({ source: surfaceSource,
    stableKey: { operation: "graph2d.extrude-surface", sourceDocumentId: source.identity.id, sourceObjectId: objectId },
    metadata: { title: `${object.label} extrusion` } });
  const expressionMap = surfaceSource.definition.expressions!;
  const relation = createDocumentRelation({ kind: "promoted-from", sources: [viewerSourceFromDocument(source)],
    sourceOrder: "ordered", target: { type: "document", generation: viewerSourceFromDocument(document) },
    operation: "graph2d.extrude-surface", parameters: { sourceObjectId: objectId, direction: options.direction,
      length: options.length, capPolicy: options.caps, expressionMap } as CanonicalJsonValue });
  return { document, relation, trace: { sourceDocumentId: source.identity.id, sourceRevision: source.identity.revision,
    sourceObjectId: objectId, targetDocumentId: document.identity.id,
    operation: "graph2d.extrude-surface", expressionMap } };
};

export type Graph2DAnyPromotion = Graph2DCurvePromotion | Graph2DSurfacePromotion;
export type Graph2DPromotionGenerationComparison = Readonly<{
  status: "same" | "changed";
  capturedRevision: number;
  currentRevision: number;
  structuralChange: boolean;
}>;

export const graph2DPromotionStatus = (promotion: Graph2DAnyPromotion,
  currentSource: Graph2DDocument | null): DocumentRelationStatus =>
  currentSource?.identity.id === promotion.trace.sourceDocumentId &&
    !currentSource.source.objects.some((object) => object.id === promotion.trace.sourceObjectId) ? "unavailable" :
    evaluateDocumentRelationStatus(promotion.relation, (documentId) => currentSource?.identity.id === documentId ?
    viewerSourceFromDocument(currentSource) : null);

export const compareGraph2DPromotionGenerations = (promotion: Graph2DAnyPromotion,
  currentSource: Graph2DDocument): Graph2DPromotionGenerationComparison => {
  const captured = promotion.relation.sources[0]!;
  const same = captured.documentId === currentSource.identity.id && captured.revision === currentSource.identity.revision &&
    captured.structuralHash === currentSource.identity.structuralHash;
  return { status: same ? "same" : "changed", capturedRevision: captured.revision,
    currentRevision: currentSource.identity.revision, structuralChange: captured.structuralHash !== currentSource.identity.structuralHash };
};

/** Regeneration is explicit: replace advances the target generation; fork creates a new stable target id. */
export const regenerateGraph2DPromotion = (promotion: Graph2DAnyPromotion, currentSource: Graph2DDocument,
  mode: "replace" | "fork"): Graph2DAnyPromotion => {
  if (mode !== "replace" && mode !== "fork") throw new TypeError("Choose replace or fork.");
  if (mode === "replace" && isGraph2DPromotionTargetEdited(promotion))
    throw new TypeError("Target was independently edited. Fork to preserve its changes.");
  if (promotion.trace.sourceDocumentId !== currentSource.identity.id)
    throw new TypeError("The selected Graph2D document is not the promotion source.");
  const parameters = promotion.relation.parameters as Record<string, unknown>;
  let generated: Graph2DAnyPromotion;
  if (promotion.trace.operation === "graph2d.promote-curve") generated = promoteGraph2DToCurve(currentSource, promotion.trace.sourceObjectId);
  else if (promotion.trace.operation === "graph2d.revolve-surface") generated = revolveGraph2DProfile(currentSource,
    promotion.trace.sourceObjectId, { axis: parameters.axis as "x" | "y",
      orientation: parameters.orientation as "positive" | "negative",
      ...(typeof parameters.angleMin === "number" ? { angleMin: parameters.angleMin } : {}),
      ...(typeof parameters.angleMax === "number" ? { angleMax: parameters.angleMax } : {}) });
  else generated = extrudeGraph2DProfile(currentSource, promotion.trace.sourceObjectId, {
    direction: parameters.direction as unknown as readonly [number, number, number],
    length: parameters.length as number, caps: parameters.capPolicy as Graph2DExtrudeOptions["caps"] });

  const forkKey = { operation: generated.trace.operation, sourceDocumentId: currentSource.identity.id,
    sourceObjectId: generated.trace.sourceObjectId, forkOf: promotion.document.identity.id,
    forkAt: currentSource.identity.structuralHash, targetRevision: promotion.document.identity.revision };
  const document = generated.document.format === "math3d.curve-document" ?
    createCurveDocument({ source: generated.document.source,
      ...(mode === "replace" ? { identity: advanceDocumentIdentity(promotion.document.identity, generated.document.source) } : { stableKey: forkKey }),
      metadata: generated.document.metadata }) :
    createSurfaceDocument({ source: generated.document.source,
      ...(mode === "replace" ? { identity: advanceDocumentIdentity(promotion.document.identity, generated.document.source) } : { stableKey: forkKey }),
      metadata: generated.document.metadata });
  const relation = createDocumentRelation({ ...generated.relation,
    target: { type: "document", generation: viewerSourceFromDocument(document) } });
  const trace = { ...generated.trace, targetDocumentId: document.identity.id };
  return document.format === "math3d.curve-document" ? { document, relation, trace } : { document, relation, trace };
};

export const isGraph2DPromotionTargetEdited = (promotion: Graph2DAnyPromotion): boolean =>
  promotion.relation.target.type !== "document" ||
  promotion.relation.target.generation.revision !== promotion.document.identity.revision ||
  promotion.relation.target.generation.structuralHash !== promotion.document.identity.structuralHash;

/** Bounded validation keeps undefined and discontinuous profiles out of Surface construction. */
const validateGraph2DProfile = (graph: Graph2DDocument, object: Graph2DCurvePromotionSource) => {
  const variables = Object.fromEntries(graph.source.variables.map((entry) => [entry.name, entry.value]));
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index <= 1024; index += 1) {
    const fraction = index === 0 && !object.domain.includeMin ? 1e-8 :
      index === 1024 && !object.domain.includeMax ? 1 - 1e-8 : index / 1024;
    const parameter = object.domain.min + (object.domain.max - object.domain.min) * fraction;
    const bindings = { ...variables, [object.kind === "parametric" ? "t" : "x"]: parameter };
    const x = object.kind === "parametric" ? evaluateGraph2DExpression(object.xExpression.ast, bindings) : { ok: true, value: parameter };
    const y = evaluateGraph2DExpression(object.kind === "parametric" ? object.yExpression.ast : object.expression.ast, bindings);
    if (!x.ok || !y.ok || !Number.isFinite(x.value) || !Number.isFinite(y.value))
      throw new TypeError("Profile is undefined on its domain. Restrict the domain before promotion.");
    points.push({ x: x.value, y: y.value });
  }
  // Sharp jumps/poles are rejected relative to the sampled profile's typical step.
  const steps = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const median = [...steps].sort((a, b) => a - b)[steps.length >> 1]!;
  if (Math.max(...steps) > Math.max(1e-8, median * 1000))
    throw new TypeError("Profile contains a suspected discontinuity. Restrict the domain before promotion.");
  return points;
};

export const validateGraph2DCapProfile = (points: readonly { x: number; y: number }[]) => {
  if (points.length < 4 || points.length > 2048 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
    throw new TypeError("Invalid bounded cap profile.");
  const first = points[0]!, last = points.at(-1)!;
  const extent = Math.hypot(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)));
  const precision = Number.EPSILON * Math.max(...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) * 16;
  if (Math.hypot(first.x - last.x, first.y - last.y) > Math.max(precision, extent * 1e-8, Number.MIN_VALUE))
    throw new TypeError("Caps require a closed profile. Choose no caps for an open graph.");
  let sign = 0, turns = 0;
  const polygon = points.slice(0, -1);
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[(index + polygon.length - 1) % polygon.length]!, b = polygon[index]!, c = polygon[(index + 1) % polygon.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    turns += Math.atan2(cross, (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y));
    if (Math.abs(cross) > scale * 1e-12) { if (sign && Math.sign(cross) !== sign)
      throw new TypeError("Caps currently require a convex closed profile."); sign = Math.sign(cross); }
  }
  if (!sign || Math.abs(Math.abs(turns) - 2 * Math.PI) > 1e-4)
    throw new TypeError("Caps require a simple nondegenerate closed profile with one winding.");
};
