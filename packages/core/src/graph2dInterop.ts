import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createDocumentRelation, evaluateDocumentRelationStatus, type DocumentRelation,
  type DocumentRelationStatus } from "./documentRelations";
import { advanceDocumentIdentity, type CanonicalJsonValue, type StableDocumentId } from "./documentIdentity";
import type { Graph2DDocument, Graph2DExplicitObject, Graph2DParametricObject } from "./graph2dDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";
import { createSurfaceDocument, type SurfaceDocument, type SurfaceDocumentSource } from "./surfaceDocument";

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

const curveSource = (object: Graph2DCurvePromotionSource): CurveDocumentSource => {
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
    dependencies: [],
  };
};

/** Creates a normal Curve document while preserving exact source expressions and endpoint intent. */
export const promoteGraph2DToCurve = (source: Graph2DDocument, objectId: string): Graph2DCurvePromotion => {
  const object = source.source.objects.find((entry): entry is Graph2DCurvePromotionSource =>
    entry.id === objectId && (entry.kind === "explicit-cartesian" || entry.kind === "parametric"));
  if (!object) throw new TypeError("Only explicit or parametric Graph2D objects can be promoted to Curve.");
  const document = createCurveDocument({ source: curveSource(object),
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
  if (!(["x", "y"] as const).includes(options.axis) || !(["positive", "negative"] as const).includes(options.orientation) ||
      !Number.isFinite(angleMin) || !Number.isFinite(angleMax) || angleMin >= angleMax || angleMax - angleMin > Math.PI * 2)
    throw new TypeError("Invalid revolution axis, orientation, or angular domain.");
  return { representation: "constructed",
    domain: { kind: "revolution", profile: { min: object.domain.min, max: object.domain.max,
      includeMin: object.domain.includeMin, includeMax: object.domain.includeMax }, angle: { min: angleMin, max: angleMax } },
    units: { length: "unitless", angle: "rad" }, orientation: { direction: options.orientation },
    definition: { familyId: "graph2d.revolution", expressions: profileExpressions(object),
      settings: { axis: options.axis, orientation: options.orientation }, sourceIds: [source.identity.id, object.id] },
    parameters: { axis: options.axis, angleMin, angleMax }, branchPolicy: null };
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
  if (options.direction.length !== 3 || options.direction.some((entry) => !Number.isFinite(entry)) ||
      directionLength === 0 || !Number.isFinite(options.length) || options.length <= 0 ||
      !(["none", "start", "end", "both"] as const).includes(options.caps))
    throw new TypeError("Invalid extrusion direction, length, or cap policy.");
  const direction = options.direction.map((entry) => entry / directionLength) as unknown as readonly [number, number, number];
  return { representation: "constructed",
    domain: { kind: "extrusion", profile: { min: object.domain.min, max: object.domain.max,
      includeMin: object.domain.includeMin, includeMax: object.domain.includeMax }, distance: { min: 0, max: options.length } },
    units: { length: "unitless" }, orientation: { direction },
    definition: { familyId: "graph2d.extrusion", expressions: profileExpressions(object),
      settings: { capPolicy: options.caps, length: options.length }, sourceIds: [source.identity.id, object.id] },
    parameters: { direction, length: options.length, capPolicy: options.caps }, branchPolicy: null };
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
    forkAt: currentSource.identity.structuralHash };
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
