import type { AnyCurve, Curve2D, Curve3D, CurveDomain, CurveKind, Vec3 } from "@math3d/core";
import { normalizeCurveDomain } from "@math3d/core";
import { compileExpression } from "./expression";

export type CurvePresetInput = {
  id: string;
  label: string;
  kind: string;
  dimension: 2 | 3;
  formulas: { x: string; y: string; z?: string };
  domain: { tMin: number; tMax: number; closed?: boolean };
};

export type CurveFactoryResult = {
  curve: AnyCurve | null;
  errors: string[];
  source: "formula" | "special" | null;
};

type CompileAxisResult = {
  fn: ((t: number) => number) | null;
  error: string | null;
};

const SPECIAL_BSPLINE_POINTS: Vec3[] = [
  { x: -1.4, y: -0.8, z: -0.35 },
  { x: -0.9, y: 1.1, z: 0.2 },
  { x: -0.1, y: 0.1, z: 0.9 },
  { x: 0.8, y: -0.9, z: -0.15 },
  { x: 1.5, y: 0.7, z: 0.65 },
  { x: 2.0, y: -0.25, z: 0.1 },
];

const SPECIAL_BSPLINE_KNOTS = [0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1];
const SPECIAL_BSPLINE_DEGREE = 3;

const SPECIAL_NURBS_POINTS: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 0, y: 1, z: 0 },
];
const SPECIAL_NURBS_WEIGHTS = [1, Math.SQRT1_2, 1];
const SPECIAL_NURBS_KNOTS = [0, 0, 0, 1, 1, 1];
const SPECIAL_NURBS_DEGREE = 2;

const finiteNumber = (value: number) => Number.isFinite(value);

const sanitizeDomain = (domain: CurvePresetInput["domain"]): { domain: CurveDomain | null; error: string | null } => {
  if (!finiteNumber(domain.tMin) || !finiteNumber(domain.tMax)) {
    return { domain: null, error: "Domain must have finite tMin and tMax." };
  }
  if (domain.tMax <= domain.tMin) {
    return { domain: null, error: "Domain requires tMax > tMin." };
  }
  return {
    domain: normalizeCurveDomain({
      tMin: domain.tMin,
      tMax: domain.tMax,
      closed: Boolean(domain.closed),
    }),
    error: null,
  };
};

const normalizeCurveExpr = (expr: string) => expr.replace(/\bPI\b/g, "pi").replace(/\bPi\b/g, "pi");

const compileAxis = (expr: string): CompileAxisResult => {
  const compiled = compileExpression(normalizeCurveExpr(expr), ["t"]);
  if (compiled.error || !compiled.fn) {
    const message = compiled.error
      ? `${compiled.error.message} (col ${compiled.error.col})`
      : "Expression could not be compiled.";
    return { fn: null, error: message };
  }
  return {
    fn: (t: number) => compiled.fn?.({ t }) ?? NaN,
    error: null,
  };
};

const toCurveKind = (kind: string): CurveKind => {
  if (kind === "bezier") return "bezier";
  if (kind === "bspline") return "bspline";
  if (kind === "nurbs") return "nurbs";
  if (kind === "custom") return "custom";
  return "parametric";
};

const clampToRange = (value: number, lo: number, hi: number) => {
  if (value <= lo) return lo;
  if (value >= hi) return hi;
  return value;
};

const findSpan = (knots: number[], degree: number, pointCount: number, tRaw: number) => {
  const n = pointCount - 1;
  const low = knots[degree];
  const high = knots[n + 1];
  const t = clampToRange(tRaw, low, high);
  if (t >= high) return { span: n, t };
  let lo = degree;
  let hi = n + 1;
  let mid = Math.floor((lo + hi) / 2);
  while (t < knots[mid] || t >= knots[mid + 1]) {
    if (t < knots[mid]) hi = mid;
    else lo = mid;
    mid = Math.floor((lo + hi) / 2);
  }
  return { span: mid, t };
};

const mixVec3 = (a: Vec3, b: Vec3, alpha: number): Vec3 => {
  const beta = 1 - alpha;
  return {
    x: beta * a.x + alpha * b.x,
    y: beta * a.y + alpha * b.y,
    z: beta * a.z + alpha * b.z,
  };
};

const deBoor3 = (controlPoints: Vec3[], degree: number, knots: number[], tRaw: number): Vec3 => {
  const { span, t } = findSpan(knots, degree, controlPoints.length, tRaw);
  const d: Vec3[] = [];
  for (let j = 0; j <= degree; j += 1) {
    d[j] = { ...controlPoints[span - degree + j] };
  }
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const i = span - degree + j;
      const denom = knots[i + degree + 1 - r] - knots[i];
      const alpha = denom <= 1e-12 ? 0 : (t - knots[i]) / denom;
      d[j] = mixVec3(d[j - 1], d[j], alpha);
    }
  }
  return d[degree];
};

type Vec4 = { x: number; y: number; z: number; w: number };

