export * from "./Curve";
export * from "./Curve2D";
export * from "./Curve3D";
export * from "./CurveDomain";
export * from "./CurveEvalResult";

import type { Curve2D } from "./Curve2D";
import type { Curve3D } from "./Curve3D";

export type AnyCurve = Curve2D | Curve3D;

