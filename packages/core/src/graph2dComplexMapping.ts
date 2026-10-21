import { complexAnalysisSourceHash, createComplexAnalysisDocument,
  type ComplexAnalysisDocument, type ComplexAnalysisStructuralSource, type ComplexPoint } from "./complexAnalysisDocument";
import { GRAPH2D_DOCUMENT_FORMAT, GRAPH2D_DOCUMENT_SCHEMA_VERSION, type Graph2DDocument } from "./graph2dDocument";
import { evaluateGraph2DParametric } from "./graph2dParametric";
import { evaluateGraph2DExpression } from "./graph2dExpression";
import { graph2DVerifiedPointTableReference, type Graph2DPointTableStore } from "./graph2dPointSeries";

export type Graph2DComplexContourOptions = Readonly<{ sampleCount: number; closure: "auto" | "open" | "closed" }>;
export type Graph2DComplexContourReview = Readonly<{
  source: Readonly<{ documentId: string; revision: number; structuralHash: string; objectId: string;
    pairedObjectId?: string }>;
  options: Graph2DComplexContourOptions; target: ComplexAnalysisDocument;
  endpointGap: number; closureTolerance: number; maximumSegmentLength: number;
  warnings: readonly string[];
}>;

type GraphSource = NonNullable<ComplexAnalysisDocument["provenance"]["graphSource"]>;
type ScientificSource = NonNullable<GraphSource["scientificSource"]>;
const defaultOptions: Graph2DComplexContourOptions = { sampleCount: 257, closure: "auto" };
const checkOptions = (options: Graph2DComplexContourOptions) => {
  if (!Number.isSafeInteger(options.sampleCount) || options.sampleCount < 16 || options.sampleCount > 4097 ||
      !(["auto", "open", "closed"] as string[]).includes(options.closure))
    throw new TypeError("Choose 16–4097 contour samples and an explicit closure policy.");
};

const reviewPoints = (document: Graph2DDocument, objectId: string,
  options: Graph2DComplexContourOptions, points: ComplexPoint[],
  mapping: GraphSource["mapping"], pairedObjectId?: string, scientificSource?: ScientificSource,
): Graph2DComplexContourReview => {
  if (points.length !== options.sampleCount) throw new TypeError("Complex contour point count changed during review.");
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
  const graphSource: GraphSource = { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash, objectId, ...(pairedObjectId ? { pairedObjectId } : {}),
    sampleCount: options.sampleCount, closure: options.closure, mapping,
    ...(scientificSource ? { scientificSource } : {}), targetStructuralHash: complexAnalysisSourceHash(targetSource) };
  const target = createComplexAnalysisDocument(targetSource, {
    stableKey: pairedObjectId ? { graphDocumentId: document.identity.id, graphObjectId: objectId, pairedObjectId } :
      { graphDocumentId: document.identity.id, graphObjectId: objectId },
    provenance: { origin: "graph2d-promotion", sourceFormat: GRAPH2D_DOCUMENT_FORMAT,
      sourceVersion: GRAPH2D_DOCUMENT_SCHEMA_VERSION, diagnostics: [], graphSource },
  });
  return { source: { documentId: document.identity.id, revision: document.identity.revision,
    structuralHash: document.identity.structuralHash, objectId, ...(pairedObjectId ? { pairedObjectId } : {}) },
    options, target, endpointGap, closureTolerance, maximumSegmentLength,
    warnings: ["This is a bounded sampled contour, not an analytic complex function or a verified field transfer.",
      "The target function is identity z; the Graph source supplies contour geometry only.",
      ...(scientificSource ? ["The imported point tables are checksum-checked again; this mapping records a snapshot and does not reopen the original scientific bundle."] : []),
      "Winding is set to unknown (0); sampling does not prove topology or smoothness."] };
};

/** Map a Graph parametric (x(t),y(t)) path to a sampled complex contour z(t)=x(t)+iy(t). */
export const reviewGraph2DComplexContour = (document: Graph2DDocument, objectId: string,
  options: Graph2DComplexContourOptions = defaultOptions): Graph2DComplexContourReview => {
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "parametric") throw new TypeError("Choose a parametric Graph path with real x(t) and imaginary y(t).");
  if (!object.domain.includeMin || !object.domain.includeMax)
    throw new TypeError("Complex contour promotion requires included parameter endpoints.");
  checkOptions(options);
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
  return reviewPoints(document, objectId, options, points, "parametric-xy-to-complex-contour");
};

