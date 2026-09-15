import {
  createAnalysisResultEnvelope,
  normalizeAnalysisResultRecord,
  type AnalysisArtifactHandle,
  type AnalysisResultEnvelope,
  type ComplexAnalysisDocument,
  type ComplexContourRecord,
  type ComplexPoint,
  type LegacyLimitedAnalysisResult,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { abs, add, C, mul, scale, sub, type Complex } from "./complex";
import { compileComplexExpressionAstPreview } from "./complexExpr";
import { inspectRationalFunction } from "./rationalInspector";

export const COMPLEX_NUMERICAL_ALGORITHM_VERSION = "complex-numerical-lab@1" as const;

export type ComplexNumericalAnalysisOptions = Readonly<{
  document: ComplexAnalysisDocument;
  probe?: ComplexPoint;
  tolerance?: number;
  artifacts?: readonly AnalysisArtifactHandle[];
  now?: number;
}>;

const finite = (value: Complex): boolean => Number.isFinite(value.re) && Number.isFinite(value.im);
const sourceOf = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});

const closePoints = (points: readonly ComplexPoint[]): ComplexPoint[] => {
  if (points.length < 2) return [...points];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.re - last.re, first.im - last.im) <= 1e-12
    ? [...points]
    : [...points, first];
};

const integrate = (
  points: readonly ComplexPoint[],
  evaluate: (point: ComplexPoint) => Complex,
  refine: boolean
): { value: Complex; validSegments: number; attemptedSegments: number } => {
  const path = closePoints(points);
  let value = C();
  let validSegments = 0;
  let attemptedSegments = 0;
  const step = (a: ComplexPoint, b: ComplexPoint) => {
    attemptedSegments += 1;
    const fa = evaluate(a);
    const fb = evaluate(b);
    if (!finite(fa) || !finite(fb)) return;
    const dz = C(b.re - a.re, b.im - a.im);
    value = add(value, mul(scale(add(fa, fb), 0.5), dz));
    validSegments += 1;
  };
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]!;
    const b = path[index]!;
    if (refine) {
      const midpoint = { re: (a.re + b.re) / 2, im: (a.im + b.im) / 2 };
      step(a, midpoint);
      step(midpoint, b);
    } else step(a, b);
  }
  return { value, validSegments, attemptedSegments };
};

const winding = (points: readonly ComplexPoint[], center: ComplexPoint): number | null => {
  const path = closePoints(points);
  if (path.length < 4) return null;
  let angle = 0;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]!;
    const b = path[index]!;
    let delta = Math.atan2(b.im - center.im, b.re - center.re) - Math.atan2(a.im - center.im, a.re - center.re);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    angle += delta;
  }
  return angle / (2 * Math.PI);
};

const pointSegmentDistance = (point: ComplexPoint, a: ComplexPoint, b: ComplexPoint): number => {
  const dx = b.re - a.re;
  const dy = b.im - a.im;
  const denominator = dx * dx + dy * dy;
  const t = denominator <= 1e-20 ? 0 : Math.max(0, Math.min(1, ((point.re - a.re) * dx + (point.im - a.im) * dy) / denominator));
  return Math.hypot(point.re - (a.re + t * dx), point.im - (a.im + t * dy));
};

const orientation = (a: ComplexPoint, b: ComplexPoint, c: ComplexPoint) =>
  (b.re - a.re) * (c.im - a.im) - (b.im - a.im) * (c.re - a.re);
const intersects = (a: ComplexPoint, b: ComplexPoint, c: ComplexPoint, d: ComplexPoint): boolean => {
  const eps = 1e-10;
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 <= eps && o3 * o4 <= eps &&
    Math.max(Math.min(a.re, b.re), Math.min(c.re, d.re)) <= Math.min(Math.max(a.re, b.re), Math.max(c.re, d.re)) + eps &&
    Math.max(Math.min(a.im, b.im), Math.min(c.im, d.im)) <= Math.min(Math.max(a.im, b.im), Math.max(c.im, d.im)) + eps;
};

const branchSegments = (document: ComplexAnalysisDocument): readonly (readonly [ComplexPoint, ComplexPoint])[] => {
  const cut = document.branchPolicy.cut;
  if (cut.points.length >= 2) return cut.points.slice(1).map((point, index) => [cut.points[index]!, point] as const);
  if (cut.kind === "negative-real-axis" || cut.kind === "principal") {
    return [[{ re: document.domain.re.min, im: 0 }, { re: 0, im: 0 }]];
  }
  if (cut.kind === "positive-real-axis") return [[{ re: 0, im: 0 }, { re: document.domain.re.max, im: 0 }]];
  return [];
};

/**
 * Publishes compact F06 evidence for the current C04 source. This deliberately
 * remains numerical: neither a small error nor a recognized rational pole upgrades
 * the record to exact or certified status.
 */
