import { canonicalJsonStringify, evaluateGraph2DExpression, matchesScientificSourceGeneration,
  promoteGraph2DToCurve, viewerSourceFromDocument,
  type CurveDocument, type Graph2DDocument, type Graph2DExplicitObject, type Graph2DParametricObject,
  type Graph2DProbe, type Math3DProject } from "@math3d/core";
import type { CursorProjection, ProjectScientificCursor } from "../components/scientificCursor";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { curveParameterFrame } from "../curveAnalysis/curveCursor";

type Pair = Readonly<{ graph: Graph2DDocument; curve: CurveDocument;
  object: Graph2DExplicitObject | Graph2DParametricObject }>;

/** A promotion must still describe the exact current Graph and Curve inputs. */
export function currentGraphCurvePair(project: Math3DProject, graphId: string, curveId: string): Pair | null {
  const current = verifyMixedWorkspaceReplay(project.workspace);
  const graph = current.get(graphId), curve = current.get(curveId);
  if (graph?.format !== "math3d.graph2d-document" || curve?.format !== "math3d.curve-document") return null;
  const graphSource = viewerSourceFromDocument(graph), curveSource = viewerSourceFromDocument(curve);
  for (const relation of project.workspace.relations) {
    if (relation.kind !== "promoted-from" || relation.operation !== "graph2d.promote-curve" ||
        relation.status !== "current" || relation.sources.length !== 1 ||
        !matchesScientificSourceGeneration(relation.sources[0]!, graphSource) ||
        relation.target.type !== "document" || !matchesScientificSourceGeneration(relation.target.generation, curveSource)) continue;
    const objectId = (relation.parameters as { sourceObjectId?: unknown }).sourceObjectId;
    if (typeof objectId !== "string") continue;
    const object = graph.source.objects.find(item => item.id === objectId);
    if (!object || object.kind !== "explicit-cartesian" && object.kind !== "parametric") continue;
    const regenerated = promoteGraph2DToCurve(graph, objectId);
    if (canonicalJsonStringify(regenerated.document.source) === canonicalJsonStringify(curve.source))
      return { graph, curve, object };
  }
  return null;
}

/** Project a Curve parameter to the original Graph object; never infer a different object. */
export function projectCurveParameterToGraph(cursor: ProjectScientificCursor, project: Math3DProject,
  graphId: string, objectId: string): CursorProjection<Graph2DProbe> {
  if (cursor.sourceModule !== "curve" || cursor.resourceSha256 !== null || cursor.position.length !== 1)
    return { status: "incompatible-source", reason: "A saved Curve parameter cursor is required." };
  const pair = currentGraphCurvePair(project, graphId, cursor.source.documentId);
  if (!pair || pair.object.id !== objectId ||
      !matchesScientificSourceGeneration(cursor.source, viewerSourceFromDocument(pair.curve)) ||
      canonicalJsonStringify(cursor.frame) !== canonicalJsonStringify(curveParameterFrame(pair.curve)))
    return { status: "incompatible-source", reason: "Graph, Curve, object or parameter frame differs." };
  const t = cursor.position[0]!;
  const domain = pair.object.domain;
  if (!Number.isFinite(t) || t < domain.min || t > domain.max ||
      t === domain.min && !domain.includeMin || t === domain.max && !domain.includeMax)
    return { status: "outside", reason: "Curve parameter is outside the Graph object's domain." };
  const variables = Object.fromEntries(pair.graph.source.variables.map(item => [item.name, item.value]));
  const evaluate = (ast: Graph2DExplicitObject["expression"]["ast"]) =>
    evaluateGraph2DExpression(ast, { ...variables, [pair.curve.source.domain.parameter]: t });
  if (pair.object.kind === "explicit-cartesian") {
    const result = evaluate(pair.object.expression.ast);
    return result.ok && Number.isFinite(result.value) ?
      { status: "matched", value: { objectId, x: t, y: result.value } } :
      { status: "outside", reason: "Graph expression has no finite value at the Curve parameter." };
  }
  const x = evaluate(pair.object.xExpression.ast), y = evaluate(pair.object.yExpression.ast);
  return x.ok && y.ok && Number.isFinite(x.value) && Number.isFinite(y.value) ?
    { status: "matched", value: { objectId, x: x.value, y: y.value, parameter: t } } :
    { status: "outside", reason: "Parametric Graph has no finite point at the Curve parameter." };
}
