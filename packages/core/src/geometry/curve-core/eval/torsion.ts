import type { Curve3D } from "../model/Curve3D";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";
import { thirdDerivative } from "./thirdDerivative";
import { crossPoint3 } from "../utils/vector";

export const torsion = (curve: Curve3D, t: number, stepScale = 1e-3): number => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const span = Math.max(1e-9, curve.domain.tMax - curve.domain.tMin);
  const step = Math.max(1e-8, span * stepScale);
  const d3 = thirdDerivative(curve, t, { step });
  const cross = crossPoint3(d1, d2);
  const crossLenSq = cross.x * cross.x + cross.y * cross.y + cross.z * cross.z;
  if (crossLenSq <= 1e-12) return 0;
  const triple = cross.x * d3.x + cross.y * d3.y + cross.z * d3.z;
  return triple / crossLenSq;
};