const mixVec4 = (a: Vec4, b: Vec4, alpha: number): Vec4 => {
  const beta = 1 - alpha;
  return {
    x: beta * a.x + alpha * b.x,
    y: beta * a.y + alpha * b.y,
    z: beta * a.z + alpha * b.z,
    w: beta * a.w + alpha * b.w,
  };
};

const deBoor4 = (controlPoints: Vec4[], degree: number, knots: number[], tRaw: number): Vec4 => {
  const { span, t } = findSpan(knots, degree, controlPoints.length, tRaw);
  const d: Vec4[] = [];
  for (let j = 0; j <= degree; j += 1) {
    d[j] = { ...controlPoints[span - degree + j] };
  }
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const i = span - degree + j;
      const denom = knots[i + degree + 1 - r] - knots[i];
      const alpha = denom <= 1e-12 ? 0 : (t - knots[i]) / denom;
      d[j] = mixVec4(d[j - 1], d[j], alpha);
    }
  }
  return d[degree];
};

const buildSpecialCurve = (preset: CurvePresetInput, domain: CurveDomain): AnyCurve | null => {
  if (preset.id === "bSplineDemo") {
    const curve: Curve3D = {
      id: preset.id,
      name: preset.label,
      kind: "bspline",
      subtype: "spline",
      domain,
      dimension: 3,
      eval: (t) => deBoor3(SPECIAL_BSPLINE_POINTS, SPECIAL_BSPLINE_DEGREE, SPECIAL_BSPLINE_KNOTS, t),
    };
    return curve;
  }

  if (preset.id === "nurbsQuarterArc") {
    const weighted: Vec4[] = SPECIAL_NURBS_POINTS.map((point, idx) => {
      const w = SPECIAL_NURBS_WEIGHTS[idx] ?? 1;
      return { x: point.x * w, y: point.y * w, z: point.z * w, w };
    });
    const curve: Curve2D = {
      id: preset.id,
      name: preset.label,
      kind: "nurbs",
      subtype: "nurbs",
      domain,
      dimension: 2,
      eval: (t) => {
        const h = deBoor4(weighted, SPECIAL_NURBS_DEGREE, SPECIAL_NURBS_KNOTS, t);
        const wSafe = Math.abs(h.w) > 1e-12 ? h.w : 1;
        return { x: h.x / wSafe, y: h.y / wSafe };
      },
    };
    return curve;
  }

  return null;
};

const hasFinitePoint = (point: { x: number; y: number; z?: number }) =>
  finiteNumber(point.x) && finiteNumber(point.y) && (point.z === undefined || finiteNumber(point.z));

export const buildCurveFromPreset = (preset: CurvePresetInput): CurveFactoryResult => {
  const domainResult = sanitizeDomain(preset.domain);
  if (!domainResult.domain) {
    return { curve: null, errors: [domainResult.error ?? "Invalid domain."], source: null };
  }
  const domain = domainResult.domain;

  const specialCurve = buildSpecialCurve(preset, domain);
  if (specialCurve) return { curve: specialCurve, errors: [], source: "special" };

  const xAxis = compileAxis(preset.formulas.x);
  const yAxis = compileAxis(preset.formulas.y);
  const zAxis = preset.dimension === 3 ? compileAxis(preset.formulas.z ?? "0") : { fn: null, error: null };
  const errors: string[] = [];
  if (xAxis.error) errors.push(`x(t): ${xAxis.error}`);
  if (yAxis.error) errors.push(`y(t): ${yAxis.error}`);
  if (zAxis.error) errors.push(`z(t): ${zAxis.error}`);
  if (!xAxis.fn || !yAxis.fn || (preset.dimension === 3 && !zAxis.fn)) {
    return { curve: null, errors, source: null };
  }

  if (preset.dimension === 2) {
    const curve: Curve2D = {
      id: preset.id,
      name: preset.label,
      kind: toCurveKind(preset.kind),
      subtype: preset.kind === "bezier" ? "polynomial" : preset.kind === "nurbs" ? "nurbs" : "2d",
      domain,
      dimension: 2,
      eval: (t) => {
        const point = { x: xAxis.fn?.(t) ?? NaN, y: yAxis.fn?.(t) ?? NaN };
        return hasFinitePoint(point) ? point : { x: NaN, y: NaN };
      },
    };
    return { curve, errors: [], source: "formula" };
  }

  const curve: Curve3D = {
    id: preset.id,
    name: preset.label,
    kind: toCurveKind(preset.kind),
    subtype:
      preset.kind === "bezier"
        ? "polynomial"
        : preset.kind === "nurbs"
          ? "nurbs"
          : preset.kind === "bspline"
            ? "spline"
            : "3d",
    domain,
    dimension: 3,
    eval: (t) => {
      const point = { x: xAxis.fn?.(t) ?? NaN, y: yAxis.fn?.(t) ?? NaN, z: zAxis.fn?.(t) ?? NaN };
      return hasFinitePoint(point) ? point : { x: NaN, y: NaN, z: NaN };
    },
  };
  return { curve, errors: [], source: "formula" };
};
