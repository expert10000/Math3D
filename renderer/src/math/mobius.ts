// src/math/mobius.ts
import type { Complex } from "./complex";
import { C, add, sub, mul, abs2, div, sqrt, isFiniteC } from "./complex";

export type MobiusParams = {
  a: Complex;
  b: Complex;
  c: Complex;
  d: Complex;
};

export type MobiusFixedPoints = {
  kind: "none" | "single" | "pair" | "all";
  values: Complex[];
};

export type MobiusBasicClassification = {
  kind: "identity" | "translation" | "affine" | "inversionLike" | "general" | "singular";
  valid: boolean;
  affine: boolean;
  determinant: Complex;
  determinantAbs: number;
  pole: Complex | null;
  fixed: MobiusFixedPoints;
};

export type MobiusCurveInput =
  | { kind: "circle"; center: Complex; radius: number }
  | { kind: "line"; point: Complex; direction: Complex };

export type MobiusCurveMapped =
  | { kind: "circle"; center: Complex; radius: number; segments: Complex[][] }
  | { kind: "line"; point: Complex; direction: Complex; segments: Complex[][] }
  | { kind: "degenerate"; reason: string; segments: Complex[][] };

export type MobiusMappedGridLine = {
  z: Complex[];
  wSegments: Complex[][];
};

export type MobiusMappedGrid = {
  horizontals: MobiusMappedGridLine[];
  verticals: MobiusMappedGridLine[];
};

const DEFAULT_EPS = 1e-12;

const cNeg = (z: Complex): Complex => C(-z.re, -z.im);
const cAbs = (z: Complex): number => Math.hypot(z.re, z.im);
const cCross = (a: Complex, b: Complex): number => a.re * b.im - a.im * b.re;
const cNormalize = (z: Complex): Complex => {
  const n = cAbs(z);
  if (n < DEFAULT_EPS) return C(1, 0);
  return C(z.re / n, z.im / n);
};

export function mobiusDeterminant(p: MobiusParams): Complex {
  return sub(mul(p.a, p.d), mul(p.b, p.c));
}

export function isMobiusValid(p: MobiusParams, eps = DEFAULT_EPS): boolean {
  return abs2(mobiusDeterminant(p)) >= eps;
}

export function mobiusPole(p: MobiusParams, eps = DEFAULT_EPS): Complex | null {
  if (abs2(p.c) < eps) return null;
  return cNeg(div(p.d, p.c));
}

export function mobiusImageOfInfinity(p: MobiusParams, eps = DEFAULT_EPS): Complex | null {
  if (abs2(p.c) < eps) return null;
  return div(p.a, p.c);
}

export function mobiusEval(z: Complex, p: MobiusParams, eps = DEFAULT_EPS): Complex | null {
  const denom = add(mul(p.c, z), p.d);
  if (abs2(denom) < eps) return null;
  const num = add(mul(p.a, z), p.b);
  const w = div(num, denom);
  return isFiniteC(w) ? w : null;
}

export function mobiusSafe(z: Complex, p: MobiusParams): Complex {
  const out = mobiusEval(z, p);
  return out ?? C(NaN, NaN);
}

export function mapMobiusPoint(z: Complex, p: MobiusParams, eps = DEFAULT_EPS): Complex | null {
  return mobiusEval(z, p, eps);
}

export function mapMobiusPoints(points: Complex[], p: MobiusParams, eps = DEFAULT_EPS): Array<Complex | null> {
  return points.map((z) => mobiusEval(z, p, eps));
}

export function mobiusFixedPoints(p: MobiusParams, eps = DEFAULT_EPS): MobiusFixedPoints {
  const A = p.a;
  const B = p.b;
  const Cc = p.c;
  const D = p.d;
  if (abs2(Cc) < eps) {
    const denom = sub(A, D);
    if (abs2(denom) < eps) {
      if (abs2(B) < eps) return { kind: "all", values: [] };
      return { kind: "none", values: [] };
    }
    return { kind: "single", values: [div(cNeg(B), denom)] };
  }
  const linear = sub(D, A);
  const disc = add(mul(linear, linear), mul(C(4, 0), mul(Cc, B)));
  const sqrtDisc = sqrt(disc);
  const twoC = mul(C(2, 0), Cc);
  return {
    kind: "pair",
    values: [div(add(cNeg(linear), sqrtDisc), twoC), div(sub(cNeg(linear), sqrtDisc), twoC)],
  };
}

