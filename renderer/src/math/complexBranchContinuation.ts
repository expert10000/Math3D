import { createAnalysisResultEnvelope, type AnalysisResultEnvelope, type ComplexAnalysisDocument, type ComplexPoint, type ScientificSourceGeneration } from "@math3d/core";

export const COMPLEX_CONTINUATION_VERSION = "adaptive-complex-path-lifting@1" as const;
type BranchModel = Readonly<{ name: string; degree: number | null; branchPoints: readonly ComplexPoint[]; infinity: boolean }>;
export type ComplexContinuationOutcome = Readonly<{ result: AnalysisResultEnvelope; refinedPaths: readonly (readonly ComplexPoint[])[] }>;

const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({ documentId: document.identity.id, revision: document.identity.revision, structuralHash: document.identity.structuralHash, generation: document.identity.revision });
const normalized = (source: string) => source.toLowerCase().replace(/^f\s*\(\s*z\s*\)\s*=\s*/, "").replace(/\s+/g, "");
const modelFor = (document: ComplexAnalysisDocument): BranchModel | null => {
  const source = normalized(document.function.sourceText);
  if (source === "log(z)") return { name: "logarithm", degree: null, branchPoints: [{ re: 0, im: 0 }], infinity: true };
  if (source === "sqrt(z)" || source === "z^(1/2)") return { name: "square-root", degree: 2, branchPoints: [{ re: 0, im: 0 }], infinity: true };
  if (source === "z^(1/3)") return { name: "cube-root", degree: 3, branchPoints: [{ re: 0, im: 0 }], infinity: true };
  if (source === "sqrt(z^2-1)" || source === "sqrt((z^2)-1)") return { name: "sqrt-z2-minus-one", degree: 2, branchPoints: [{ re: -1, im: 0 }, { re: 1, im: 0 }], infinity: false };
  return null;
};
const distance = (a: ComplexPoint, b: ComplexPoint) => Math.hypot(a.re - b.re, a.im - b.im);
const distanceToBranchSet = (point: ComplexPoint, branchPoints: readonly ComplexPoint[]) => branchPoints.reduce((minimum, branch) => Math.min(minimum, distance(point, branch)), Infinity);

const refineSegment = (a: ComplexPoint, b: ComplexPoint, branches: readonly ComplexPoint[], scale: number, depth = 0): { points: ComplexPoint[]; maxDepth: number } => {
  const midpoint = { re: (a.re + b.re) / 2, im: (a.im + b.im) / 2 };
  const length = distance(a, b);
  const proximity = Math.min(distanceToBranchSet(a, branches), distanceToBranchSet(midpoint, branches), distanceToBranchSet(b, branches));
  const shouldSplit = depth < 12 && length > Math.max(scale * 0.01, proximity * 0.35);
  if (!shouldSplit) return { points: [a, b], maxDepth: depth };
  const left = refineSegment(a, midpoint, branches, scale, depth + 1);
  const right = refineSegment(midpoint, b, branches, scale, depth + 1);
  return { points: [...left.points.slice(0, -1), ...right.points], maxDepth: Math.max(left.maxDepth, right.maxDepth) };
};
const refinePath = (points: readonly ComplexPoint[], branches: readonly ComplexPoint[], scale: number) => {
  const refined: ComplexPoint[] = [];
  let maxDepth = 0;
  for (let index = 1; index < points.length; index += 1) {
    const part = refineSegment(points[index - 1]!, points[index]!, branches, scale);
    refined.push(...(index === 1 ? part.points : part.points.slice(1)));
    maxDepth = Math.max(maxDepth, part.maxDepth);
  }
  return { points: refined, maxDepth };
};
const winding = (points: readonly ComplexPoint[], branch: ComplexPoint): number | null => {
  if (points.length < 4) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!; const b = points[index]!;
    let delta = Math.atan2(b.im - branch.im, b.re - branch.re) - Math.atan2(a.im - branch.im, a.re - branch.re);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    total += delta;
  }
  return total / (2 * Math.PI);
};

