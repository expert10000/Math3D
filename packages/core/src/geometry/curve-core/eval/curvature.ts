import type { Curve2D } from "../model/Curve2D";
import type { Curve3D } from "../model/Curve3D";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";
import { crossPoint3, lengthPoint } from "../utils/vector";

export const curvature2D = (curve: Curve2D, t: number): number => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const num = Math.abs(d1.x * d2.y - d1.y * d2.x);
  const den = Math.pow(Math.max(1e-12, d1.x * d1.x + d1.y * d1.y), 1.5);
  return num / den;
};

export const curvature3D = (curve: Curve3D, t: number): number => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const cross = crossPoint3(d1, d2);
  const num = Math.hypot(cross.x, cross.y, cross.z);
  const den = Math.pow(Math.max(1e-12, lengthPoint(d1)), 3);
  return num / den;
};

export const curvature = (curve: Curve2D | Curve3D, t: number): number => {
  if (curve.dimension === 2) return curvature2D(curve, t);
  return curvature3D(curve, t);
};

