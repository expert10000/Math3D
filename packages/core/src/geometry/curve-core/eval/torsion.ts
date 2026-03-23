import type { Vec3 } from "../../../math";
import type { Curve3D } from "../model/Curve3D";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";
import { clampToDomain } from "../utils/reparameterization";
import { crossPoint3 } from "../utils/vector";

const thirdDerivative = (curve: Curve3D, t: number, step: number): Vec3 => {
  const t0 = clampToDomain(curve, t - step);
  const t1 = clampToDomain(curve, t + step);
  const d20 = secondDerivative(curve, t0);
  const d21 = secondDerivative(curve, t1);
  const h = Math.max(1e-12, t1 - t0);
  return {
    x: (d21.x - d20.x) / h,
    y: (d21.y - d20.y) / h,
    z: (d21.z - d20.z) / h,
  };
};

export const torsion = (curve: Curve3D, t: number, stepScale = 1e-3): number => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const span = Math.max(1e-9, curve.domain.tMax - curve.domain.tMin);
  const step = Math.max(1e-8, span * stepScale);
  const d3 = thirdDerivative(curve, t, step);
  const cross = crossPoint3(d1, d2);
  const crossLenSq = cross.x * cross.x + cross.y * cross.y + cross.z * cross.z;
  if (crossLenSq <= 1e-12) return 0;
  const triple = cross.x * d3.x + cross.y * d3.y + cross.z * d3.z;
  return triple / crossLenSq;
};

