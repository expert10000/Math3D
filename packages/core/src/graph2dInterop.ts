import { createCurveDocument, type CurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createDocumentRelation, type DocumentRelation } from "./documentRelations";
import type { CanonicalJsonValue, StableDocumentId } from "./documentIdentity";
import type { Graph2DDocument, Graph2DExplicitObject, Graph2DParametricObject } from "./graph2dDocument";
import { viewerSourceFromDocument } from "./viewerProvenance";

export type Graph2DCurvePromotionSource = Graph2DExplicitObject | Graph2DParametricObject;
export type Graph2DPromotionTrace = Readonly<{
  sourceDocumentId: StableDocumentId;
  sourceRevision: number;
  sourceObjectId: string;
  targetDocumentId: StableDocumentId;
  operation: "graph2d.promote-curve";
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