export const analyzeAdaptiveComplexContinuation = (document: ComplexAnalysisDocument, now = performance.now()): ComplexContinuationOutcome => {
  const started = now;
  const model = modelFor(document);
  const scale = Math.max(document.domain.re.max - document.domain.re.min, document.domain.im.max - document.domain.im.min, 1);
  const originalPaths = document.contours.map((contour) => contour.points);
  const refined = model ? originalPaths.map((path) => refinePath(path, model.branchPoints, scale)) : [];
  const refinedPaths = refined.map((entry) => entry.points);
  const closureTolerance = Math.max(1e-8, scale * 1e-4);
  const closed = refinedPaths.length > 0 && refinedPaths.every((path) => path.length >= 4 && distance(path[0]!, path[path.length - 1]!) <= closureTolerance);
  const minDiscriminantDistance = model ? refinedPaths.flat().reduce((minimum, point) => Math.min(minimum, distanceToBranchSet(point, model.branchPoints)), Infinity) : Infinity;
  const precisionDigits = minDiscriminantDistance < scale * 1e-6 ? 80 : minDiscriminantDistance < scale * 1e-3 ? 50 : 30;
  const windings = model ? model.branchPoints.map((point) => {
    const raw = refinedPaths.reduce((sum, path) => sum + (winding(path, point) ?? 0), 0);
    return { point, raw, integer: Math.round(raw), residual: Math.abs(raw - Math.round(raw)) };
  }) : [];
  const uncertainReasons: string[] = [];
  if (!model) uncertainReasons.push("No supported algebraic/logarithmic branch model is available.");
  if (!closed) uncertainReasons.push("Path is not a validated closed loop.");
  if (minDiscriminantDistance <= scale * 1e-10) uncertainReasons.push("Path touches or is numerically indistinguishable from the discriminant.");
  if (windings.some((entry) => entry.residual > 2e-3)) uncertainReasons.push("A branch-point winding did not converge to an integer.");
  if (refined.some((entry) => entry.maxDepth >= 12) && minDiscriminantDistance < scale * 1e-6) uncertainReasons.push("Adaptive subdivision reached maximum depth near the discriminant.");
  const validated = uncertainReasons.length === 0;
  const totalShift = windings.reduce((sum, entry) => sum + entry.integer, 0);
  const shift = model?.degree ? ((totalShift % model.degree) + model.degree) % model.degree : totalShift;
  const degree = model?.degree ?? null;
  const permutation = validated && model
    ? degree == null
      ? [`k -> k ${shift >= 0 ? "+" : "-"} ${Math.abs(shift)}`]
      : Array.from({ length: degree }, (_, sheet) => `${sheet}->${(sheet + shift) % degree}`)
    : [];
  const result = createAnalysisResultEnvelope({
    resultId: `complex-continuation:${document.identity.revision}:${document.identity.structuralHash.slice(-12)}`,
    status: model ? "numerical" : "unsupported",
    provenance: {
      source: sourceOf(document),
      operation: { type: "complex.branch-continuation", algorithm: "adaptive discriminant-aware path lifting", algorithmVersion: COMPLEX_CONTINUATION_VERSION, parameters: { closureTolerance, maximumDepth: 12, model: model?.name ?? "unsupported" } },
      numericContext: { precision: { decimalDigits: precisionDigits }, tolerance: { absolute: closureTolerance, relative: 2e-3 } },
      engine: { name: "Math3D adaptive continuation kernel", version: "1.0.0" }, elapsedMs: Math.max(0, performance.now() - started),
    },
    summary: {
      outcome: validated ? "validated" : "uncertain",
      model: model?.name ?? "unsupported",
      branchPoints: model?.branchPoints ?? [],
      includesInfinity: model?.infinity ?? false,
      originalSamples: originalPaths.reduce((sum, path) => sum + path.length, 0),
      refinedSamples: refinedPaths.reduce((sum, path) => sum + path.length, 0),
      minDiscriminantDistance: Number.isFinite(minDiscriminantDistance) ? minDiscriminantDistance : null,
      precisionDigits,
      windings,
      sheetShift: validated ? shift : null,
      monodromyPermutation: permutation,
      loopClosed: closed,
    },
    warnings: uncertainReasons,
    diagnostics: [{ code: validated ? "complex.continuation-validated" : "complex.continuation-uncertain", severity: validated ? "info" : "warning", message: validated ? "Adaptive continuation closed with integral branch winding; monodromy is publishable." : "Monodromy was withheld because continuation is uncertain." }],
    artifacts: [],
  });
  return { result, refinedPaths };
};
