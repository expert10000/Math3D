import type { Vec3 } from "../../../math";
import type { Curve3D } from "../model/Curve3D";
import { curvature3D } from "./curvature";
import { derivative } from "./derivative";
import { secondDerivative } from "./secondDerivative";
import { torsion } from "./torsion";
import { crossPoint3, normalizePoint } from "../utils/vector";

export type FrenetFrame = {
  tangent: Vec3;
  normal: Vec3 | null;
  binormal: Vec3 | null;
  curvature: number;
  torsion: number | null;
  defined: boolean;
};

export const frenetFrame = (curve: Curve3D, t: number): FrenetFrame => {
  const d1 = derivative(curve, t);
  const d2 = secondDerivative(curve, t);
  const tangent = normalizePoint(d1);
  const cross = crossPoint3(d1, d2);
  const defined = Math.hypot(cross.x, cross.y, cross.z) > 1e-9;
  const binormal = defined ? normalizePoint(cross) : null;
  const normal = binormal ? normalizePoint(crossPoint3(binormal, tangent)) : null;
  return {
    tangent,
    normal,
    binormal,
    curvature: curvature3D(curve, t),
    torsion: defined ? torsion(curve, t) : null,
    defined,
  };
};