export function classifyMobiusBasic(p: MobiusParams, eps = DEFAULT_EPS): MobiusBasicClassification {
  const determinant = mobiusDeterminant(p);
  const determinantAbs = Math.sqrt(abs2(determinant));
  const valid = determinantAbs >= eps;
  const affine = abs2(p.c) < eps;
  const fixed = mobiusFixedPoints(p, eps);
  const pole = mobiusPole(p, eps);
  let kind: MobiusBasicClassification["kind"] = "general";

  if (!valid) {
    kind = "singular";
  } else if (affine) {
    const denom = abs2(p.d) < eps ? C(1, 0) : p.d;
    const alpha = div(p.a, denom);
    const beta = div(p.b, denom);
    if (cAbs(sub(alpha, C(1, 0))) < 1e-8 && cAbs(beta) < 1e-8) kind = "identity";
    else if (cAbs(sub(alpha, C(1, 0))) < 1e-8) kind = "translation";
    else kind = "affine";
  } else if (abs2(p.a) < eps && abs2(p.d) < eps) {
    kind = "inversionLike";
  }

  return { kind, valid, affine, determinant, determinantAbs, pole, fixed };
}

export function mapMobiusPolylineSegments(
  polyline: Complex[],
  p: MobiusParams,
  opts?: { eps?: number; clipAbs?: number }
): Complex[][] {
  const eps = opts?.eps ?? DEFAULT_EPS;
  const clipAbs = opts?.clipAbs ?? Infinity;
  const segments: Complex[][] = [];
  let current: Complex[] = [];
  for (const z of polyline) {
    const w = mobiusEval(z, p, eps);
    const ok = !!w && isFiniteC(w) && cAbs(w) <= clipAbs;
    if (ok && w) {
      current.push(w);
    } else if (current.length >= 2) {
      segments.push(current);
      current = [];
    } else {
      current = [];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

const buildCirclePolyline = (center: Complex, radius: number, samples = 240): Complex[] => {
  const pts: Complex[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (2 * Math.PI * i) / samples;
    pts.push(C(center.re + radius * Math.cos(t), center.im + radius * Math.sin(t)));
  }
  return pts;
};

const buildLinePolyline = (point: Complex, direction: Complex, tMin: number, tMax: number, samples = 240): Complex[] => {
  const pts: Complex[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const t = tMin + (tMax - tMin) * u;
    pts.push(C(point.re + direction.re * t, point.im + direction.im * t));
  }
  return pts;
};

const isPointOnInputCurve = (z: Complex, curve: MobiusCurveInput, eps = 1e-8): boolean => {
  if (curve.kind === "circle") {
    return Math.abs(cAbs(sub(z, curve.center)) - curve.radius) <= eps;
  }
  const d = curve.direction;
  const v = sub(z, curve.point);
  const den = cAbs(d);
  if (den < DEFAULT_EPS) return false;
  return Math.abs(cCross(v, d) / den) <= eps;
};

const fitLineFromPoints = (points: Complex[]): { point: Complex; direction: Complex } | null => {
  if (points.length < 2) return null;
  let iBest = 0;
  let jBest = 1;
  let bestD2 = abs2(sub(points[1], points[0]));
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d2 = abs2(sub(points[j], points[i]));
      if (d2 > bestD2) {
        bestD2 = d2;
        iBest = i;
        jBest = j;
      }
    }
  }
  const p0 = points[iBest];
  const p1 = points[jBest];
  const dir = sub(p1, p0);
  if (cAbs(dir) < DEFAULT_EPS) return null;
  return { point: p0, direction: cNormalize(dir) };
};

const pointsNearlyCollinear = (points: Complex[], eps = 1e-4): boolean => {
  if (points.length < 3) return true;
  const a = points[0];
  const b = points[points.length - 1];
  const ab = sub(b, a);
  const den = cAbs(ab);
  if (den < DEFAULT_EPS) return true;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const ap = sub(points[i], a);
    maxDist = Math.max(maxDist, Math.abs(cCross(ap, ab)) / den);
  }
  return maxDist <= eps;
};

