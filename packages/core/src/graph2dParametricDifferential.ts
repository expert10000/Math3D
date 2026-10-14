import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DProbe } from "./graph2dDocument";
import { differentiateGraph2DExpression, numericalGraph2DDerivative,
  GRAPH2D_DERIVATIVE_TOLERANCE, type Graph2DDerivativeMethod } from "./graph2dDerivatives";
import type { Graph2DLineOverlay } from "./graph2dDifferential";
import { evaluateGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";
import { evaluateGraph2DParametric } from "./graph2dParametric";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_PARAMETRIC_DIFFERENTIAL_ALGORITHM_VERSION = "1" as const;
export type Graph2DParametricLocalDifferential = Readonly<{
  objectId: string; probe: Graph2DProbe; source: ScientificSourceGeneration; probeGeneration: string;
  state: "regular" | "singular" | "undefined" | "unresolved";
  point: Readonly<{ x: number; y: number }> | null; parameter: number;
  xFirst: number | null; yFirst: number | null; xSecond: number | null; ySecond: number | null;
  speed: number | null; curvature: number | null;
  tangent: string | null; normal: string | null;
  tangentMethod: Graph2DDerivativeMethod; curvatureMethod: Graph2DDerivativeMethod;
  overlays: readonly Graph2DLineOverlay[];
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
  publication: AnalysisResultEnvelope;
}>;

const sourceGeneration = (document: Graph2DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const formatted = (value: number): string => String(Number(value.toPrecision(8)));
const probeKey = (source: ScientificSourceGeneration, probe: Graph2DProbe): string =>
  structuralHash({ source, objectId: probe.objectId, x: probe.x, y: probe.y, t: probe.parameter });

/** Analyze a committed parametric probe using authored x(t) and y(t), never plotted samples. */
export const analyzeGraph2DParametricLocalDifferential = (document: Graph2DDocument): Graph2DParametricLocalDifferential | null => {
  const probe = document.selection.probe;
  if (!probe || !document.selection.objectId || probe.objectId !== document.selection.objectId || !Number.isFinite(probe.parameter)) return null;
  const object = document.source.objects.find(entry => entry.id === probe.objectId);
  if (!object || object.kind !== "parametric") return null;
  const parameter = probe.parameter!;
  const started = Date.now();
  const source = sourceGeneration(document), probeGeneration = probeKey(source, probe);
  const diagnostics: { code: string; message: string }[] = [];
  const variables = Object.fromEntries(document.source.variables.map(entry => [entry.name, entry.value]));
  const evaluated = evaluateGraph2DParametric(object, variables, parameter);
  const point = evaluated ? { x: evaluated.x, y: evaluated.y } : null;
  let state: Graph2DParametricLocalDifferential["state"] = "unresolved";
  let xFirst: number | null = null, yFirst: number | null = null, xSecond: number | null = null, ySecond: number | null = null;
  let tangentMethod: Graph2DDerivativeMethod = "unavailable", curvatureMethod: Graph2DDerivativeMethod = "unavailable";
  if (!evaluated) {
    state = "undefined";
    diagnostics.push({ code: "undefined-point", message: "Parameter is outside the authored domain or a coordinate is undefined." });
  } else if (Math.hypot(probe.x - evaluated.x, probe.y - evaluated.y) > 1e-8 * Math.max(1, Math.hypot(evaluated.x, evaluated.y))) {
    diagnostics.push({ code: "stale-probe", message: "Stored probe does not match the current parametric source." });
  } else {
    const derivative = (ast: Graph2DExpressionAst, coordinate: "x" | "y", order: 1 | 2):
      { value: number | null; method: Graph2DDerivativeMethod } => {
      const symbolic = differentiateGraph2DExpression(ast, order, "t");
      if (symbolic.ok) {
        const value = evaluateGraph2DExpression(symbolic.ast, { ...variables, t: parameter });
        if (value.ok) return { value: value.value, method: "symbolic-rules" };
      }
      const numerical = numericalGraph2DDerivative(ast, variables, object.domain, parameter, order,
        GRAPH2D_DERIVATIVE_TOLERANCE, "t");
      if ("diagnostic" in numerical) {
        diagnostics.push({ code: `${coordinate}-${numerical.diagnostic.code}`, message: `${coordinate}(t): ${numerical.diagnostic.message}` });
        return { value: null, method: "unavailable" };
      }
      return { value: numerical.value, method: "finite-difference" };
    };
    const dx = derivative(object.xExpression.ast, "x", 1), dy = derivative(object.yExpression.ast, "y", 1);
    const ddx = derivative(object.xExpression.ast, "x", 2), ddy = derivative(object.yExpression.ast, "y", 2);
    xFirst = dx.value; yFirst = dy.value; xSecond = ddx.value; ySecond = ddy.value;
    tangentMethod = dx.method === "unavailable" || dy.method === "unavailable" ? "unavailable" :
      dx.method === "symbolic-rules" && dy.method === "symbolic-rules" ? "symbolic-rules" : "finite-difference";
    curvatureMethod = tangentMethod === "unavailable" || ddx.method === "unavailable" || ddy.method === "unavailable" ? "unavailable" :
      tangentMethod === "symbolic-rules" && ddx.method === "symbolic-rules" && ddy.method === "symbolic-rules" ?
        "symbolic-rules" : "finite-difference";
    if (xFirst === null || yFirst === null)
      diagnostics.push({ code: "tangent-unresolved", message: "Finite first derivatives could not be established for both coordinates." });
    else if (Math.hypot(xFirst, yFirst) <= 1e-12 * Math.max(1, Math.abs(xFirst), Math.abs(yFirst))) {
      state = "singular";
      diagnostics.push({ code: "zero-speed", message: "The parametric path has zero speed here; tangent and curvature are unavailable." });
    } else state = "regular";
  }
  const speed = state === "regular" && xFirst !== null && yFirst !== null ? Math.hypot(xFirst, yFirst) : null;
  const curvatureValue = speed !== null && xFirst !== null && yFirst !== null && xSecond !== null && ySecond !== null ?
    (xFirst * ySecond - yFirst * xSecond) / (speed ** 3) : NaN;
  const curvature = Number.isFinite(curvatureValue) ? curvatureValue : null;
  if (state === "regular" && curvature === null)
    diagnostics.push({ code: "curvature-unresolved", message: "Finite second derivatives or stable curvature could not be established." });
  if (curvature === null) curvatureMethod = "unavailable";
  const visible = document.display.objects.find(entry => entry.objectId === object.id)?.visible === true;
  if (!visible) diagnostics.push({ code: "hidden-object", message: "The parametric curve is hidden, so differential overlays are not displayed." });
  const tangent = point && speed !== null && xFirst !== null && yFirst !== null ?
    `(${formatted(point.x)}, ${formatted(point.y)}) + s(${formatted(xFirst)}, ${formatted(yFirst)})` : null;
  const normal = point && speed !== null && xFirst !== null && yFirst !== null ?
    `(${formatted(point.x)}, ${formatted(point.y)}) + s(${formatted(-yFirst)}, ${formatted(xFirst)})` : null;
  const overlays: Graph2DLineOverlay[] = point && speed !== null && xFirst !== null && yFirst !== null && visible ? [
    { artifactId: `graph2d.parametric-differential.${probeGeneration.slice(7)}.tangent`, kind: "tangent",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: xFirst, y: yFirst } },
    { artifactId: `graph2d.parametric-differential.${probeGeneration.slice(7)}.normal`, kind: "normal",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: -yFirst, y: xFirst } },
  ] : [];
  const publication = createAnalysisResultEnvelope({
    resultId: `graph2d.parametric-local-differential.v${GRAPH2D_PARAMETRIC_DIFFERENTIAL_ALGORITHM_VERSION}.${probeGeneration.slice(7)}`,
    status: state === "regular" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: "graph2d.parametric-local-differential", algorithm: "parametric-coordinate-derivatives-curvature",
      algorithmVersion: GRAPH2D_PARAMETRIC_DIFFERENTIAL_ALGORITHM_VERSION,
      parameters: { objectId: object.id, parameter, probeGeneration, domain: object.domain } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: GRAPH2D_DERIVATIVE_TOLERANCE } },
      engine: { name: "math3d-core", version: GRAPH2D_PARAMETRIC_DIFFERENTIAL_ALGORITHM_VERSION },
      elapsedMs: Math.max(0, Date.now() - started) },
    summary: { state, parameter, x: point?.x ?? null, y: point?.y ?? null, xFirst, yFirst, xSecond, ySecond,
      speed, curvature, curvatureConvention: "signed-for-increasing-t",
      tangent, normal, tangentMethod, curvatureMethod, probeGeneration },
    warnings: tangentMethod === "finite-difference" || curvatureMethod === "finite-difference" ?
      ["Finite differences are approximate and have no certified error bound."] : [],
    diagnostics: diagnostics.map(entry => ({ ...entry, severity: "warning" as const })), artifacts: [],
  });
  return { objectId: object.id, probe, source, probeGeneration, state, point, parameter,
    xFirst, yFirst, xSecond, ySecond, speed, curvature, tangent, normal, tangentMethod, curvatureMethod,
    overlays, diagnostics, publication };
};

export const isGraph2DParametricLocalDifferentialCurrent = (analysis: Graph2DParametricLocalDifferential, document: Graph2DDocument): boolean => {
  const probe = document.selection.probe;
  return !!probe && document.selection.objectId === analysis.objectId && probe.objectId === analysis.objectId &&
    document.display.objects.find(entry => entry.objectId === analysis.objectId)?.visible === true &&
    sourceGeneration(document).documentId === analysis.source.documentId &&
    document.identity.revision === analysis.source.revision &&
    document.identity.structuralHash === analysis.source.structuralHash &&
    probeKey(analysis.source, probe) === analysis.probeGeneration;
};
