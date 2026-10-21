import { complexAnalysisSourceHash, createComplexAnalysisDocument,
  type ComplexAnalysisDocument, type ComplexAnalysisStructuralSource, type ComplexPoint } from "./complexAnalysisDocument";
import { GRAPH2D_DOCUMENT_FORMAT, GRAPH2D_DOCUMENT_SCHEMA_VERSION, type Graph2DDocument } from "./graph2dDocument";
import { evaluateGraph2DParametric } from "./graph2dParametric";

export type Graph2DComplexContourOptions = Readonly<{ sampleCount: number; closure: "auto" | "open" | "closed" }>;
export type Graph2DComplexContourReview = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string; objectId: string }>;
  options: Graph2DComplexContourOptions; target: ComplexAnalysisDocument;
  endpointGap: number; closureTolerance: number; maximumSegmentLength: number;
  warnings: readonly string[];
}>;

/** Map a Graph parametric (x(t),y(t)) path to a sampled complex contour z(t)=x(t)+iy(t). */
export const reviewGraph2DComplexContour = (document: Graph2DDocument, objectId: string,
  options: Graph2DComplexContourOptions = { sampleCount: 257, closure: "auto" }): Graph2DComplexContourReview => {
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "parametric") throw new TypeError("Choose a parametric Graph path with real x(t) and imaginary y(t).");
  if (!object.domain.includeMin || !object.domain.includeMax)
    throw new TypeError("Complex contour promotion requires included parameter endpoints.");
  if (!Number.isSafeInteger(options.sampleCount) || options.sampleCount < 16 || options.sampleCount > 4097 ||
      !(["auto", "open", "closed"] as string[]).includes(options.closure))
    throw new TypeError("Choose 16–4097 contour samples and an explicit closure policy.");
  const minT = object.domain.min, spanT = object.domain.max - minT;
  if (!(spanT > 0) || !Number.isFinite(spanT)) throw new TypeError("Parametric contour domain must have finite ordered bounds.");
  const variables = Object.fromEntries(document.source.variables.map(variable => [variable.name, variable.value]));
  const points: ComplexPoint[] = [];
  for (let i = 0; i < options.sampleCount; i++) {
    const parameter = i === options.sampleCount - 1 ? object.domain.max : minT + spanT * i / (options.sampleCount - 1);
    const point = evaluateGraph2DParametric(object, variables, parameter);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
      throw new TypeError(`Complex contour is undefined at sample ${i + 1}/${options.sampleCount}; refine the Graph domain.`);
    points.push({ re: point.x, im: point.y });
  }
  const reMin = Math.min(...points.map(point => point.re)), reMax = Math.max(...points.map(point => point.re));
  const imMin = Math.min(...points.map(point => point.im)), imMax = Math.max(...points.map(point => point.im));
  if (reMax === reMin && imMax === imMin)
    throw new TypeError("Complex contour is degenerate: every sampled point is identical.");
  const extent = Math.max(reMax - reMin, imMax - imMin, 1);
  const first = points[0]!, last = points.at(-1)!;
  const endpointGap = Math.hypot(first.re - last.re, first.im - last.im);
  const closureTolerance = 1e-6 * extent;
  if (options.closure === "closed" && endpointGap > closureTolerance)
    throw new TypeError("Contour endpoints do not meet within the stated closure tolerance.");
  const closed = options.closure === "closed" || options.closure === "auto" && endpointGap <= closureTolerance;
  const maximumSegmentLength = points.slice(1).reduce((maximum, point, i) =>
    Math.max(maximum, Math.hypot(point.re - points[i]!.re, point.im - points[i]!.im)), 0);
  const margin = .1 * extent;
  const targetSource: ComplexAnalysisStructuralSource = {
    function: { sourceText: "z", astVersion: 1, normalizedAst: { type: "variable", name: "z" }, allowedVariables: ["z"] },
    parameters: [], assumptions: [],
    domain: { re: { min: reMin - margin, max: reMax + margin },
      im: { min: imMin - margin, max: imMax + margin }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns: 64, rows: 64, maximumSamples: 4096, tolerance: 1e-8 },
    contours: [{ contourId: `graph-contour-${objectId}`, kind: "polyline", points, center: null,
      radius: null, innerRadius: null, closed, winding: 0 }],
    branchPolicy: { profile: "none", cut: { kind: "principal", angleRadians: null, points: [] },
      includeInfinity: false, sheetCount: 1, activeSheet: 0 },
    covering: null, mobius: null,
  };
  const graphSource = { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash, objectId, sampleCount: options.sampleCount,
    closure: options.closure,
    mapping: "parametric-xy-to-complex-contour" as const,
    targetStructuralHash: complexAnalysisSourceHash(targetSource) };
  const target = createComplexAnalysisDocument(targetSource, {
    stableKey: { graphDocumentId: document.identity.id, graphObjectId: objectId },
    provenance: { origin: "graph2d-promotion", sourceFormat: GRAPH2D_DOCUMENT_FORMAT,
      sourceVersion: GRAPH2D_DOCUMENT_SCHEMA_VERSION, diagnostics: [], graphSource },
  });
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash, objectId }, options, target,
    endpointGap, closureTolerance, maximumSegmentLength,
    warnings: ["This is a bounded sampled contour, not an analytic complex function or a verified field transfer.",
      "The target function is identity z; the Graph path supplies contour geometry only.",
      "Winding is set to unknown (0); sampling does not prove topology or smoothness."] };
};