const fitCircleFromThreePoints = (p1: Complex, p2: Complex, p3: Complex): { center: Complex; radius: number } | null => {
  const x1 = p1.re; const y1 = p1.im;
  const x2 = p2.re; const y2 = p2.im;
  const x3 = p3.re; const y3 = p3.im;
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-12) return null;
  const x1s = x1 * x1 + y1 * y1;
  const x2s = x2 * x2 + y2 * y2;
  const x3s = x3 * x3 + y3 * y3;
  const ux = (x1s * (y2 - y3) + x2s * (y3 - y1) + x3s * (y1 - y2)) / d;
  const uy = (x1s * (x3 - x2) + x2s * (x1 - x3) + x3s * (x2 - x1)) / d;
  const center = C(ux, uy);
  const radius = cAbs(sub(p1, center));
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return { center, radius };
};

export function mapMobiusCircleOrLine(
  curve: MobiusCurveInput,
  p: MobiusParams,
  opts?: { samples?: number; lineExtent?: number; clipAbs?: number; eps?: number }
): MobiusCurveMapped {
  const samples = Math.max(24, Math.round(opts?.samples ?? 240));
  const lineExtent = Math.max(0.5, opts?.lineExtent ?? 3);
  const eps = opts?.eps ?? DEFAULT_EPS;
  const zPolyline =
    curve.kind === "circle"
      ? buildCirclePolyline(curve.center, Math.max(1e-9, curve.radius), samples)
      : buildLinePolyline(curve.point, cNormalize(curve.direction), -lineExtent, lineExtent, samples);
  const segments = mapMobiusPolylineSegments(zPolyline, p, { eps, clipAbs: opts?.clipAbs });
  const flat = segments.flat();
  if (flat.length < 2) {
    return { kind: "degenerate", reason: "insufficient mapped samples", segments };
  }

  const pole = mobiusPole(p, eps);
  const throughPole = pole ? isPointOnInputCurve(pole, curve, 1e-6) : false;
  if (throughPole || pointsNearlyCollinear(flat)) {
    const line = fitLineFromPoints(flat);
    if (!line) return { kind: "degenerate", reason: "line fit failed", segments };
    return { kind: "line", point: line.point, direction: line.direction, segments };
  }

  const n = flat.length;
  const p1 = flat[0];
  const p2 = flat[Math.floor(n * 0.5)];
  const p3 = flat[n - 1];
  const circle = fitCircleFromThreePoints(p1, p2, p3)
    ?? fitCircleFromThreePoints(flat[Math.floor(n * 0.2)], flat[Math.floor(n * 0.5)], flat[Math.floor(n * 0.8)]);
  if (!circle) {
    const line = fitLineFromPoints(flat);
    if (!line) return { kind: "degenerate", reason: "circle fit failed", segments };
    return { kind: "line", point: line.point, direction: line.direction, segments };
  }
  return { kind: "circle", center: circle.center, radius: circle.radius, segments };
}

export function mapMobiusGrid(
  p: MobiusParams,
  opts?: { extent?: number; step?: number; samplesPerLine?: number; clipAbs?: number; eps?: number }
): MobiusMappedGrid {
  const extent = Math.max(0.5, opts?.extent ?? 3);
  const step = Math.max(0.1, opts?.step ?? 0.5);
  const samplesPerLine = Math.max(16, Math.round(opts?.samplesPerLine ?? 240));
  const values: number[] = [];
  for (let v = -extent; v <= extent + 1e-9; v += step) values.push(Number(v.toFixed(10)));

  const horizontals: MobiusMappedGridLine[] = [];
  const verticals: MobiusMappedGridLine[] = [];

  for (const y0 of values) {
    const z = buildLinePolyline(C(0, y0), C(1, 0), -extent, extent, samplesPerLine);
    const wSegments = mapMobiusPolylineSegments(z, p, { eps: opts?.eps, clipAbs: opts?.clipAbs });
    horizontals.push({ z, wSegments });
  }
  for (const x0 of values) {
    const z = buildLinePolyline(C(x0, 0), C(0, 1), -extent, extent, samplesPerLine);
    const wSegments = mapMobiusPolylineSegments(z, p, { eps: opts?.eps, clipAbs: opts?.clipAbs });
    verticals.push({ z, wSegments });
  }

  return { horizontals, verticals };
}
