import type { AnyCurve, CurvePoint } from "../model";
import { isCurveDomain } from "../model";
import { finitePoint } from "./vector";

const validId = (value: string): boolean => value.trim().length > 0;

const closeEnough = (a: CurvePoint, b: CurvePoint, tolerance: number): boolean => {
  if (Math.abs(a.x - b.x) > tolerance) return false;
  if (Math.abs(a.y - b.y) > tolerance) return false;
  if ("z" in a || "z" in b) {
    const az = "z" in a ? a.z : 0;
    const bz = "z" in b ? b.z : 0;
    if (Math.abs(az - bz) > tolerance) return false;
  }
  return true;
};

export const validateCurve = (curve: AnyCurve, tolerance = 1e-6): string[] => {
  const errors: string[] = [];
  if (!validId(curve.id)) errors.push("curve.id must be a non-empty string.");
  if (!validId(curve.name)) errors.push("curve.name must be a non-empty string.");
  if (!isCurveDomain(curve.domain)) {
    errors.push("curve.domain is invalid; require finite tMin, tMax, and tMax > tMin.");
    return errors;
  }

  const start = curve.eval(curve.domain.tMin);
  const end = curve.eval(curve.domain.tMax);
  if (!finitePoint(start)) errors.push("curve.eval(tMin) returned non-finite coordinates.");
  if (!finitePoint(end)) errors.push("curve.eval(tMax) returned non-finite coordinates.");

  if (curve.derivative) {
    const dMid = curve.derivative(0.5 * (curve.domain.tMin + curve.domain.tMax));
    if (!finitePoint(dMid)) errors.push("curve.derivative(t) returned non-finite coordinates.");
  }
  if (curve.secondDerivative) {
    const d2Mid = curve.secondDerivative(0.5 * (curve.domain.tMin + curve.domain.tMax));
    if (!finitePoint(d2Mid)) errors.push("curve.secondDerivative(t) returned non-finite coordinates.");
  }
  if (curve.domain.closed && finitePoint(start) && finitePoint(end) && !closeEnough(start, end, tolerance)) {
    errors.push("curve.domain.closed is true but endpoints are not coincident within tolerance.");
  }

  return errors;
};

export const isValidCurve = (curve: AnyCurve, tolerance = 1e-6): boolean => {
  return validateCurve(curve, tolerance).length === 0;
};

