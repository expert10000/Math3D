import type { AnyCurve, CurveEvalResult, CurvePoint } from "../model";
import { clampToDomain } from "../utils/reparameterization";
import { distancePoint, lerpPoint } from "../utils/vector";

export type AdaptiveSamplingOptions = {
  tolerance?: number;
  maxDepth?: number;
};

const recurseAdaptive = (
  curve: AnyCurve,
  a: CurveEvalResult,
  b: CurveEvalResult,
  depth: number,
  tolerance: number,
  maxDepth: number,
  out: CurveEvalResult[]
): void => {
  const tm = 0.5 * (a.t + b.t);
  const pm = curve.eval(clampToDomain(curve, tm));
  const linearMid = lerpPoint(a.point, b.point, 0.5);
  const err = distancePoint(pm, linearMid);
  if (depth >= maxDepth || err <= tolerance) {
    out.push(b);
    return;
  }

  const left: CurveEvalResult = { t: tm, point: pm };
  recurseAdaptive(curve, a, left, depth + 1, tolerance, maxDepth, out);
  recurseAdaptive(curve, left, b, depth + 1, tolerance, maxDepth, out);
};

export const sampleAdaptive = (curve: AnyCurve, options: AdaptiveSamplingOptions = {}): CurveEvalResult[] => {
  const tolerance = Math.max(1e-9, options.tolerance ?? 1e-3);
  const maxDepth = Math.max(1, Math.floor(options.maxDepth ?? 12));
  const start: CurveEvalResult = { t: curve.domain.tMin, point: curve.eval(curve.domain.tMin) };
  const end: CurveEvalResult = { t: curve.domain.tMax, point: curve.eval(curve.domain.tMax) };
  const out: CurveEvalResult[] = [start];
  recurseAdaptive(curve, start, end, 0, tolerance, maxDepth, out);
  return out;
};

export const adaptiveSamplesToRenderPoints = <TPoint extends CurvePoint>(samples: CurveEvalResult[]): TPoint[] => {
  return samples.map((row) => row.point as TPoint);
};

