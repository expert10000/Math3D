import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createDocumentRelation, type DocumentRelation } from "./documentRelations";
import type { CanonicalJsonValue, StableDocumentId } from "./documentIdentity";
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
