import { createAnalysisResultEnvelope, type AnalysisResultEnvelope } from "./analysisResults";
import { structuralHash } from "./documentIdentity";
import type { Graph2DDocument, Graph2DProbe } from "./graph2dDocument";
import { analyzeGraph2DDerivatives, type Graph2DDerivativeEstimate } from "./graph2dDerivatives";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { resolveGraph2DViewport, type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";
import type { ScientificSourceGeneration } from "./scientificJobs";

export const GRAPH2D_DIFFERENTIAL_ALGORITHM_VERSION = "1" as const;
export type Graph2DLineOverlay = Readonly<{
  artifactId: string;
  kind: "tangent" | "normal";
  source: ScientificSourceGeneration;
  probeGeneration: string;
  objectId: string;
  anchor: Readonly<{ x: number; y: number }>;
  direction: Readonly<{ x: number; y: number }>;
}>;
export type Graph2DLineEquation = Readonly<{ equation: string; slope: number | null }>;
export type Graph2DLocalDifferential = Readonly<{
  objectId: string;
  probe: Graph2DProbe;
  source: ScientificSourceGeneration;
  probeGeneration: string;
  state: "differentiable" | "nondifferentiable" | "undefined" | "unresolved";
  point: Readonly<{ x: number; y: number }> | null;
  slope: number | null;
  slopeMethod: Graph2DDerivativeEstimate["method"];
  tangent: Graph2DLineEquation | null;
  normal: Graph2DLineEquation | null;
  overlays: readonly Graph2DLineOverlay[];
  derivatives: readonly [Graph2DDerivativeEstimate, Graph2DDerivativeEstimate];
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
  publication: AnalysisResultEnvelope;
}>;

const sourceGeneration = (document: Graph2DDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id, revision: document.identity.revision,
  structuralHash: document.identity.structuralHash, generation: document.identity.revision,
});
const probeKey = (source: ScientificSourceGeneration, probe: Graph2DProbe): string =>
  structuralHash({ source, objectId: probe.objectId, x: probe.x, y: probe.y });
const formatted = (value: number): string => String(Number(value.toPrecision(8)));