export const publishComplexNumericalAnalysis = (options: ComplexNumericalAnalysisOptions): AnalysisResultEnvelope => {
  const started = options.now ?? performance.now();
  const tolerance = options.tolerance ?? options.document.sampling.tolerance;
  const compiled = compileComplexExpressionAstPreview(options.document.function.normalizedAst, options.document.function.allowedVariables);
  if (!compiled.fn) throw new TypeError(compiled.error?.message ?? "Complex expression cannot be evaluated numerically.");
  const evaluate = (point: ComplexPoint) => compiled.fn!({ z: C(point.re, point.im), u: point.re, v: point.im });
  const probe = options.probe ?? { re: 0.5 * (options.document.domain.re.min + options.document.domain.re.max), im: 0.5 * (options.document.domain.im.min + options.document.domain.im.max) };
  const step = Math.max(1e-6, Math.sqrt(Math.max(tolerance, 1e-14)));
  const derivativeX = scale(sub(evaluate({ re: probe.re + step, im: probe.im }), evaluate({ re: probe.re - step, im: probe.im })), 1 / (2 * step));
  const derivativeYRaw = scale(sub(evaluate({ re: probe.re, im: probe.im + step }), evaluate({ re: probe.re, im: probe.im - step })), 1 / (2 * step));
  const derivativeY = C(derivativeYRaw.im, -derivativeYRaw.re);
  const derivativeDisagreement = finite(derivativeX) && finite(derivativeY) ? abs(sub(derivativeX, derivativeY)) : Number.MAX_VALUE;

  const inspection = inspectRationalFunction(options.document.function.sourceText);
  const poles = inspection?.error ? [] : inspection?.poles ?? [];
  const contourRecords = options.document.contours;
  let coarse = C();
  let refined = C();
  let samples = 0;
  let validSamples = 0;
  let windingValue = 0;
  let windingCount = 0;
  let nearPole = false;
  let branchCrossings = 0;
  const cutSegments = branchSegments(options.document);
  for (const contour of contourRecords) {
    const coarsePart = integrate(contour.points, evaluate, false);
    const refinedPart = integrate(contour.points, evaluate, true);
    coarse = add(coarse, coarsePart.value);
    refined = add(refined, refinedPart.value);
    samples += refinedPart.attemptedSegments + 1;
    validSamples += refinedPart.validSegments + 1;
    const aroundOrigin = winding(contour.points, C());
    if (aroundOrigin != null) { windingValue += aroundOrigin; windingCount += 1; }
    const path = closePoints(contour.points);
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1]!;
      const b = path[index]!;
      if (poles.some((pole) => pointSegmentDistance(pole.point, a, b) <= Math.max(tolerance * 10, 1e-4))) nearPole = true;
      for (const cut of cutSegments) if (intersects(a, b, cut[0], cut[1])) branchCrossings += 1;
    }
  }
  const quadratureError = abs(sub(refined, coarse));
  const warnings: string[] = [];
  if (!contourRecords.length) warnings.push("No committed contour is available; contour fields are not computed.");
  if (nearPole) warnings.push("A contour passes near a pole candidate; quadrature may be unstable.");
  if (branchCrossings > 0) warnings.push(`Committed contour crosses the active branch cut ${branchCrossings} time(s).`);
  if (validSamples < samples) warnings.push(`${samples - validSamples} contour samples were non-finite.`);
  const elapsedMs = Math.max(0, (options.now ?? performance.now()) - started);
  return createAnalysisResultEnvelope({
    resultId: `complex-numerical:${options.document.identity.revision}:${options.document.identity.structuralHash.slice(-12)}`,
    status: "numerical",
    provenance: {
      source: sourceOf(options.document),
      operation: {
        type: "complex.numerical-analysis",
        algorithm: "centered finite differences and nested trapezoid contour quadrature",
        algorithmVersion: COMPLEX_NUMERICAL_ALGORITHM_VERSION,
        parameters: { derivativeStep: step, contourCount: contourRecords.length },
      },
      numericContext: { precision: { decimalDigits: 15 }, tolerance: { absolute: tolerance, relative: tolerance } },
      engine: { name: "Math3D TypeScript numerical kernel", version: "1.0.0" },
      elapsedMs,
    },
    summary: {
      evidence: "numerical-not-proof",
      derivative: { probe, dx: derivativeX, dyAsComplexDerivative: derivativeY, disagreement: derivativeDisagreement },
      poleCandidates: poles.map((pole) => ({ point: pole.point, order: pole.order })),
      contour: {
        count: contourRecords.length,
        samples,
        validSamples,
        integral: refined,
        errorEstimate: quadratureError,
        windingAroundOrigin: windingCount ? windingValue : null,
        branchCutCrossings: branchCrossings,
        nearPole,
      },
      artifactAvailability: options.artifacts?.length ?? 0,
    },
    warnings,
    diagnostics: [
      { code: "complex.numerical-status", severity: "info", message: "Numerical evidence is approximate and is not an exact proof." },
      ...(nearPole ? [{ code: "complex.near-pole", severity: "warning" as const, message: "Contour proximity to a pole candidate can amplify quadrature error." }] : []),
      ...(branchCrossings ? [{ code: "complex.branch-cut-crossing", severity: "warning" as const, message: "The contour crosses the active branch cut." }] : []),
    ],
    artifacts: options.artifacts ?? [],
  });
};

/** Makes old inline lab values displayable but incapable of claiming F06 authority. */
export const qualifyLegacyComplexNumericalValues = (value: unknown): LegacyLimitedAnalysisResult => {
  const normalized = normalizeAnalysisResultRecord(value);
  if (!normalized.ok || normalized.value.kind !== "legacy-limited") throw new TypeError("Expected an unversioned legacy result.");
  return normalized.value;
};

export const contourRecordFromPoints = (
  contourId: string,
  kind: ComplexContourRecord["kind"],
  points: readonly ComplexPoint[]
): ComplexContourRecord => ({
  contourId,
  kind,
  points,
  center: null,
  radius: null,
  innerRadius: null,
  closed: points.length >= 3 && Math.hypot(points[0]!.re - points[points.length - 1]!.re, points[0]!.im - points[points.length - 1]!.im) <= 1e-8,
  winding: Math.round(winding(points, C()) ?? 0),
});
