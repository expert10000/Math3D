import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DProbe } from "./graph2dDocument";
import { differentiateGraph2DExpression, numericalGraph2DDerivative,
  GRAPH2D_DERIVATIVE_TOLERANCE, type Graph2DDerivativeMethod } from "./graph2dDerivatives";
import type { Graph2DLineOverlay } from "./graph2dDifferential";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { evaluateGraph2DPolar } from "./graph2dPolar";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_POLAR_DIFFERENTIAL_ALGORITHM_VERSION = "1" as const;
export type Graph2DPolarLocalDifferential = Readonly<{
  objectId: string; probe: Graph2DProbe; source: ScientificSourceGeneration; probeGeneration: string;
  state: "regular" | "singular" | "undefined" | "unresolved";
  point: Readonly<{ x: number; y: number }> | null;
  theta: number; signedRadius: number | null; radiusFirst: number | null; radiusSecond: number | null;
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
  structuralHash({ source, objectId: probe.objectId, x: probe.x, y: probe.y, theta: probe.parameter });

/** Analyze a committed polar probe, or a caller-supplied angle on a selected polar source. */
export const analyzeGraph2DPolarLocalDifferential = (document: Graph2DDocument): Graph2DPolarLocalDifferential | null => {
  const probe = document.selection.probe;
  if (!probe || !document.selection.objectId || probe.objectId !== document.selection.objectId || !Number.isFinite(probe.parameter)) return null;
  const object = document.source.objects.find(entry => entry.id === probe.objectId);
  if (!object || object.kind !== "polar") return null;
  const theta = probe.parameter!;
  const started = Date.now();
  const source = sourceGeneration(document), probeGeneration = probeKey(source, probe);
  const diagnostics: { code: string; message: string }[] = [];
  const variables = Object.fromEntries(document.source.variables.map(entry => [entry.name, entry.value]));
  const polarPoint = evaluateGraph2DPolar(object, variables, theta);
  const point = polarPoint ? { x: polarPoint.x, y: polarPoint.y } : null;
  let state: Graph2DPolarLocalDifferential["state"] = "unresolved";
  let radiusFirst: number | null = null, radiusSecond: number | null = null;
  let tangentMethod: Graph2DDerivativeMethod = "unavailable", curvatureMethod: Graph2DDerivativeMethod = "unavailable";
  if (!polarPoint) {
    state = "undefined";
    diagnostics.push({ code: "undefined-point", message: "Angle is outside the authored domain or the radius is undefined." });
  } else if (Math.hypot(probe.x - polarPoint.x, probe.y - polarPoint.y) > 1e-8 * Math.max(1, Math.abs(polarPoint.radius))) {
    diagnostics.push({ code: "stale-probe", message: "Stored probe does not match the current polar source." });
  } else {
    const derivative = (order: 1 | 2): { value: number | null; method: Graph2DDerivativeMethod } => {
      const symbolic = differentiateGraph2DExpression(object.rExpression.ast, order, "theta");
      if (symbolic.ok) {
        const value = evaluateGraph2DExpression(symbolic.ast, { ...variables, theta });
        if (value.ok) return { value: value.value, method: "symbolic-rules" };
      }
      const numerical = numericalGraph2DDerivative(object.rExpression.ast, variables, object.domain,
        theta, order, GRAPH2D_DERIVATIVE_TOLERANCE, "theta");
      if ("diagnostic" in numerical) {
        diagnostics.push(numerical.diagnostic);
        return { value: null, method: "unavailable" };
      }
      return { value: numerical.value, method: "finite-difference" };
    };
    const first = derivative(1), second = derivative(2);
    radiusFirst = first.value; radiusSecond = second.value;
    tangentMethod = first.method;
    curvatureMethod = first.method === "unavailable" || second.method === "unavailable" ? "unavailable" :
      first.method === "symbolic-rules" && second.method === "symbolic-rules" ? "symbolic-rules" : "finite-difference";
    if (radiusFirst === null) diagnostics.push({ code: "tangent-unresolved", message: "A finite radius derivative could not be established." });
    else if (Math.hypot(polarPoint.radius, radiusFirst) <= 1e-12 * Math.max(1, Math.abs(polarPoint.radius), Math.abs(radiusFirst))) {
      state = "singular";
      diagnostics.push({ code: "zero-speed", message: "The polar parameterization has zero speed at this angle; tangent and curvature are unavailable." });
    } else state = "regular";
  }
  const radius = polarPoint?.radius ?? null;
  const speed = state === "regular" && radius !== null && radiusFirst !== null ? Math.hypot(radius, radiusFirst) : null;
  const dx = speed !== null && radius !== null && radiusFirst !== null ? radiusFirst * Math.cos(theta) - radius * Math.sin(theta) : null;
  const dy = speed !== null && radius !== null && radiusFirst !== null ? radiusFirst * Math.sin(theta) + radius * Math.cos(theta) : null;
  const curvatureValue = speed !== null && radius !== null && radiusFirst !== null && radiusSecond !== null ?
    (radius * radius + 2 * radiusFirst * radiusFirst - radius * radiusSecond) / (speed ** 3) : NaN;
  const curvature = Number.isFinite(curvatureValue) ? curvatureValue : null;
  if (state === "regular" && curvature === null)
    diagnostics.push({ code: "curvature-unresolved", message: "A stable second radius derivative or curvature could not be established." });
  if (curvature === null) curvatureMethod = "unavailable";
  const visible = document.display.objects.find(entry => entry.objectId === object.id)?.visible === true;
  if (!visible) diagnostics.push({ code: "hidden-object", message: "The polar curve is hidden, so differential overlays are not displayed." });
  const tangent = point && dx !== null && dy !== null ?
    `(${formatted(point.x)}, ${formatted(point.y)}) + s(${formatted(dx)}, ${formatted(dy)})` : null;
  const normal = point && dx !== null && dy !== null ?
    `(${formatted(point.x)}, ${formatted(point.y)}) + s(${formatted(-dy)}, ${formatted(dx)})` : null;
  const overlays: Graph2DLineOverlay[] = point && dx !== null && dy !== null && visible ? [
    { artifactId: `graph2d.polar-differential.${probeGeneration.slice(7)}.tangent`, kind: "tangent",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: dx, y: dy } },
    { artifactId: `graph2d.polar-differential.${probeGeneration.slice(7)}.normal`, kind: "normal",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: -dy, y: dx } },
  ] : [];
  const publication = createAnalysisResultEnvelope({
    resultId: `graph2d.polar-local-differential.v${GRAPH2D_POLAR_DIFFERENTIAL_ALGORITHM_VERSION}.${probeGeneration.slice(7)}`,
    status: state === "regular" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: "graph2d.polar-local-differential", algorithm: "polar-radius-derivatives-cartesian-curvature",
      algorithmVersion: GRAPH2D_POLAR_DIFFERENTIAL_ALGORITHM_VERSION,
      parameters: { objectId: object.id, theta, probeGeneration, domain: object.domain } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: GRAPH2D_DERIVATIVE_TOLERANCE } },
      engine: { name: "math3d-core", version: GRAPH2D_POLAR_DIFFERENTIAL_ALGORITHM_VERSION },
      elapsedMs: Math.max(0, Date.now() - started) },
    summary: { state, theta, signedRadius: radius, x: point?.x ?? null, y: point?.y ?? null,
      radiusFirst, radiusSecond, speed, curvature, curvatureConvention: "signed-for-increasing-theta",
      tangent, normal, tangentMethod, curvatureMethod, probeGeneration },
    warnings: curvatureMethod === "finite-difference" || tangentMethod === "finite-difference" ?
      ["Finite differences are approximate and have no certified error bound."] : [],
    diagnostics: diagnostics.map(entry => ({ ...entry, severity: "warning" as const })), artifacts: [],
  });
  return { objectId: object.id, probe, source, probeGeneration, state, point, theta, signedRadius: radius,
    radiusFirst, radiusSecond, speed, curvature, tangent, normal, tangentMethod, curvatureMethod,
    overlays, diagnostics, publication };
};

export const isGraph2DPolarLocalDifferentialCurrent = (analysis: Graph2DPolarLocalDifferential, document: Graph2DDocument): boolean => {
  const probe = document.selection.probe;
  return !!probe && document.selection.objectId === analysis.objectId && probe.objectId === analysis.objectId &&
    document.display.objects.find(entry => entry.objectId === analysis.objectId)?.visible === true &&
    sourceGeneration(document).documentId === analysis.source.documentId &&
    document.identity.revision === analysis.source.revision &&
    document.identity.structuralHash === analysis.source.structuralHash &&
    probeKey(analysis.source, probe) === analysis.probeGeneration;
};