/** Analyze only a committed probe; every transient overlay carries exact source and probe generations. */
export const analyzeGraph2DLocalDifferential = (document: Graph2DDocument): Graph2DLocalDifferential | null => {
  const probe = document.selection.probe;
  if (!probe || !document.selection.objectId || probe.objectId !== document.selection.objectId) return null;
  const object = document.source.objects.find((entry) => entry.id === probe.objectId);
  if (!object || object.kind !== "explicit-cartesian") return null;
  const visible = document.display.objects.find((entry) => entry.objectId === object.id)?.visible === true;
  const started = Date.now();
  const source = sourceGeneration(document);
  const probeGeneration = probeKey(source, probe);
  const derivatives = analyzeGraph2DDerivatives(document, object.id, probe.x);
  const variables = Object.fromEntries(document.source.variables.map((entry) => [entry.name, entry.value]));
  const evaluated = evaluateGraph2DExpression(object.expression.ast, { ...variables, x: probe.x });
  const diagnostics: { code: string; message: string }[] = [];
  const inDomain = probe.x > object.domain.min && probe.x < object.domain.max ||
    probe.x === object.domain.min && object.domain.includeMin || probe.x === object.domain.max && object.domain.includeMax;
  let state: Graph2DLocalDifferential["state"] = "unresolved";
  if (!inDomain || !evaluated.ok) {
    state = "undefined";
    diagnostics.push({ code: "undefined-point", message: !inDomain ? "Probe is outside the function domain." : evaluated.ok ? "" : evaluated.diagnostic.message });
  } else if (Math.abs(evaluated.value - probe.y) > 1e-9 * Math.max(1, Math.abs(evaluated.value))) {
    diagnostics.push({ code: "stale-probe", message: "Stored probe does not match the current source expression." });
  } else if (derivatives[0].status === "numerical" && derivatives[0].value !== null) state = "differentiable";
  else if (derivatives[0].diagnostics.some((entry) => entry.code === "nondifferentiable")) state = "nondifferentiable";
  else diagnostics.push({ code: "derivative-unresolved", message: "A finite first derivative could not be established at this probe." });
  const point = inDomain && evaluated.ok ? { x: probe.x, y: evaluated.value } : null;
  const slope = state === "differentiable" ? derivatives[0].value : null;
  const tangent: Graph2DLineEquation | null = point && slope !== null ? {
    equation: `y - (${formatted(point.y)}) = ${formatted(slope)}(x - (${formatted(point.x)}))`, slope,
  } : null;
  const candidateNormalSlope = slope !== null && slope !== 0 ? -1 / slope : null;
  const normalSlope = candidateNormalSlope !== null && Number.isFinite(candidateNormalSlope) ? candidateNormalSlope : null;
  const normal: Graph2DLineEquation | null = point && slope !== null ? {
    equation: slope === 0 ? `x = ${formatted(point.x)}` :
      normalSlope === null ? `x - (${formatted(point.x)}) = ${formatted(-slope)}(y - (${formatted(point.y)}))` :
        `y - (${formatted(point.y)}) = ${formatted(normalSlope)}(x - (${formatted(point.x)}))`,
    slope: normalSlope,
  } : null;
  if (!visible) diagnostics.push({ code: "hidden-object", message: "The function is hidden, so differential overlays are not displayed." });
  const overlays: Graph2DLineOverlay[] = point && slope !== null && visible ? [
    { artifactId: `graph2d.local-differential.${probeGeneration.slice(7)}.tangent`, kind: "tangent",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: 1, y: slope } },
    { artifactId: `graph2d.local-differential.${probeGeneration.slice(7)}.normal`, kind: "normal",
      source, probeGeneration, objectId: object.id, anchor: point, direction: { x: -slope, y: 1 } },
  ] : [];
  const publication = createAnalysisResultEnvelope({
    resultId: `graph2d.local-differential.${probeGeneration.slice(7)}`,
    status: state === "differentiable" ? "numerical" : "unsupported",
    provenance: { source, operation: { type: "graph2d.local-differential", algorithm: "local-derivative-and-perpendicular",
      algorithmVersion: GRAPH2D_DIFFERENTIAL_ALGORITHM_VERSION,
      parameters: { objectId: object.id, x: probe.x, y: probe.y, probeGeneration } },
      numericContext: { precision: { binaryBits: 53 }, tolerance: { absolute: derivatives[0].tolerance } },
      engine: { name: "math3d-core", version: GRAPH2D_DIFFERENTIAL_ALGORITHM_VERSION }, elapsedMs: Math.max(0, Date.now() - started) },
    summary: { state, x: probe.x, y: point?.y ?? null, slope, slopeMethod: derivatives[0].method,
      tangent: tangent?.equation ?? null, normal: normal?.equation ?? null, probeGeneration },
    warnings: state === "differentiable" && derivatives[0].method === "finite-difference" ?
      ["The slope comes from finite differences and has an estimated, uncertified error."] : [],
    diagnostics: diagnostics.map((entry) => ({ code: entry.code, severity: "warning" as const, message: entry.message })),
    artifacts: [],
  });
  return { objectId: object.id, probe, source, probeGeneration, state, point, slope,
    slopeMethod: derivatives[0].method, tangent, normal, overlays, derivatives, diagnostics, publication };
};

export const isGraph2DLocalDifferentialCurrent = (analysis: Graph2DLocalDifferential, document: Graph2DDocument): boolean => {
  const probe = document.selection.probe;
  const visible = document.display.objects.find((entry) => entry.objectId === analysis.objectId)?.visible === true;
  return !!probe && visible && document.selection.objectId === analysis.objectId && probe.objectId === analysis.objectId &&
    sourceGeneration(document).documentId === analysis.source.documentId &&
    document.identity.revision === analysis.source.revision &&
    document.identity.structuralHash === analysis.source.structuralHash &&
    probeKey(analysis.source, probe) === analysis.probeGeneration;
};

/** Clip an infinite world-space line to the resolved viewport without persisting screen coordinates. */
export const clipGraph2DLineOverlay = (
  overlay: Graph2DLineOverlay, viewport: Graph2DViewport, size: Graph2DScreenSize,
): readonly [Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>] | null => {
  const bounds = resolveGraph2DViewport(viewport, size);
  let minT = Number.NEGATIVE_INFINITY, maxT = Number.POSITIVE_INFINITY;
  for (const [origin, direction, minimum, maximum] of [
    [overlay.anchor.x, overlay.direction.x, bounds.xMin, bounds.xMax],
    [overlay.anchor.y, overlay.direction.y, bounds.yMin, bounds.yMax],
  ] as const) {
    if (!Number.isFinite(origin) || !Number.isFinite(direction)) return null;
    if (direction === 0) { if (origin < minimum || origin > maximum) return null; continue; }
    const a = (minimum - origin) / direction, b = (maximum - origin) / direction;
    minT = Math.max(minT, Math.min(a, b)); maxT = Math.min(maxT, Math.max(a, b));
    if (minT > maxT) return null;
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
  const point = (t: number) => ({ x: Math.max(bounds.xMin, Math.min(bounds.xMax, overlay.anchor.x + t * overlay.direction.x)),
    y: Math.max(bounds.yMin, Math.min(bounds.yMax, overlay.anchor.y + t * overlay.direction.y)) });
  return [point(minT), point(maxT)];
};