export const acceptGraph2DComplexContour = (review: Graph2DComplexContourReview,
  document: Graph2DDocument): ComplexAnalysisDocument => {
  if (document.identity.id !== review.source.documentId ||
      document.identity.revision !== review.source.revision ||
      document.identity.structuralHash !== review.source.structuralHash)
    throw new TypeError("Graph source changed after contour preview; review the mapping again.");
  const fresh = reviewGraph2DComplexContour(document, review.source.objectId, review.options);
  if (fresh.target.identity.structuralHash !== review.target.identity.structuralHash)
    throw new TypeError("Complex contour preview changed; review the mapping again.");
  return fresh.target;
};

export const graph2DComplexContourSourceStatus = (target: ComplexAnalysisDocument,
  source: Graph2DDocument | null): "current" | "changed" | "missing" | "target-edited" | "unlinked" => {
  const link = target.provenance.graphSource;
  if (!link || target.provenance.origin !== "graph2d-promotion") return "unlinked";
  if (target.identity.structuralHash !== link.targetStructuralHash) return "target-edited";
  if (!source || source.identity.id !== link.documentId ||
      !source.source.objects.some(item => item.id === link.objectId && item.kind === "parametric")) return "missing";
  return source.identity.revision === link.revision && source.identity.structuralHash === link.structuralHash ? "current" : "changed";
};

export const refreshGraph2DComplexContour = (target: ComplexAnalysisDocument, source: Graph2DDocument,
  closure?: Graph2DComplexContourOptions["closure"]): ComplexAnalysisDocument => {
  const link = target.provenance.graphSource;
  if (!link || source.identity.id !== link.documentId ||
      graph2DComplexContourSourceStatus(target, source) === "target-edited")
    throw new TypeError("Complex contour cannot refresh: source link is missing or target was edited.");
  const fresh = reviewGraph2DComplexContour(source, link.objectId,
    { sampleCount: link.sampleCount, closure: closure ?? link.closure ?? "auto" });
  return createComplexAnalysisDocument({ function: target.function, parameters: target.parameters,
    assumptions: target.assumptions, domain: fresh.target.domain, sampling: target.sampling,
    contours: fresh.target.contours, branchPolicy: target.branchPolicy, covering: target.covering,
    mobius: target.mobius }, { id: target.identity.id, revision: target.identity.revision + 1,
    provenance: { ...fresh.target.provenance,
      graphSource: { ...fresh.target.provenance.graphSource!, targetStructuralHash: complexAnalysisSourceHash({
        function: target.function, parameters: target.parameters, assumptions: target.assumptions,
        domain: fresh.target.domain, sampling: target.sampling, contours: fresh.target.contours,
        branchPolicy: target.branchPolicy, covering: target.covering, mobius: target.mobius }) } } });
};