/** Pair two independent y(x) functions, or the checked real/imaginary lines of one complex grid slice. */
export const reviewGraph2DComplexPair = (document: Graph2DDocument, realObjectId: string,
  imaginaryObjectId: string, options: Graph2DComplexContourOptions = defaultOptions,
  tables?: Graph2DPointTableStore): Graph2DComplexContourReview => {
  checkOptions(options);
  if (realObjectId === imaginaryObjectId) throw new TypeError("Choose two distinct Graph objects.");
  const real = document.source.objects.find(item => item.id === realObjectId);
  const imaginary = document.source.objects.find(item => item.id === imaginaryObjectId);
  if (real?.kind === "explicit-cartesian" && imaginary?.kind === "explicit-cartesian") {
    const min = Math.max(real.domain.min, imaginary.domain.min);
    const max = Math.min(real.domain.max, imaginary.domain.max);
    if (!(max > min) || !Number.isFinite(max) ||
        (min === real.domain.min && !real.domain.includeMin) || (min === imaginary.domain.min && !imaginary.domain.includeMin) ||
        (max === real.domain.max && !real.domain.includeMax) || (max === imaginary.domain.max && !imaginary.domain.includeMax))
      throw new TypeError("Paired functions need a finite shared domain with included endpoints.");
    const variables = Object.fromEntries(document.source.variables.map(variable => [variable.name, variable.value]));
    const points: ComplexPoint[] = [];
    for (let i = 0; i < options.sampleCount; i++) {
      const x = i === options.sampleCount - 1 ? max : min + (max - min) * i / (options.sampleCount - 1);
      const re = evaluateGraph2DExpression(real.expression.ast, { ...variables, x });
      const im = evaluateGraph2DExpression(imaginary.expression.ast, { ...variables, x });
      if (!re.ok || !im.ok || !Number.isFinite(re.value) || !Number.isFinite(im.value))
        throw new TypeError(`Paired functions are undefined at sample ${i + 1}/${options.sampleCount}.`);
      points.push({ re: re.value, im: im.value });
    }
    return reviewPoints(document, realObjectId, options, points, "paired-functions-to-complex-contour", imaginaryObjectId);
  }
  if (real?.kind !== "point-series" || imaginary?.kind !== "point-series" || !tables)
    throw new TypeError("Choose two explicit functions or two verified real/imaginary complex-grid lines.");
  const realOrigin = real.origin, imaginaryOrigin = imaginary.origin;
  const realSlice = realOrigin?.slice, imaginarySlice = imaginaryOrigin?.slice;
  if (!realOrigin || !imaginaryOrigin || realOrigin.component !== "real" ||
      imaginaryOrigin.component !== "imaginary" || !realSlice || !imaginarySlice ||
      realOrigin.sceneId !== imaginaryOrigin.sceneId || realOrigin.datasetId !== imaginaryOrigin.datasetId ||
      realOrigin.sceneFingerprint !== imaginaryOrigin.sceneFingerprint ||
      realOrigin.sourceProducer !== imaginaryOrigin.sourceProducer ||
      realOrigin.sourceId !== imaginaryOrigin.sourceId || realOrigin.sourceSchema !== imaginaryOrigin.sourceSchema ||
      realOrigin.sourceSha256 !== imaginaryOrigin.sourceSha256 ||
      realOrigin.xName !== imaginaryOrigin.xName || realOrigin.xUnit !== imaginaryOrigin.xUnit ||
      realOrigin.yUnit !== imaginaryOrigin.yUnit ||
      realSlice.varyingAxis !== imaginarySlice.varyingAxis || realSlice.fixedIndex !== imaginarySlice.fixedIndex ||
      realSlice.fixedCoordinate !== imaginarySlice.fixedCoordinate || realSlice.fixedName !== imaginarySlice.fixedName ||
      realSlice.fixedUnit !== imaginarySlice.fixedUnit)
    throw new TypeError("Real and imaginary lines must come from the same verified complex-grid slice and axes.");
  const realRows = tables.resolve(real.table), imaginaryRows = tables.resolve(imaginary.table);
  if (!realRows || !imaginaryRows ||
      graph2DVerifiedPointTableReference(realRows)?.checksum !== real.table.checksum ||
      graph2DVerifiedPointTableReference(imaginaryRows)?.checksum !== imaginary.table.checksum)
    throw new TypeError("A checked complex-grid point table is missing or changed.");
  if (realRows.length < 16 || realRows.length > 4097 || realRows.length !== imaginaryRows.length ||
      realRows.some((row, index) => row.y === null || imaginaryRows[index]!.y === null ||
        row.x !== imaginaryRows[index]!.x || (index > 0 && row.x <= realRows[index - 1]!.x)))
    throw new TypeError("Complex-grid lines need 16–4097 complete, aligned, increasing coordinates.");
  const scientificSource: ScientificSource = {
    sceneId: realOrigin.sceneId, datasetId: realOrigin.datasetId,
    sceneFingerprint: realOrigin.sceneFingerprint,
    realResourceSha256: realOrigin.resourceSha256, imaginaryResourceSha256: imaginaryOrigin.resourceSha256,
    varyingAxis: realSlice.varyingAxis, fixedIndex: realSlice.fixedIndex,
    fixedCoordinate: realSlice.fixedCoordinate, fixedName: realSlice.fixedName, fixedUnit: realSlice.fixedUnit,
    varyingName: realOrigin.xName, varyingUnit: realOrigin.xUnit,
  };
  const points = realRows.map((row, index) => ({ re: row.y!, im: imaginaryRows[index]!.y! }));
  return reviewPoints(document, realObjectId, { ...options, sampleCount: points.length }, points,
    "scientific-complex-line-to-contour", imaginaryObjectId, scientificSource);
};

