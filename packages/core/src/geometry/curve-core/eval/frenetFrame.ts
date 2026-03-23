import type { Vec3 } from "../../../math";
import type { Curve3D } from "../model/Curve3D";
import { curvature3D } from "./curvature";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";
import { torsion } from "./torsion";
import { crossPoint3, normalizePoint } from "../utils/vector";

export type FrenetFrame = {
  tangent: Vec3;
  normal: Vec3;
  binormal: Vec3;
  curvature: number;
  torsion: number;
};

const fallbackPerpendicular = (tangent: Vec3): Vec3 => {
  const up = Math.abs(tangent.z) < 0.9 ? ({ x: 0, y: 0, z: 1 } as Vec3) : ({ x: 0, y: 1, z: 0 } as Vec3);
  return normalizePoint(crossPoint3(up, tangent));
};

export const frenetFrame = (curve: Curve3D, t: number): FrenetFrame => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const tangent = normalizePoint(d1);
  let binormal = normalizePoint(crossPoint3(d1, d2));
  if (Math.hypot(binormal.x, binormal.y, binormal.z) <= 1e-9) {
    const normalFallback = fallbackPerpendicular(tangent);
    binormal = normalizePoint(crossPoint3(tangent, normalFallback));
  }
  const normal = normalizePoint(crossPoint3(binormal, tangent));
  return {
    tangent,
    normal,
    binormal,
    curvature: curvature3D(curve, t),
    torsion: torsion(curve, t),
  };
};