const reviewLinkedSource = (document: Graph2DDocument, link: GraphSource,
  closure: Graph2DComplexContourOptions["closure"], tables?: Graph2DPointTableStore) =>
  link.mapping === "parametric-xy-to-complex-contour" ?
    reviewGraph2DComplexContour(document, link.objectId, { sampleCount: link.sampleCount, closure }) :
    reviewGraph2DComplexPair(document, link.objectId, link.pairedObjectId!,
      { sampleCount: link.sampleCount, closure }, tables);

export const acceptGraph2DComplexContour = (review: Graph2DComplexContourReview,
  document: Graph2DDocument, tables?: Graph2DPointTableStore): ComplexAnalysisDocument => {
  if (document.identity.id !== review.source.documentId ||
      document.identity.revision !== review.source.revision ||
      document.identity.structuralHash !== review.source.structuralHash)
    throw new TypeError("Graph source changed after contour preview; review the mapping again.");
  const link = review.target.provenance.graphSource;
  if (!link || link.objectId !== review.source.objectId || link.pairedObjectId !== review.source.pairedObjectId)
    throw new TypeError("Complex contour preview provenance changed; review the mapping again.");
  const fresh = reviewLinkedSource(document, link, review.options.closure, tables);
  if (fresh.target.identity.structuralHash !== review.target.identity.structuralHash)
    throw new TypeError("Complex contour preview changed; review the mapping again.");
  if (JSON.stringify(fresh.target.provenance.graphSource) !== JSON.stringify(link))
    throw new TypeError("Complex contour source metadata changed; review the mapping again.");
  return fresh.target;
};

export const graph2DComplexContourSourceStatus = (target: ComplexAnalysisDocument,
  source: Graph2DDocument | null, tables?: Graph2DPointTableStore): "current" | "changed" | "missing" | "target-edited" | "unlinked" => {
  const link = target.provenance.graphSource;
  if (!link || target.provenance.origin !== "graph2d-promotion") return "unlinked";
  if (target.identity.structuralHash !== link.targetStructuralHash) return "target-edited";
  const requiredKind = link.mapping === "parametric-xy-to-complex-contour" ? "parametric" :
    link.mapping === "paired-functions-to-complex-contour" ? "explicit-cartesian" : "point-series";
  if (!source || source.identity.id !== link.documentId ||
      !source.source.objects.some(item => item.id === link.objectId && item.kind === requiredKind) ||
      (link.pairedObjectId && !source.source.objects.some(item => item.id === link.pairedObjectId && item.kind === requiredKind)))
    return "missing";
  if (link.mapping === "scientific-complex-line-to-contour") {
    if (!tables) return "missing";
    const real = source.source.objects.find(item => item.id === link.objectId);
    const imaginary = source.source.objects.find(item => item.id === link.pairedObjectId);
    if (real?.kind !== "point-series" || imaginary?.kind !== "point-series" ||
        !tables.resolve(real.table) || !tables.resolve(imaginary.table)) return "missing";
  }
  return source.identity.revision === link.revision && source.identity.structuralHash === link.structuralHash ? "current" : "changed";
};

export const refreshGraph2DComplexContour = (target: ComplexAnalysisDocument, source: Graph2DDocument,
  closure?: Graph2DComplexContourOptions["closure"], tables?: Graph2DPointTableStore): ComplexAnalysisDocument => {
  const link = target.provenance.graphSource;
  if (!link || source.identity.id !== link.documentId ||
      ["target-edited", "missing"].includes(graph2DComplexContourSourceStatus(target, source, tables)))
    throw new TypeError("Complex contour cannot refresh: source link is missing or target was edited.");
  const fresh = reviewLinkedSource(source, link, closure ?? link.closure ?? "auto", tables);
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
